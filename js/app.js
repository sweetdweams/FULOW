const { page } = document.body.dataset;
const ROOT = page === 'home' ? '' : '../';
const DATA = {
  predictions: `${ROOT}data/predictions.json`,
  comparisons: `${ROOT}data/comparisons.json`,
  teams: `${ROOT}data/teams.json`,
  ratings: `${ROOT}data/ratings.json`,
  performance: `${ROOT}data/performance.json`,
  performanceHistory: `${ROOT}data/performance_history.json`,
  ratingHistory: `${ROOT}data/rating_history.json`,
  predictionHistory: `${ROOT}data/prediction_history.json`,
  teamSustainability: `${ROOT}data/team_sustainability.json`
};

const cache = {};

async function load(name) {
  if (!cache[name]) {
    const response = await fetch(`${DATA[name]}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`${name}.json konnte nicht geladen werden`);
    cache[name] = await response.json();
  }
  return cache[name];
}

const percent = value => `${(Number(value) * 100).toFixed(1)}%`;
const formatPercentage = value => {
  const percentage = Number(value) * 100;
  if (percentage < 0.01) return '<0.01%';
  if (percentage > 99.99) return '>99.99%';
  return `${percentage.toFixed(2)}%`;
};
const probabilityPercent = formatPercentage;
const dateLabel = value => value || 'Datum nicht veröffentlicht';
const technicalDateLabel = value => {
  if (typeof value !== 'string') return dateLabel(value);
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return dateLabel(value);
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(timestamp);
};
const phaseLabel = value => {
  if (!value) return 'Phase nicht veröffentlicht';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
};
const matchContextLabel = match => {
  const matchday = match.matchday ? `Matchday ${match.matchday}` : 'Matchday -';
  return `${phaseLabel(match.phase)} · ${matchday}`;
};
const element = (tag, { className, text, attributes = {}, style = {} } = {}, children = []) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  Object.assign(node.style, style);
  node.append(...children.filter(Boolean));
  return node;
};
const svgElement = (tag, options = {}, children = []) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  const { className, text, attributes = {}, style = {} } = options;
  if (className) node.setAttribute('class', className);
  if (text !== undefined) node.textContent = String(text);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  Object.assign(node.style, style);
  node.append(...children.filter(Boolean));
  return node;
};
const replaceChildren = (target, children) => target.replaceChildren(...children);
const emptyState = text => element('p', { className: 'empty-state', text });
const boundedPercent = value => `${Math.max(0, Math.min(100, Number(value) * 100 || 0))}%`;
const teamAbbreviation = team => team?.abbreviation || '-';

function currentLeagueThresholds(teamsData, performanceHistory) {
  const fallback = teamsData?.league_thresholds || {};
  const thresholds = currentCrosszoneEntry(teamsData, performanceHistory)?.crossover_zones;

  return {
    '1_2': Number.isFinite(Number(thresholds?.['1_2']?.rating)) ? Number(thresholds['1_2'].rating) : Number(fallback['1_2']),
    '2_3': Number.isFinite(Number(thresholds?.['2_3']?.rating)) ? Number(thresholds['2_3'].rating) : Number(fallback['2_3']),
    '3_4': Number.isFinite(Number(thresholds?.['3_4']?.rating)) ? Number(thresholds['3_4'].rating) : Number(fallback['3_4'])
  };
}

function currentCrosszoneEntry(teamsData, performanceHistory) {
  const currentSeason = teamsData?.season;
  const historyEntries = performanceHistory?.history || [];
  const currentEntries = historyEntries.filter(entry => entry.season === currentSeason);
  return currentEntries.length ? currentEntries[currentEntries.length - 1] : null;
}

function currentLeagueSigmas(teamsData, performanceHistory) {
  const zones = currentCrosszoneEntry(teamsData, performanceHistory)?.crossover_zones || {};
  return {
    '1_2': Number.isFinite(Number(zones['1_2']?.sigma)) ? Number(zones['1_2'].sigma) : 200,
    '2_3': Number.isFinite(Number(zones['2_3']?.sigma)) ? Number(zones['2_3'].sigma) : 200,
    '3_4': Number.isFinite(Number(zones['3_4']?.sigma)) ? Number(zones['3_4'].sigma) : 200
  };
}

function predictedSustainableLevel(team) {
  return team?.predicted_league || '—';
}

const SUN_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function teamLink(id, name, className = 'team-link') {
  if (!id) return element('span', { className, text: name });
  return element('a', { className, text: name, attributes: { href: `${ROOT}teams/team_detail.html?id=${encodeURIComponent(id)}` } });
}

function computeTeamTrends(teams, ratingHistory) {
  const historyByTeam = {};
  if (ratingHistory?.history) {
    ratingHistory.history.forEach(entry => {
      if (!historyByTeam[entry.team_id]) historyByTeam[entry.team_id] = [];
      historyByTeam[entry.team_id].push(entry);
    });
  }

  const sortedCurrent = [...teams].sort((a, b) => b.rating - a.rating);
  const currentRankMap = {};
  sortedCurrent.forEach((t, i) => { currentRankMap[t.id] = i + 1; });

  const previousTeams = teams.map(t => {
    const hist = historyByTeam[t.id] || [];
    const prevRating = hist.length >= 2 ? hist[hist.length - 2].rating : (t.initial_rating || t.rating);
    return { id: t.id, rating: prevRating };
  });

  const sortedPrevious = [...previousTeams].sort((a, b) => b.rating - a.rating);
  const previousRankMap = {};
  sortedPrevious.forEach((t, i) => { previousRankMap[t.id] = i + 1; });

  const trends = {};
  teams.forEach(t => {
    const cRank = currentRankMap[t.id];
    const pRank = previousRankMap[t.id];
    const rankDiff = pRank - cRank;

    const hist = historyByTeam[t.id] || [];
    const pRating = hist.length >= 2 ? hist[hist.length - 2].rating : (t.initial_rating || t.rating);
    const ratingDiff = Math.round(t.rating - pRating);

    trends[t.id] = { rankDiff, ratingDiff, cRank, pRank };
  });

  return trends;
}

function renderTrendBadge(trend) {
  if (!trend) return element('span', { className: 'trend-same', text: '=' });
  const { rankDiff, ratingDiff } = trend;
  if (rankDiff > 0) {
    return element('span', { className: 'trend-up', text: `↑ +${rankDiff}`, attributes: { title: `Rating-Zuwachs: +${ratingDiff}` } });
  } else if (rankDiff < 0) {
    return element('span', { className: 'trend-down', text: `↓ ${rankDiff}`, attributes: { title: `Rating-Änderung: ${rankDiff}` } });
  } else {
    const sign = ratingDiff > 0 ? '+' : '';
    return element('span', { className: 'trend-same', text: '=', attributes: { title: `Rating-Änderung: ${sign}${ratingDiff}` } });
  }
}

function parseChangelog(text) {
  const releases = [];
  let release;
  text.split(/\r?\n/).forEach(line => {
    const releaseMatch = line.match(/^(\S+)\s+--\s+(.+)$/);
    if (releaseMatch) {
      release = { version: releaseMatch[1], date: releaseMatch[2], changes: [] };
      releases.push(release);
      return;
    }

    const changeMatch = line.match(/^(\s*)-\s+(.+)$/);
    if (release && changeMatch) {
      release.changes.push({ indent: changeMatch[1].length, text: changeMatch[2] });
    }
  });
  return releases;
}

async function changelogPage() {
  const target = document.querySelector('#changelog-list');
  if (!target) return;

  const response = await fetch(`${ROOT}resources/change.log?v=${Date.now()}`);
  if (!response.ok) throw new Error('change.log konnte nicht geladen werden');

  const releases = parseChangelog(await response.text());
  if (!releases.length) {
    target.replaceChildren(emptyState('Noch keine Änderungen veröffentlicht.'));
    return;
  }

  target.replaceChildren(...releases.map((release, index) => {
    const list = element('ul', { className: 'changelog-changes' });
    const listStack = [{ indent: -1, list }];
    release.changes.forEach((change, changeIndex) => {
      while (listStack.length > 1 && change.indent <= listStack[listStack.length - 1].indent) {
        listStack.pop();
      }

      const item = element('li', { text: change.text });
      listStack[listStack.length - 1].list.append(item);
      const nextChange = release.changes[changeIndex + 1];
      if (nextChange && nextChange.indent > change.indent) {
        const nestedList = element('ul', { className: 'changelog-changes' });
        item.append(nestedList);
        listStack.push({ indent: change.indent, list: nestedList });
      }
    });

    return element('article', {
      className: `changelog-release${index === 0 ? ' is-latest' : ''}`,
      attributes: { 'aria-labelledby': `release-${index}` }
    }, [
      element('header', { className: 'changelog-release-header' }, [
        element('div', {}, [
          element('p', { className: 'eyebrow', text: index === 0 ? 'LATEST RELEASE' : 'RELEASE' }),
          element('h2', { attributes: { id: `release-${index}` }, text: release.version })
        ]),
        element('time', { className: 'changelog-release-date', text: release.date })
      ]),
      list
    ]);
  }));
}

function getConfidenceInfo(confVal) {
  const val = Number(confVal);
  const pct = formatPercentage(val);
  let level = 'Niedrig';
  let className = 'low';
  if (val >= 0.7) { level = 'Hoch'; className = 'high'; }
  else if (val >= 0.4) { level = 'Mittel'; className = 'medium'; }
  return { label: `${level} (${pct})`, level, pct, className };
}

function heroMatchCard(match) {
  if (!match) return emptyState('Keine Vorhersagen für kommende Spiele veröffentlicht.');

  const probA = probabilityPercent(match.probability_a);
  const probB = probabilityPercent(match.probability_b);
  const isWinnerA = Number(match.probability_a) >= Number(match.probability_b);
  const winnerObj = isWinnerA ? match.team_a : match.team_b;
  const winnerClass = isWinnerA ? 'team-link team-link-a' : 'team-link team-link-b';
  const conf = getConfidenceInfo(match.confidence);

  return element('article', { className: 'featured-match-card' }, [
    element('div', { className: 'featured-card-top-title', text: 'HERVORGEHOBENES SPIEL' }),
    element('div', { className: 'featured-match-header' }, [
      element('span', { text: dateLabel(match.date) }),
      element('span', { text: `${match.league || 'Liga'} · Matchday ${match.id || match.matchday || '-'} · ${match.phase || 'Phase'}` })
    ]),
    element('div', { className: 'featured-match-teams' }, [
      element('div', { className: 'hero-team hero-team-a' }, [
        teamLink(match.team_a.id, match.team_a.name, 'hero-team-name team-link team-link-a'),
        element('span', { className: 'hero-team-prob team-a-prob', text: probA })
      ]),
      element('span', { className: 'hero-vs', text: 'GEGEN' }),
      element('div', { className: 'hero-team hero-team-b' }, [
        teamLink(match.team_b.id, match.team_b.name, 'hero-team-name team-link team-link-b'),
        element('span', { className: 'hero-team-prob team-b-prob', text: probB })
      ])
    ]),
    element('div', { className: 'prob-bar-track', attributes: { 'aria-label': `Siegwahrscheinlichkeiten: ${match.team_a.name} ${probA}, ${match.team_b.name} ${probB}` } }, [
      element('i', { className: 'prob-bar-fill-a', style: { width: boundedPercent(match.probability_a) } })
    ]),
    element('div', { className: 'featured-footer-single-line' }, [
      element('span', {}, [
        element('span', { className: 'muted', text: 'Prognostizierter Sieger: ' }),
        teamLink(winnerObj.id, winnerObj.name, winnerClass)
      ]),
      element('span', { className: 'confidence-text', text: `Confidence: ${conf.label}` })
    ])
  ]);
}

function performanceChart(periods) {
  if (!periods?.length) return emptyState('Keine Accuracy-Daten verfügbar.');

  const width = 760;
  const height = 250;
  const padding = { top: 20, right: 24, bottom: 48, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const labels = { all_time: 'Gesamt', last_20: '20 zuletzt', last_50: '50 zuletzt' };
  const points = periods.map((period, index) => {
    const value = Math.max(0, Math.min(1, Number(period.accuracy) || 0));
    return {
      value,
      x: padding.left + (index / Math.max(periods.length - 1, 1)) * plotWidth,
      y: padding.top + (1 - value) * plotHeight,
      label: labels[period.id] || period.label || '-'
    };
  });
  const line = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `${padding.left},${height - padding.bottom} ${line} ${points.at(-1).x},${height - padding.bottom}`;
  const svg = svgElement('svg', {
    className: 'accuracy-chart',
    attributes: { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'accuracy-chart-title' }
  });

  svg.append(element('title', { attributes: { id: 'accuracy-chart-title' }, text: 'Trefferquote nach Auswertungszeitraum' }));
  [0, 0.5, 1].forEach(value => {
    const y = padding.top + (1 - value) * plotHeight;
    svg.append(element('line', { className: 'chart-gridline', attributes: { x1: padding.left, x2: width - padding.right, y1: y, y2: y } }));
    svg.append(element('text', { className: 'chart-axis-label', attributes: { x: 0, y: y + 4 }, text: `${Math.round(value * 100)}%` }));
  });
  svg.append(element('polygon', { className: 'chart-area', attributes: { points: area } }));
  svg.append(element('polyline', { className: 'chart-line', attributes: { points: line } }));
  points.forEach(point => {
    svg.append(element('circle', { className: 'chart-point', attributes: { cx: point.x, cy: point.y, r: 4 } }));
    svg.append(element('text', { className: 'chart-x-label', attributes: { x: point.x, y: height - 14, 'text-anchor': 'middle' }, text: point.label }));
  });
  return svg;
}

function historicalPerformanceCharts(history) {
  if (!history.length) {
    return emptyState('Keine historischen Analytics-Daten verfügbar.');
  }

  const calculateChartAxis = (values, ratingAxis) => {
    const finiteValues = values.filter(Number.isFinite);
    const rawMinimum = Math.min(...finiteValues);
    const rawMaximum = Math.max(...finiteValues);
    const rawRange = rawMaximum - rawMinimum;
    const minimumPadding = ratingAxis ? 50 : 0.01;
    const padding = Math.max(rawRange * 0.1, minimumPadding);
    const paddedRange = Math.max(rawRange + padding * 2, minimumPadding * 2);
    const roughTickStep = paddedRange / 10;
    const tickMagnitude = 10 ** Math.floor(Math.log10(Math.max(roughTickStep, Number.EPSILON)));
    const normalizedTickStep = roughTickStep / tickMagnitude;
    const tickFactor = normalizedTickStep <= 1
      ? 1
      : normalizedTickStep <= 2
        ? 2
        : normalizedTickStep <= 5
          ? 5
          : 10;
    const tickStep = tickFactor * tickMagnitude;
    const calculatedMinimum = Math.floor((rawMinimum - padding) / tickStep) * tickStep;
    const calculatedMaximum = Math.max(
      Math.ceil((rawMaximum + padding) / tickStep) * tickStep,
      calculatedMinimum + tickStep
    );
    const minimum = ratingAxis ? calculatedMinimum : Math.max(0, calculatedMinimum);
    const maximum = ratingAxis ? calculatedMaximum : Math.min(1, calculatedMaximum);
    const ticks = [];
    for (let value = minimum; value <= maximum + tickStep * 0.001; value += tickStep) {
      ticks.push(value);
    }
    if (ticks.length < 2) {
      ticks.push(Math.min(1, minimum + tickStep));
    }
    return {
      minimum,
      maximum,
      ticks,
      decimals: ratingAxis
        ? 0
        : Math.min(6, Math.max(2, Math.ceil(-Math.log10(tickStep)) + 1))
    };
  };

  const colors = {
    accuracy: '#2563EB',
    log_loss: '#F97316',
    brier_score: '#14B8A6',
    calibration_error: '#A855F7',
    '1_2': '#DC2626',
    '2_3': '#D97706',
    '3_4': '#16A34A'
  };
  const labels = {
    accuracy: 'Accuracy',
    log_loss: 'Log Loss',
    brier_score: 'Brier Score',
    calibration_error: 'Calibration Error',
    '1_2': '1 ↔ 2 Liga (Rating)',
    '2_3': '2 ↔ 3 Liga (Rating)',
    '3_4': '3 ↔ 4 Liga (Rating)'
  };
  const createSeries = ids => ids.map(id => ({
    id,
    values: history.map(point => ({
      date: point.key,
      label: point.label || point.date,
      value: id in point
        ? Number(point[id])
        : point.crossover_zones?.[id]?.rating == null
          ? NaN
          : Number(point.crossover_zones[id].rating)
    }))
  })).filter(item => item.values.some(point => Number.isFinite(point.value)));

  const createChart = (title, ids, ratingAxis) => {
    const series = createSeries(ids);
    const controls = element('div', { className: 'chart-controls' });
    const active = new Set(series.map(item => item.id));
    const chartTarget = element('div', { className: 'historical-chart-target' });
    const dates = history.map(point => point.key);
    const render = () => {
      const selected = series.filter(item => active.has(item.id));
      if (!selected.length) {
        replaceChildren(chartTarget, [emptyState('Mindestens eine Datenreihe auswählen.')]);
        return;
      }
      const dateLabels = new Map(selected.flatMap(item => item.values.map(point => [point.date, point.label || point.date])));
      const values = selected.flatMap(item => item.values.map(point => point.value).filter(Number.isFinite));
      const axis = calculateChartAxis(values, ratingAxis);
      const { minimum, maximum } = axis;
      const width = 900;
      const height = 360;
      const padding = { top: 24, right: 24, bottom: 56, left: 54 };
      const plotHeight = height - padding.top - padding.bottom;
      const x = index => padding.left + (index / Math.max(dates.length - 1, 1)) * (width - padding.left - padding.right);
      const y = value => padding.top + (1 - ((value - minimum) / (maximum - minimum))) * plotHeight;
      const svg = svgElement('svg', {
        className: 'historical-analytics-chart',
        attributes: { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title }
      });
      svg.append(svgElement('title', { text: title }));
      axis.ticks.forEach(axisValue => {
        const yPosition = y(axisValue);
        svg.append(svgElement('line', { className: 'chart-gridline', attributes: { x1: padding.left, x2: width - padding.right, y1: yPosition, y2: yPosition } }));
        svg.append(svgElement('text', {
          className: 'chart-axis-label',
          attributes: { x: 4, y: yPosition + 4 },
          text: ratingAxis ? Math.round(axisValue) : axisValue.toFixed(axis.decimals)
        }));
      });
      dates.forEach((date, index) => {
        if (index === 0 || index === dates.length - 1 || index === Math.floor(dates.length / 2)) {
          svg.append(svgElement('text', { className: 'chart-x-label', attributes: { x: x(index), y: height - 14, 'text-anchor': 'middle' }, text: dateLabels.get(date) || date || '-' }));
        }
      });
      selected.forEach(item => {
        const validValues = item.values.filter(point => Number.isFinite(point.value));
        const points = validValues.map(point => `${x(dates.indexOf(point.date)).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
        svg.append(svgElement('polyline', { className: 'historical-chart-line', attributes: { points }, style: { stroke: colors[item.id], fill: 'none' } }));
        validValues.forEach(point => svg.append(svgElement('circle', {
          className: 'historical-chart-point',
          attributes: { cx: x(dates.indexOf(point.date)), cy: y(point.value), r: 2.8 },
          style: { fill: colors[item.id], stroke: 'var(--panel)' }
        })));
      });
      replaceChildren(chartTarget, [svg]);
    };
    series.forEach(item => {
      const id = `history-series-${item.id}`;
      const input = element('input', { attributes: { id, type: 'checkbox', checked: 'checked' } });
      input.addEventListener('change', () => {
        if (input.checked) active.add(item.id);
        else active.delete(item.id);
        render();
      });
      controls.append(element('label', { className: 'chart-toggle', attributes: { for: id } }, [
        input,
        element('span', { className: 'chart-toggle-swatch', style: { backgroundColor: colors[item.id] } }),
        element('span', { text: labels[item.id] })
      ]));
    });
    render();
    return element('div', { className: 'historical-chart' }, [
      element('h3', { className: 'historical-chart-title', text: title }),
      controls,
      chartTarget
    ]);
  };

  return element('div', { className: 'historical-chart-stack' }, [
    createChart('Historische Performance-Metriken', ['accuracy', 'log_loss', 'brier_score', 'calibration_error'], false),
    createChart('Historische Liga-Crossover-Ratings', ['1_2', '2_3', '3_4'], true)
  ]);
}

function card(match) {
  const probA = probabilityPercent(match.probability_a);
  const probB = probabilityPercent(match.probability_b);
  const isWinnerA = Number(match.probability_a) >= Number(match.probability_b);
  const winnerObj = isWinnerA ? match.team_a : match.team_b;
  const winnerClass = isWinnerA ? 'team-link team-link-a' : 'team-link team-link-b';
  const conf = getConfidenceInfo(match.confidence);

  const probabilityBar = element('div', { className: 'prob-bar-track', attributes: { 'aria-label': `${match.team_a.name} ${probA}, ${match.team_b.name} ${probB}` } }, [
    element('i', { className: 'prob-bar-fill-a', style: { width: boundedPercent(match.probability_a) } })
  ]);

  return element('article', { className: 'prediction-card' }, [
    element('div', { className: 'prediction-meta' }, [
      element('span', { text: dateLabel(match.date) }),
      element('span', { text: `${match.league || 'Liga'} · Matchday ${match.matchday || '-'}` })
    ]),
    element('div', { className: 'teams-line-striped' }, [
      element('div', { className: 'team-stripe team-stripe-a' }, [
        teamLink(match.team_a.id, match.team_a.name, 'team-link team-link-a')
      ]),
      element('span', { className: 'hero-vs', text: 'vs' }),
      element('div', { className: 'team-stripe team-stripe-b' }, [
        teamLink(match.team_b.id, match.team_b.name, 'team-link team-link-b')
      ])
    ]),
    probabilityBar,
    element('div', { className: 'probability-labels' }, [
      element('span', { style: { color: 'var(--blue)', fontWeight: '800' }, text: probA }),
      element('span', { style: { color: '#14B8A6', fontWeight: '800' }, text: probB })
    ]),
    element('div', { className: 'prediction-meta-bottom' }, [
      element('span', {}, [
        element('span', { className: 'muted', text: 'Prognostizierter Sieger: ' }),
        teamLink(winnerObj.id, winnerObj.name, winnerClass)
      ]),
      element('span', { className: 'confidence-text', text: `Confidence: ${conf.label}` })
    ])
  ]);
}

function showError(target, error) { replaceChildren(target, [element('p', { className: 'error', text: `${error.message}. Bitte später erneut versuchen.` })]); }

async function home() {
  const [predictions, teams, performance, predictionHistory, ratingHistory] = await Promise.all([
    load('predictions'),
    load('teams'),
    load('performance'),
    load('predictionHistory').catch(() => ({ history: [] })),
    load('ratingHistory').catch(() => ({ history: [] }))
  ]);

  const homeUpdated = document.querySelector('#home-updated');
  if (homeUpdated) homeUpdated.textContent = technicalDateLabel(predictions.generated_at);

  const trends = computeTeamTrends(teams.teams || [], ratingHistory);
  const teamsById = Object.fromEntries((teams.teams || []).map(team => [team.id, team]));

  // Hero match selection: rank closeness by league, then use the tie-breakers.
  if (predictions.predictions?.length) {
    const leagueModifier = match => {
      const phase = String(match.phase || '').toLowerCase().replace(/[\s-]+/g, '_');
      const leagueNumbers = String(match.league || '').match(/\d+(?:[.,]\d+)?/g) || [];
      const numbers = leagueNumbers.map(value => Number(value.replace(',', '.'))).filter(Number.isFinite);
      if (!numbers.length) return Number.MAX_SAFE_INTEGER;
      if (phase.includes('relegation') && numbers.length > 1) {
        return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      }
      return numbers[0];
    };
    const matchScore = match => {
      const modifier = leagueModifier(match);
      const winChanceDifference = Math.abs(Number(match.probability_a) - Number(match.probability_b));
      return modifier === Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : winChanceDifference / modifier;
    };
    const recordedMatches = match => (
      Number(teamsById[match.team_a?.id]?.matches_played || 0)
      + Number(teamsById[match.team_b?.id]?.matches_played || 0)
    );
    const sortedByScore = [...predictions.predictions].sort((a, b) => {
      const scoreDifference = matchScore(a) - matchScore(b);
      if (scoreDifference !== 0) return scoreDifference;
      const leagueDifference = leagueModifier(a) - leagueModifier(b);
      if (leagueDifference !== 0) return leagueDifference;
      const recordedMatchDifference = recordedMatches(a) - recordedMatches(b);
      if (recordedMatchDifference !== 0) return recordedMatchDifference;
      return String(a.match_id || '').localeCompare(String(b.match_id || ''));
    });
    const heroMatch = sortedByScore[0];
    const heroContainer = document.querySelector('#hero-match-card-container');
    if (heroContainer) replaceChildren(heroContainer, [heroMatchCard(heroMatch)]);
  }

  // Upcoming matches (3 to 6 cards)
  const homePreds = document.querySelector('#home-predictions');
  if (homePreds) {
    const list = predictions.predictions.slice(0, 6);
    replaceChildren(homePreds, list.length ? list.map(card) : [emptyState('Keine veröffentlichten Vorhersagen verfügbar.')]);
  }

  // League Overview aggregation
  const leaguesMap = {};
  teams.teams.forEach(team => {
    const l = team.league || 'Andere';
    if (!leaguesMap[l]) leaguesMap[l] = { name: l, teamsCount: 0, totalMatches: 0 };
    leaguesMap[l].teamsCount++;
    leaguesMap[l].totalMatches += Number(team.matches_played || 0);
  });
  const leaguesList = Object.values(leaguesMap).sort((a, b) => a.name.localeCompare(b.name));
  const homeLeagues = document.querySelector('#home-leagues');
  if (homeLeagues) {
    replaceChildren(homeLeagues, leaguesList.map(l => element('a', { className: 'league-card', attributes: { href: `teams/team_ranking.html?league=${encodeURIComponent(l.name)}` } }, [
      element('h3', { text: l.name }),
      element('div', { className: 'league-stats' }, [
        element('div', {}, [element('strong', { text: l.teamsCount }), element('span', { text: 'Teams' })]),
        element('div', {}, [element('strong', { text: l.totalMatches }), element('span', { text: 'Spiele' })])
      ])
    ])));
  }

  // performance ranking Top 5
  const ranked = [...teams.teams].sort((a, b) => b.rating - a.rating).slice(0, 5);
  const homeTeams = document.querySelector('#home-teams');
  if (homeTeams) {
    replaceChildren(homeTeams, ranked.map((team, index) => {
      const trend = trends[team.id];
      return element('div', { className: 'rank-item' }, [
        element('span', { className: 'rank-number', text: `0${index + 1}` }),
        renderTrendBadge(trend),
        element('div', { className: 'rank-team-info' }, [
          teamLink(team.id, team.name, 'team-link rank-team-name'),
          element('div', { className: 'rank-league-sub', text: `${team.league}${team.group ? ' · Group ' + team.group : ''}` })
        ]),
        element('div', { className: 'rank-extra-stats' }, [
          element('span', { className: 'rank-stat-pill', text: `${team.matches_played || 0} Spiele` }),
          element('span', { className: 'rank-stat-pill', text: `±${Math.round(team.rating_deviation)} RD` })
        ]),
        element('div', { className: 'rank-rating-box' }, [
          element('span', { className: 'rank-rating-val', text: Math.round(team.rating) })
        ])
      ]);
    }));
  }

  // Model Performance (with explicit evaluation period)
  const homePerf = document.querySelector('#home-performance');
  if (homePerf) {
    const performanceSeason = String(performance.season || '2026')
      .replace(/^Season\s+/i, '')
      .trim();
    replaceChildren(homePerf, [
      element('div', { className: 'performance-overview' }, [
        element('div', { className: 'performance-period' }, [
          element('span', { className: 'eyebrow', text: `SAISON ${performanceSeason}` }),
          element('strong', { text: `${dateLabel(performance.evaluation_start)} - ${dateLabel(performance.evaluation_end)}` }),
          element('small', { className: 'muted', text: `${performance.predictions || 0} ausgewertete Spiele` })
        ]),
        element('div', { className: 'performance-metrics' }, [
          element('article', { className: 'performance-card performance-card-primary' }, [element('div', { className: 'performance-value', text: percent(performance.accuracy) }), element('div', { className: 'performance-label', text: 'Trefferquote', attributes: { title: 'Anteil der Vorhersagen, bei denen der Sieger korrekt vorhergesagt wurde.' } })]),
          element('article', { className: 'performance-card' }, [element('div', { className: 'performance-value', text: Number(performance.log_loss).toFixed(3) }), element('div', { className: 'performance-label', text: 'Logarithmischer Verlust', attributes: { title: 'Bewertet die Qualität der vorhergesagten Wahrscheinlichkeiten und bestraft falsche, sehr sichere Vorhersagen besonders stark. Kleiner = besser.' } })]),
          element('article', { className: 'performance-card' }, [element('div', { className: 'performance-value', text: Number(performance.brier_score).toFixed(3) }), element('div', { className: 'performance-label', text: 'Brier-Wert', attributes: { title: 'Misst den durchschnittlichen quadratischen Fehler zwischen vorhergesagter Wahrscheinlichkeit und tatsächlichem Ergebnis. Kleiner = besser.' } })]),
          element('article', { className: 'performance-card' }, [element('div', { className: 'performance-value', text: Number(performance.calibration_error).toFixed(3) }), element('div', { className: 'performance-label', text: 'Kalibrierungsfehler', attributes: { title: 'Zeigt, wie gut die vorhergesagten Wahrscheinlichkeiten mit den tatsächlich eingetretenen Häufigkeiten übereinstimmen. Kleiner = besser.' } })])
        ])
      ])
    ]);
  }

  // Recent Results
  const homeResults = document.querySelector('#home-results');
  if (homeResults && predictionHistory.history?.length) {
    const list = predictionHistory.history.slice(-5).reverse();
    const rows = list.map(item => {
      const predA = probabilityPercent(item.probability_a);
      const predB = probabilityPercent(item.probability_b);
      const scoreStr = (item.score_a != null && item.score_b != null) ? `${item.score_a} - ${item.score_b}` : 'Final';
      const isCorrect = item.correct;
      const predictedWinnerId = Number(item.probability_a) >= Number(item.probability_b) ? item.team_a_id : item.team_b_id;
      const predictedWinner = teamsById[predictedWinnerId];

      return element('div', { className: 'result-row' }, [
        element('div', { className: 'result-match' }, [
          teamLink(item.team_a_id, item.team_a, 'team-link'),
          element('span', { className: 'muted', text: ' vs ' }),
          teamLink(item.team_b_id, item.team_b, 'team-link'),
          element('br'),
          element('small', { className: 'muted', text: dateLabel(item.date) }),
          element('small', { className: 'muted', text: matchContextLabel(item) })
        ]),
        element('div', { className: 'result-prediction' }, [
          element('small', { className: 'muted', text: 'Vorhersage' }),
          element('strong', { text: `${predA} vs ${predB}` })
        ]),
        element('div', { className: 'result-predicted-winner' }, [
          element('small', { className: 'muted', text: 'Prognostizierter Sieger' }),
          element('strong', { text: teamAbbreviation(predictedWinner) })
        ]),
        element('div', { className: 'result-score' }, [
          element('small', { className: 'muted', text: 'Ergebnis' }),
          element('strong', { text: scoreStr })
        ]),
        element('span', { className: `status-tag ${isCorrect ? 'correct' : 'incorrect'}`, text: isCorrect ? 'Richtig' : 'Falsch' })
      ]);
    });

    replaceChildren(homeResults, [
      element('div', { className: 'results-panel-wrap' }, rows)
    ]);
  }
}

async function predictionsPage() {
  const data = await load('predictions');
  const list = document.querySelector('#prediction-list');
  const fields = [['prediction-league', 'league']];
  fields.forEach(([id, key]) => {
    const select = document.querySelector(`#${id}`);
    if (select) select.append(...[...new Set(data.predictions.map(item => item[key]).filter(Boolean))].sort().map(value => element('option', { text: value, attributes: { value } })));
  });
  const render = () => {
    const filtered = data.predictions.filter(item => fields.every(([id,key]) => {
      const el = document.querySelector(`#${id}`);
      return !el || !el.value || el.value === item[key];
    }));
    if (list)     replaceChildren(list, filtered.length ? filtered.map(card) : [emptyState('Keine Vorhersagen entsprechen diesen Filtern.')]);
  };
  fields.forEach(([id]) => document.querySelector(`#${id}`)?.addEventListener('change', render));
  render();
}

async function teamsPage() {
  const [data, ratingHistory, performanceHistory] = await Promise.all([
    load('teams'),
    load('ratingHistory').catch(() => ({ history: [] })),
    load('performanceHistory').catch(() => ({ history: [] }))
  ]);

  const trends = computeTeamTrends(data.teams || [], ratingHistory);
  const leagueThresholds = currentLeagueThresholds(data, performanceHistory);
  const leagueSigmas = currentLeagueSigmas(data, performanceHistory);
  const table = document.querySelector('#team-table');
  const leagueSelect = document.querySelector('#team-league');
  const histogram = document.querySelector('#rating-histogram');
  const rangeSelect = document.querySelector('#rating-range');
  const urlLeague = new URLSearchParams(window.location.search).get('league');

  if (leagueSelect) {
    const leagues = [...new Set(data.teams.map(t => t.league).filter(Boolean))].sort();
    leagueSelect.append(...leagues.map(l => element('option', { text: l, attributes: { value: l } })));
    if (urlLeague && leagues.includes(urlLeague)) {
      leagueSelect.value = urlLeague;
    }
  }

  const render = () => {
    const query = (document.querySelector('#team-search')?.value || '').toLowerCase();
    const sort = document.querySelector('#team-sort')?.value || 'rating';
    const selectedLeague = leagueSelect ? leagueSelect.value : (urlLeague || '');

    const teams = data.teams
      .filter(team => team.name.toLowerCase().includes(query))
      .filter(team => !selectedLeague || team.league === selectedLeague)
      .sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'matches' ? b.matches_played - a.matches_played : b.rating - a.rating);

    if (table) {
      const rows = [];
      const thresholds = sort === 'rating' ? [
        ['1/2', Number(leagueThresholds['1_2'])],
        ['2/3', Number(leagueThresholds['2_3'])],
        ['3/4', Number(leagueThresholds['3_4'])]
      ].filter(([, value]) => Number.isFinite(value)) : [];
      const highlightedTeamIds = new Set();
      const highlightedTopTeamIds = new Set();
      const highlightedBottomTeamIds = new Set();
      thresholds.forEach(([zone, threshold]) => {
        const sigma = leagueSigmas[zone.replace('/', '_')] || 200;
        const boundary = teams.findIndex(team => Number(team.rating) <= threshold);
        const boundaryIndex = boundary < 0 ? teams.length : boundary;
        if (boundaryIndex === 0 || boundaryIndex === teams.length) return;
        const candidates = teams.filter(team =>
          Math.abs(Number(team.rating) - threshold) <= sigma
        );
        const thresholdTeamIds = new Set();
        [teams[boundaryIndex - 1], teams[boundaryIndex], ...candidates]
          .filter(Boolean)
          .forEach(team => {
            highlightedTeamIds.add(team.id);
            thresholdTeamIds.add(team.id);
          });
        const highlightedIndexes = teams
          .map((team, index) => thresholdTeamIds.has(team.id) ? index : -1)
          .filter(index => index >= 0);
        if (highlightedIndexes.length) {
          highlightedTopTeamIds.add(teams[Math.min(...highlightedIndexes)].id);
          highlightedBottomTeamIds.add(teams[Math.max(...highlightedIndexes)].id);
        }
      });

      teams.forEach((team, index) => {
        thresholds.forEach(([zone, threshold]) => {
          const boundaryIndex = teams.findIndex(item => Number(item.rating) <= threshold);
          if (boundaryIndex > 0 && boundaryIndex < teams.length && boundaryIndex === index) {
            rows.push(element('tr', { className: 'ranking-crosszone-row' }, [
              element('td', {
                className: 'ranking-crosszone-label',
                text: `predicted crosszone league ${zone} → ${Math.round(threshold)} ±${Math.round(leagueSigmas[zone.replace('/', '_')] || 200)}`,
                attributes: { colspan: '8' }
              })
            ]));
          }
        });
        const trend = trends[team.id];
        const rowClasses = [];
        if (highlightedTeamIds.has(team.id)) rowClasses.push('ranking-crosszone-team');
        if (highlightedTopTeamIds.has(team.id)) rowClasses.push('ranking-crosszone-top');
        if (highlightedBottomTeamIds.has(team.id)) rowClasses.push('ranking-crosszone-bottom');
        rows.push(element('tr', {
          className: rowClasses.join(' ')
        }, [
          element('td', { text: index + 1 }),
          element('td', {}, [renderTrendBadge(trend)]),
          element('td', {}, [
            teamLink(team.id, team.name, 'team-link'),
            element('small', { className: 'team-abbreviation', text: ` (${teamAbbreviation(team)})` }),
            element('br'),
            element('small', { className: 'muted', text: team.group ? `Group ${team.group}` : '' })
          ]),
          element('td', { text: team.league }),
          element('td', { text: Math.round(team.rating) }),
          element('td', { text: predictedSustainableLevel(team) }),
          element('td', { text: Math.round(team.rating_deviation) }),
          element('td', { text: team.matches_played })
        ]));
      });
      replaceChildren(table, rows.length ? rows : [
        element('tr', {}, [
          element('td', { className: 'empty-state', text: 'Keine Teams gefunden.', attributes: { colspan: '8' } })
        ])
      ]);
    }

    if (histogram) replaceChildren(histogram, [ratingHistogram(teams, Number(rangeSelect?.value) || 100, leagueThresholds)]);
  };

  document.querySelector('#team-search')?.addEventListener('input', render);
  document.querySelector('#team-sort')?.addEventListener('change', render);
  leagueSelect?.addEventListener('change', render);
  rangeSelect?.addEventListener('change', render);
  render();
}

function ratingHistogram(teams, bucketSize, leagueThresholds = {}) {
  if (!teams.length) return emptyState('Für diese Auswahl sind keine Ratings verfügbar.');

  const width = 760;
  const height = 330;
  const padding = { top: 24, right: 24, bottom: 72, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const ratings = teams.map(team => Number(team.rating)).filter(Number.isFinite);
  const minRating = 0;
  const maxRating = Math.floor(Math.max(...ratings) / bucketSize) * bucketSize;
  const buckets = [];

  for (let start = minRating; start <= maxRating; start += bucketSize) {
    buckets.push({ start, end: start + bucketSize, count: 0 });
  }
  ratings.forEach(rating => {
    const index = Math.min(Math.floor((rating - minRating) / bucketSize), buckets.length - 1);
    buckets[index].count++;
  });

  const maxCount = Math.max(...buckets.map(bucket => bucket.count), 1);
  const barGap = Math.min(12, plotWidth / buckets.length * 0.18);
  const barWidth = Math.max(2, (plotWidth - barGap * Math.max(buckets.length - 1, 0)) / buckets.length);
  const labelStep = Math.max(1, Math.ceil(buckets.length / 10));
  const chart = svgNode('svg', {
    class: 'rating-histogram',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Histogramm der Ratings von ${teams.length} Teams in Bereichen von ${bucketSize} Punkten`
  });
  const title = svgNode('title');
  title.textContent = `Verteilung der Team-Ratings, Bereiche von ${bucketSize} Punkten`;
  chart.append(title);

  const ratingX = rating => padding.left + (rating / (maxRating + bucketSize)) * plotWidth;
  const transitionBands = [
    ['4. Liga', 0, Number(leagueThresholds['3_4']), 'histogram-league-band-4'],
    ['3. Liga', Number(leagueThresholds['3_4']), Number(leagueThresholds['2_3']), 'histogram-league-band-3'],
    ['2. Liga', Number(leagueThresholds['2_3']), Number(leagueThresholds['1_2']), 'histogram-league-band-2'],
    ['1. Liga', Number(leagueThresholds['1_2']), maxRating + bucketSize, 'histogram-league-band-1']
  ].filter(([, start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start);
  transitionBands.forEach(([name, start, end, className]) => {
    const left = Math.max(padding.left, ratingX(start));
    const right = Math.min(width - padding.right, ratingX(end));
    if (right <= left) return;
    const band = svgNode('rect', {
      class: className,
      x: left,
      y: padding.top,
      width: right - left,
      height: plotHeight
    });
    band.append(svgNode('title'));
    band.lastChild.textContent = `${name} Übergangsbereich: Rating ${Math.round(start)}-${Math.round(end)}`;
    chart.append(band);
  });

  [0, 0.5, 1].forEach(ratio => {
    const y = padding.top + plotHeight - ratio * plotHeight;
    chart.append(
      svgNode('line', { class: 'histogram-gridline', x1: padding.left, y1: y, x2: width - padding.right, y2: y }),
      svgNode('text', { class: 'histogram-axis-label', x: padding.left - 10, y: y + 4, 'text-anchor': 'end' })
    );
    chart.lastChild.textContent = String(Math.round(maxCount * ratio));
  });

  buckets.forEach((bucket, index) => {
    const barHeight = bucket.count / maxCount * plotHeight;
    const x = padding.left + index * (barWidth + barGap);
    const y = padding.top + plotHeight - barHeight;
    const bar = svgNode('rect', {
      class: 'histogram-bar',
      x,
      y,
      width: barWidth,
      height: Math.max(barHeight, bucket.count ? 2 : 0),
      rx: 3
    });

    bar.append(svgNode('title'));
    bar.lastChild.textContent = `${bucket.start}-${bucket.end - 1}: ${bucket.count} team${bucket.count === 1 ? '' : 's'}`;
    chart.append(bar);

    if (index % labelStep === 0 || index === buckets.length - 1) {
      const label = svgNode('text', {
        class: 'histogram-x-label',
        x: x + barWidth / 2,
        y: height - padding.bottom + 22,
        'text-anchor': 'middle'
      });
      label.textContent = bucket.start.toLocaleString();
      chart.append(label);
    }

  });

  transitionBands.forEach(([name, start, end]) => {
    [start, end].forEach(value => {
      if (value <= 0 || value >= maxRating + bucketSize) return;
      const x = ratingX(value);
      chart.append(svgNode('line', {
        class: 'histogram-league-threshold',
        x1: x, y1: padding.top, x2: x, y2: padding.top + plotHeight
      }));
    });
    const labelValue = (Math.max(start, 0) + end) / 2;
    if (labelValue >= 0 && labelValue <= maxRating + bucketSize) {
      const label = svgNode('text', {
        class: 'histogram-league-label',
        x: ratingX(labelValue),
        y: padding.top + 14,
        'text-anchor': 'middle'
      });
      const rangeLabel = start <= 0
        ? `0-${Math.round(end)}`
        : end >= maxRating + bucketSize
          ? `ab ${Math.floor(start) + 1}`
          : `${Math.floor(start) + 1}-${Math.floor(end)}`;
      label.textContent = `${name} ${rangeLabel}`;
      chart.append(label);
    }
  });

  chart.append(
    svgNode('line', { class: 'histogram-axis', x1: padding.left, y1: padding.top + plotHeight, x2: width - padding.right, y2: padding.top + plotHeight }),
    svgNode('text', { class: 'histogram-axis-title', x: padding.left + plotWidth / 2, y: height - 14, 'text-anchor': 'middle' })
  );
  chart.lastChild.textContent = 'Ratingpunkte (Beginn des Bereichs)';
  chart.append(
    svgNode('text', { class: 'histogram-axis-title', x: 15, y: padding.top + plotHeight / 2, 'text-anchor': 'middle', transform: `rotate(-90 15 ${padding.top + plotHeight / 2})` })
  );
  chart.lastChild.textContent = 'Anzahl der Teams';

  return element('div', { className: 'histogram-chart-wrap' }, [chart]);
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

let chartClipId = 0;

function lineChart(series, label, chartInfo = {}) {
  const preparedSeries = series.map(item => ({
    ...item,
    rows: item.rows.map((row, index) => ({ ...row, chartIndex: index }))
  }));
  const pointCount = Math.max(...preparedSeries.map(item => item.rows.length));
  const values = [
    ...preparedSeries.flatMap(item => item.rows.map(row => Number(row.rating))),
    ...(chartInfo.extraValues || []).map(Number)
  ].filter(Number.isFinite);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const roughTickStep = (rawMaximum - rawMinimum) / 7;
  const tickMagnitude = 10 ** Math.floor(Math.log10(Math.max(roughTickStep, 1)));
  const normalizedTickStep = roughTickStep / tickMagnitude;
  const tickFactor = normalizedTickStep <= 1 ? 1 : normalizedTickStep <= 2 ? 2 : normalizedTickStep <= 5 ? 5 : 10;
  const tickStep = tickFactor * tickMagnitude;
  const minimum = Math.floor(rawMinimum / tickStep) * tickStep;
  const maximum = Math.max(Math.ceil(rawMaximum / tickStep) * tickStep, minimum + tickStep);
  const range = maximum - minimum;
  const width = 720;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 42, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = index => padding.left + (index / Math.max(pointCount - 1, 1)) * plotWidth;
  const y = value => padding.top + (1 - (value - minimum) / range) * plotHeight;
  const zoneSeries = chartInfo.zoneSeries || [];
  const gameLabel = index => {
    const row = preparedSeries[0]?.rows[index];
    if (row?.event_type === 'wildcard_start') return row.label || 'Wildcard';
    if (row?.event_type === 'season_start') return row.label || 'Saisonbeginn';
    return row?.label || (index === 0 ? 'Startwert' : `Spiel ${index}`);
  };
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label, class: 'line-chart' });
  const clipId = `chart-plot-clip-${chartClipId++}`;
  const definitions = svgNode('defs');
  const clipPath = svgNode('clipPath', { id: clipId });
  clipPath.append(svgNode('rect', {
    x: padding.left,
    y: padding.top,
    width: plotWidth,
    height: plotHeight
  }));
  definitions.append(clipPath);
  svg.append(definitions);
  svg.append(svgNode('line', { x1: padding.left, y1: padding.top, x2: padding.left, y2: height - padding.bottom, class: 'chart-axis' }), svgNode('line', { x1: padding.left, y1: height - padding.bottom, x2: width - padding.right, y2: height - padding.bottom, class: 'chart-axis' }));
  for (let value = minimum; value <= maximum; value += tickStep) {
    const guide = svgNode('line', { x1: padding.left, y1: y(value), x2: width - padding.right, y2: y(value), class: 'chart-guide' });
    const text = svgNode('text', { x: 4, y: y(value) + 4, class: 'chart-label' });
    text.textContent = Math.round(value);
    svg.append(guide, text);
  }
  const thresholds = [
    ['1. Liga', '2. Liga', Number(chartInfo.thresholds?.['1_2'])],
    ['2. Liga', '3. Liga', Number(chartInfo.thresholds?.['2_3'])],
    ['3. Liga', '4. Liga', Number(chartInfo.thresholds?.['3_4'])]
  ].filter(([, , value]) => Number.isFinite(value) && value >= minimum && value <= maximum);
  if (!zoneSeries.length) thresholds.forEach(([upperLeague, lowerLeague, value]) => {
    const thresholdY = y(value);
    const line = svgNode('line', {
      x1: padding.left,
      y1: thresholdY,
      x2: width - padding.right,
      y2: thresholdY,
      class: 'chart-league-threshold'
    });
    const ratingLabel = svgNode('text', {
      x: padding.left - 8,
      y: thresholdY + 4,
      'text-anchor': 'end',
      class: 'chart-league-threshold-label'
    });
    ratingLabel.textContent = Math.round(value);
    const upperLabel = svgNode('text', {
      x: padding.left + 8,
      y: thresholdY - 7,
      class: 'chart-league-threshold-label'
    });
    upperLabel.textContent = upperLeague;
    const lowerLabel = svgNode('text', {
      x: padding.left + 8,
      y: thresholdY + 15,
      class: 'chart-league-threshold-label'
    });
    lowerLabel.textContent = lowerLeague;
    svg.append(line, ratingLabel, upperLabel, lowerLabel);
  });
  const labelStep = Math.max(1, Math.ceil(pointCount / 8));
  const labelIndices = [];
  for (let i = 0; i < pointCount; i += labelStep) labelIndices.push(i);
  if (labelIndices[labelIndices.length - 1] !== pointCount - 1) labelIndices.push(pointCount - 1);
  const specialIndices = new Set(
    (preparedSeries[0]?.rows || [])
      .filter(row => ['wildcard_start', 'season_start'].includes(row.event_type))
      .map(row => row.chartIndex)
  );
  labelIndices.forEach(index => {
    if (specialIndices.has(index)) return;
    const grid = svgNode('line', { x1: x(index), y1: padding.top, x2: x(index), y2: height - padding.bottom, class: 'chart-grid' });
    const text = svgNode('text', { x: x(index), y: height - 12, 'text-anchor': 'middle', class: 'chart-label' });
    text.textContent = gameLabel(index);
    svg.append(grid, text);
  });
  const transitionRows = preparedSeries[0]?.rows.filter(row => (
    row.event_type === 'wildcard_start'
    || row.event_type === 'season_start'
  )) || [];
  transitionRows.forEach(row => {
    const separator = svgNode('line', {
      x1: x(row.chartIndex),
      y1: padding.top,
      x2: x(row.chartIndex),
      y2: height - padding.bottom,
      class: `chart-season-boundary ${row.event_type}`
    });
    const boundaryLabel = svgNode('text', {
      x: ['wildcard_start', 'season_start'].includes(row.event_type)
        ? x(row.chartIndex)
        : x(row.chartIndex) + 5,
      y: ['wildcard_start', 'season_start'].includes(row.event_type)
        ? padding.top - 8
        : padding.top + 13,
      ...(['wildcard_start', 'season_start'].includes(row.event_type)
        ? { 'text-anchor': 'middle' }
        : {}),
      class: `chart-season-label ${row.event_type}`
    });
    const seasonLabel = String(row.season || '')
      .replace(/^Season\s+/i, '')
      .trim();
    boundaryLabel.textContent = row.event_type === 'wildcard_start'
      ? `Wildcard ${seasonLabel}`
      : row.event_type === 'season_start'
        ? `Saison ${seasonLabel}`
        : row.label || row.season || 'Saisonwechsel';
    const title = svgNode('title');
    title.textContent = row.event_type === 'wildcard_start'
      ? `Wildcard-Start · ${row.season || 'Saison'}`
      : `Saisonbeginn · ${row.season || 'Saison'}`;
    separator.append(title);
    svg.append(separator, boundaryLabel);
    if (
      row.event_type === 'season_start'
      && preparedSeries[0].rows
        .find(candidate => candidate.chartIndex === row.chartIndex)
        ?.source === 'carryover'
    ) {
      const qualified = row.wildcard_status === 'qualified';
      let previousIndex = row.chartIndex - 1;
      if (!qualified) {
        while (
          previousIndex >= 0
          && preparedSeries[0].rows[previousIndex].season === row.season
          && preparedSeries[0].rows[previousIndex].event_type !== 'wildcard_start'
        ) previousIndex -= 1;
        if (
          previousIndex >= 0
          && preparedSeries[0].rows[previousIndex].event_type === 'wildcard_start'
        ) previousIndex -= 1;
      }
      const previousRow = preparedSeries[0]?.rows[previousIndex];
      if (!previousRow) return;
      svg.append(svgNode('line', {
        x1: x(previousRow.chartIndex),
        y1: y(previousRow.rating),
        x2: x(row.chartIndex),
        y2: y(row.rating),
        class: 'chart-season-transition-line season_adjustment'
      }));
    }
  });
  preparedSeries.forEach(item => {
    item.rows
      .filter(row => row.wildcard_transition_start)
      .forEach(row => {
        const markerIndex = row.chartIndex - 1;
        if (markerIndex < 0) return;
        const separator = svgNode('line', {
          x1: x(markerIndex),
          y1: padding.top,
          x2: x(markerIndex),
          y2: height - padding.bottom,
          class: 'chart-season-boundary wildcard_start'
        });
        const boundaryLabel = svgNode('text', {
          x: x(markerIndex),
          y: padding.top - 8,
          'text-anchor': 'middle',
          class: 'chart-season-label wildcard_start'
        });
        const seasonLabel = String(row.season || '')
          .replace(/^Season\s+/i, '')
          .trim();
        boundaryLabel.textContent = `Wildcard ${seasonLabel}`;
        const title = svgNode('title');
        title.textContent = `Wildcard-Start · ${row.season || 'Saison'} · Rating ${Math.round(row.wildcard_start_rating)}`;
        separator.append(title);
        svg.append(separator, boundaryLabel);
      });
  });
  preparedSeries.forEach((item, seriesIndex) => {
    item.rows.forEach((row, index) => {
      if (!row.wildcard_transition_start || index === 0) return;
      const previous = item.rows[index - 1];
      svg.append(svgNode('line', {
        x1: x(previous.chartIndex),
        y1: y(previous.rating),
        x2: x(row.chartIndex),
        y2: y(row.rating),
        class: 'chart-line chart-line-wildcard chart-line-wildcard-transition'
      }));
    });
    const seasonGroups = [];
    item.rows.forEach(row => {
      const key = row.season || 'unknown';
      let group = seasonGroups.find(candidate => candidate.key === key);
      if (!group) {
        group = { key, rows: [] };
        seasonGroups.push(group);
      }
      group.rows.push(row);
    });
    seasonGroups.forEach(group => {
      for (let index = 1; index < group.rows.length; index += 1) {
        const previous = group.rows[index - 1];
        const current = group.rows[index];
        const wildcardStart = previous.event_type === 'wildcard_start'
          && current.rating_source === 'wildcard';
        const seasonStart = previous.event_type === 'season_start'
          && current.rating_source !== 'wildcard';
        if (
          (previous.event_type === 'wildcard_start' && !wildcardStart)
          || current.event_type === 'season_start'
          || (previous.event_type === 'season_start' && !seasonStart)
        ) {
          continue;
        }
        const wildcard = previous.rating_source === 'wildcard'
          || current.rating_source === 'wildcard';
        const qualifiedWildcard = previous.wildcard_transition_start
          || current.wildcard_transition_start
          || previous.wildcard_qualified
          || current.wildcard_qualified;
        svg.append(svgNode('line', {
          x1: x(previous.chartIndex),
          y1: y(previous.rating),
          x2: x(current.chartIndex),
          y2: y(current.rating),
          class: `chart-line chart-line-${seriesIndex}${wildcard ? ' chart-line-wildcard' : ''}${qualifiedWildcard ? ' chart-line-wildcard-transition' : ''}`
        }));
      }
    });
    item.rows.forEach(row => {
      const isTransition = ['wildcard_start', 'season_start'].includes(row.event_type);
      if (row.hide_transition_point) return;
      const circle = svgNode('circle', {
        cx: x(row.chartIndex),
        cy: y(row.rating),
        r: isTransition ? 6 : 4,
        class: `${isTransition ? 'chart-transition' : 'chart-point'} chart-line-${seriesIndex} ${row.event_type || 'match'}`
      });
      const before = Number.isFinite(Number(row.rating_before))
        ? `, from ${Math.round(row.rating_before)}`
        : '';
      circle.setAttribute('aria-label', isTransition
        ? `${row.label || row.event_type}, ${row.season || 'season'}, rating ${Math.round(row.rating)}${before}, no match`
        : `${item.name}, ${gameLabel(row.chartIndex)}, ${dateLabel(row.date)}, rating ${Math.round(row.rating)}`);
      const title = svgNode('title');
      title.textContent = isTransition
        ? `${row.label || row.event_type} · ${row.season || 'season'} · ${before ? `${Math.round(row.rating_before)} → ` : ''}${Math.round(row.rating)} · no match`
        : `${item.name} · ${gameLabel(row.chartIndex)} · ${dateLabel(row.date)} · rating ${Math.round(row.rating)}`;
      circle.append(title);
      svg.append(circle);
    });
  });
  zoneSeries.forEach(zone => {
    const points = zone.points.filter(point => Number.isFinite(Number(point.rating)));
    if (!points.length) return;
    const zoneX = chartIndex => x(chartIndex - 0.5);
    const pathParts = [`M ${zoneX(points[0].chartIndex)} ${y(points[0].rating)}`];
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      const previous = points[index - 1];
      pathParts.push(
        `L ${zoneX(point.chartIndex)} ${y(previous.rating)}`,
        `L ${zoneX(point.chartIndex)} ${y(point.rating)}`
      );
    }
    const lastPoint = points[points.length - 1];
    const chartEnd = x(pointCount - 1);
    if (zoneX(lastPoint.chartIndex) < chartEnd) {
      pathParts.push(`L ${chartEnd} ${y(lastPoint.rating)}`);
    }
    const path = svgNode('path', {
      d: pathParts.join(' '),
      class: 'chart-historical-zone',
      'clip-path': `url(#${clipId})`
    });
    const title = svgNode('title');
    title.textContent = `${zone.label}: historical crossover rating`;
    path.append(title);
    svg.append(path);
    const ratingXs = preparedSeries.flatMap(item => item.rows.map(row => x(row.chartIndex)));
    const labelHalfWidth = 42;
    const labelCandidates = [];
    points.forEach((point, index) => {
      const next = points[index + 1];
      const startX = zoneX(point.chartIndex);
      const endX = next ? zoneX(next.chartIndex) : chartEnd;
      if (endX <= startX) return;
      if (next && Number(next.rating) > Number(point.rating)) return;
      const candidateX = (startX + endX) / 2;
      const hasRatingPoint = ratingXs.some(pointX => Math.abs(pointX - candidateX) < labelHalfWidth + 6);
      labelCandidates.push({
        x: candidateX,
        rating: point.rating,
        width: endX - startX,
        hasRatingPoint
      });
    });
    const selectedLabel = labelCandidates
      .filter(candidate => !candidate.hasRatingPoint)
      .sort((left, right) => right.width - left.width)[0]
      || labelCandidates.sort((left, right) => right.width - left.width)[0]
      || { x: zoneX(points[0].chartIndex), rating: points[0].rating };
    const labelX = selectedLabel.x;
    const labels = svgNode('g', {
      class: 'chart-historical-zone-label-group',
      'data-label-x': String(labelX),
      'data-label-anchor': 'middle'
    });
    const upperLabel = svgNode('text', {
      x: labelX,
      y: y(selectedLabel.rating) - 7,
      class: 'chart-historical-zone-label',
      'text-anchor': 'middle'
    });
    upperLabel.textContent = zone.upperLeague;
    const lowerLabel = svgNode('text', {
      x: labelX,
      y: y(selectedLabel.rating) + 15,
      class: 'chart-historical-zone-label',
      'text-anchor': 'middle'
    });
    lowerLabel.textContent = zone.lowerLeague;
    labels.append(upperLabel, lowerLabel);
    svg.append(labels);
  });
  return svg;
}

function sustainabilityChart(team, sustainabilityData) {
  const snapshots = (sustainabilityData?.history || [])
    .filter(snapshot => snapshot.season === team.season && snapshot.teams?.[team.id]);
  const currentSnapshot = snapshots[snapshots.length - 1];
  const current = currentSnapshot?.teams?.[team.id];
  if (!current) return null;

  const leagues = ['1. Liga', '2. Liga', '3. Liga', '4. Liga'];
  return element('aside', {
    className: 'sustainability-chart',
    attributes: { 'aria-label': `Sustainable level: ${current.predicted_league}` }
  }, [
    element('h3', { text: 'Sustainable level' }),
    element('div', { className: 'sustainability-chart-bars', attributes: { role: 'list' } },
      leagues.map(league => {
        const probability = Number(current.league_probabilities?.[league]) || 0;
        const isHighest = league === current.predicted_league;
        return element('div', {
          className: `sustainability-chart-bar${isHighest ? ' is-highest' : ''}`,
          attributes: { role: 'listitem', 'aria-label': `${league}: ${formatPercentage(probability)}` }
        }, [
          element('strong', { className: 'sustainability-chart-value', text: formatPercentage(probability) }),
          element('div', { className: 'sustainability-chart-track' }, [
            element('span', {
              className: 'sustainability-chart-fill',
              style: { height: boundedPercent(probability) },
              attributes: { 'aria-hidden': 'true' }
            })
          ]),
          element('span', { className: 'sustainability-chart-label', text: league.replace('. Liga', '.') })
        ]);
      })
    ),
    element('small', {
      className: 'sustainability-chart-meta',
      text: `${current.predicted_league} · Spieltag ${currentSnapshot.matchday}`
    })
  ]);
}

function positionSustainabilityChart(canvas) {
  const chart = canvas.querySelector('.sustainability-chart');
  const chartSurface = canvas.querySelector('.line-chart, .rating-chart-maintenance');
  const points = [...canvas.querySelectorAll('.chart-point')];
  if (!chart || !chartSurface) return;

  const canvasRect = canvas.getBoundingClientRect();
  const svgRect = chartSurface.getBoundingClientRect();
  const chartWidth = chart.offsetWidth;
  const chartHeight = chart.offsetHeight;
  const gap = 10;
  const preferredCandidates = [
    { name: 'top-right', left: svgRect.right - canvasRect.left - chartWidth - gap, top: svgRect.top - canvasRect.top + gap },
    { name: 'bottom-right', left: svgRect.right - canvasRect.left - chartWidth - gap, top: svgRect.bottom - canvasRect.top - chartHeight - gap },
    { name: 'top-left', left: svgRect.left - canvasRect.left + gap, top: svgRect.top - canvasRect.top + gap },
    { name: 'bottom-left', left: svgRect.left - canvasRect.left + gap, top: svgRect.bottom - canvasRect.top - chartHeight - gap }
  ];
  const minLeft = svgRect.left - canvasRect.left + gap;
  const maxLeft = svgRect.right - canvasRect.left - chartWidth - gap;
  const minTop = svgRect.top - canvasRect.top + gap;
  const maxTop = svgRect.bottom - canvasRect.top - chartHeight - gap;
  const candidates = [...preferredCandidates];
  for (let column = 0; column <= 8; column += 1) {
    for (let row = 0; row <= 5; row += 1) {
      candidates.push({
        name: `grid-${column}-${row}`,
        left: minLeft + (maxLeft - minLeft) * column / 8,
        top: minTop + (maxTop - minTop) * row / 5
      });
    }
  }
  const obstacles = [
    ...points,
    ...canvas.querySelectorAll(
      '.chart-label, .chart-league-threshold-label, .chart-season-boundary, ' +
      '.chart-season-label, .chart-season-transition-line, .chart-historical-zone-label'
    )
  ];
  const obstacleRects = obstacles.map(obstacle => {
    const rect = obstacle.getBoundingClientRect();
    const labelGap = obstacle.classList.contains('chart-season-boundary') ? 6 : 3;
    return {
      left: rect.left - labelGap,
      right: rect.right + labelGap,
      top: rect.top - labelGap,
      bottom: rect.bottom + labelGap
    };
  });
  const overlapArea = (left, top, width, height, rect) => {
    const right = left + width;
    const bottom = top + height;
    const overlapWidth = Math.max(0, Math.min(right, rect.right - canvasRect.left) - Math.max(left, rect.left - canvasRect.left));
    const overlapHeight = Math.max(0, Math.min(bottom, rect.bottom - canvasRect.top) - Math.max(top, rect.top - canvasRect.top));
    return overlapWidth * overlapHeight;
  };
  const scoredCandidates = candidates.map(candidate => ({
    ...candidate,
    score: obstacleRects.reduce(
      (score, rect) => score + overlapArea(candidate.left, candidate.top, chartWidth, chartHeight, rect),
      0
    )
  }));
  scoredCandidates.sort((left, right) => left.score - right.score);
  const selected = scoredCandidates[0];
  chart.style.left = `${Math.max(0, selected.left)}px`;
  chart.style.top = `${Math.max(0, selected.top)}px`;
};

function positionHistoricalZoneLabels(canvas) {
  const svg = canvas.querySelector('.line-chart');
  const groups = [...canvas.querySelectorAll('.chart-historical-zone-label-group')];
  if (!svg || !groups.length) return;

  groups.forEach(group => {
    const labels = [...group.querySelectorAll('.chart-historical-zone-label')];
    if (labels.length < 2) return;
    const lineX = Number(group.dataset.labelX);
    if (!Number.isFinite(lineX)) return;
    const anchor = group.dataset.labelAnchor || 'middle';
    labels.forEach(label => {
      label.setAttribute('x', String(lineX));
      label.setAttribute('text-anchor', anchor);
    });
  });
}

function historyPanel(team, history, leagueThresholds, sustainabilityData, seasonTransitions = [], predictionHistory = {}) {
  const entries = history.filter(row => row.team_id === team.id);
  const transitions = seasonTransitions.filter(row => row.team_id === team.id);
  const rows = [];
  let pointIndex = 0;
  const seasonNames = [...new Set(entries.map(entry => entry.season))];
  seasonNames.forEach(season => {
    const seasonEntries = entries.filter(entry => entry.season === season);
    const rawTransition = transitions.find(item => item.season === season);
    const transition = rawTransition?.event_type === 'season_decay'
      ? {
        ...rawTransition,
        source: 'carryover',
        rating_after_adjustment: rawTransition.rating_after,
        season_start_rating: rawTransition.rating_after,
        rating_before_adjustment: rawTransition.rating_before,
        wildcard_attempts: []
      }
      : rawTransition;
    const wildcardEntries = seasonEntries.filter(entry => entry.rating_source === 'wildcard');
    const regularEntries = seasonEntries.filter(entry => entry.rating_source !== 'wildcard');
    const qualifiedWildcard = transition?.wildcard_status === 'qualified';
    const appendMatch = entry => {
      pointIndex += 1;
      rows.push({
        ...entry,
        wildcard_transition_start: qualifiedWildcard
          && entry === wildcardEntries[0],
        wildcard_qualified: qualifiedWildcard && entry.rating_source === 'wildcard',
        wildcard_start_rating: qualifiedWildcard && entry === wildcardEntries[0]
          ? Number(transition.wildcard_start_rating)
          : undefined,
        label: `Game ${pointIndex}`,
        rating: Number(entry.rating)
      });
    };
    const hasWildcard = wildcardEntries.length > 0
      || (transition?.wildcard_attempts || []).length > 0;
    if (!rows.length) {
      const initial = Number.isFinite(Number(seasonEntries[0]?.rating_before))
        ? Number(seasonEntries[0].rating_before)
        : Number(seasonEntries[0]?.rating);
      rows.push({
        date: 'Ausgangsrating',
        rating: Number.isFinite(initial) ? initial : Number(team.initial_rating),
        label: 'Initial',
        season
      });
    }
    if (transition && hasWildcard && !qualifiedWildcard) {
      rows.push({
        ...transition,
        date: 'Wildcard-Start',
        event_type: 'wildcard_start',
        label: `Wildcard ${String(season || '').replace(/^Season\\s+/, '')}`,
        rating: Number(transition.wildcard_start_rating)
      });
    }
    wildcardEntries.forEach(appendMatch);
    if (transition && (regularEntries.length || !hasWildcard)) {
      rows.push({
        ...transition,
        date: 'Saisonbeginn',
        event_type: 'season_start',
        label: `Season ${String(season || '').replace(/^Season\\s+/, '')}`,
        rating: Number(transition.season_start_rating ?? transition.rating_after_adjustment)
      });
    }
    regularEntries.forEach(appendMatch);
  });

  if (!rows.length) {
    rows.push({
      date: 'Ausgangsrating',
      rating: Number(team.initial_rating),
      label: 'Initial',
      season: team.season
    });
  }
  if (!rows.length) return emptyState('Für dieses Team ist kein öffentliches Rating-Protokoll verfügbar.');
  const zoneSnapshots = [];
  const seenZoneSnapshots = new Set();
  (predictionHistory.crosszone_history || []).forEach(snapshot => {
    const key = `${snapshot.season || ''}|${snapshot.matchday || snapshot.date || ''}`;
    if (seenZoneSnapshots.has(key)) return;
    const matchingRows = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.season === snapshot.season && String(row.matchday || '') === String(snapshot.matchday || ''));
    if (!matchingRows.length) return;
    seenZoneSnapshots.add(key);
    zoneSnapshots.push({
      key,
      chartIndex: matchingRows[matchingRows.length - 1].index,
      zones: Object.fromEntries((snapshot.zones || []).map(zone => [zone.id, zone]))
    });
  });
  const chartMinimum = Math.min(...rows.map(row => Number(row.rating)));
  const chartMaximum = Math.max(...rows.map(row => Number(row.rating)));
  const zoneDefinitions = [
    ['1_2', '1. Liga / 2. Liga'],
    ['2_3', '2. Liga / 3. Liga'],
    ['3_4', '3. Liga / 4. Liga']
  ];
  const availableZones = zoneDefinitions.map(([id, label]) => ({
    id,
    label,
    ratings: zoneSnapshots
      .map(snapshot => snapshot.zones?.[id]?.rating)
      .filter(rating => Number.isFinite(Number(rating)))
      .map(Number)
  })).filter(zone => zone.ratings.length);
  const visibleZones = availableZones.filter(zone =>
    zone.ratings.some(rating => rating >= chartMinimum && rating <= chartMaximum)
  );
  const belowZones = availableZones
    .filter(zone => Math.max(...zone.ratings) < chartMinimum)
    .sort((a, b) => Math.max(...b.ratings) - Math.max(...a.ratings));
  const aboveZones = availableZones
    .filter(zone => Math.min(...zone.ratings) > chartMaximum)
    .sort((a, b) => Math.min(...a.ratings) - Math.min(...b.ratings));
  const fallbackZones = [
    belowZones[0],
    aboveZones[0]
  ].filter(Boolean);
  const selectedZoneIds = visibleZones.length
    ? [visibleZones[0].id]
    : fallbackZones.map(zone => zone.id);
  const buildZoneSeries = zoneIds => zoneIds.map(zoneId => {
    const definition = availableZones.find(zone => zone.id === zoneId);
    const [upperLeague, lowerLeague] = (definition?.label || zoneId).split(' / ');
    return {
      id: zoneId,
      label: definition?.label || zoneId,
      upperLeague,
      lowerLeague,
      points: zoneSnapshots
        .map(snapshot => ({
          chartIndex: snapshot.chartIndex,
          rating: Number(snapshot.zones?.[zoneId]?.rating)
        }))
        .filter(point => Number.isFinite(point.rating))
        .reduce((unique, point) => {
          unique.set(point.chartIndex, point);
          return unique;
        }, new Map())
    };
  }).map(zone => ({
    ...zone,
    points: [...zone.points.values()].sort((a, b) => a.chartIndex - b.chartIndex)
  }));
  const zoneSeries = buildZoneSeries(zoneDefinitions.map(([id]) => id));
  const sustainability = sustainabilityChart(team, sustainabilityData);
  const renderChart = zoneIds => {
    const selectedSeries = zoneSeries.filter(zone => zoneIds.includes(zone.id));
    return lineChart(
      [{ name: team.name, rows }],
      `${team.name} öffentliches Rating-Protokoll`,
      {
        thresholds: leagueThresholds,
        zoneSeries: selectedSeries,
        extraValues: selectedSeries.flatMap(zone => zone.points.map(point => point.rating))
      }
    );
  };
  const panel = element('section', { className: 'history-panel' }, [
    element('h2', { text: `${team.name} Rating-Verlauf` }),
    element('div', { className: 'rating-history-canvas' }, [
      element('div', { className: 'rating-chart-maintenance', text: 'Rating chart vorrübergehend nicht verfügbar, wird nochmal überarbeitet.' }),
      sustainability
    ])
  ]);
  const canvas = panel.querySelector('.rating-history-canvas');
  if (canvas && sustainability) {
    requestAnimationFrame(() => {
      positionHistoricalZoneLabels(canvas);
      positionSustainabilityChart(canvas);
    });
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        positionHistoricalZoneLabels(canvas);
        positionSustainabilityChart(canvas);
      });
      resizeObserver.observe(canvas);
    }
  }
  return panel;
}

function chartSummary(rows) {
  const initialRating = rows[0].rating;
  const latestRating = rows[rows.length - 1].rating;
  const trend = latestRating > initialRating ? 'up' : latestRating < initialRating ? 'down' : 'flat';
  const trendGlyph = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  return element('div', { className: 'chart-summary' }, [
    element('div', {}, [element('span', { className: 'summary-label', text: `Start / ${dateLabel(rows[0]?.date)}` }), element('strong', { text: Math.round(initialRating) })]),
    element('div', { className: `trend-arrow trend-arrow-${trend}`, attributes: { 'aria-hidden': 'true' }, text: trendGlyph }),
    element('div', {}, [element('span', { className: 'summary-label', text: `Aktuell / ${dateLabel(rows[rows.length - 1].date)}` }), element('strong', { text: Math.round(rows[rows.length - 1].rating) })])
  ]);
}

function resultsPanel(team, predictionHistory) {
  const rows = predictionHistory.filter(row => row.team_a_id === team.id || row.team_b_id === team.id).slice(-10).reverse();
  if (!rows.length) return emptyState('Für dieses Team sind keine öffentlichen Spielergebnisse verfügbar.');
  const items = rows.map(row => {
    const isTeamA = row.team_a_id === team.id;
    const opponentId = isTeamA ? row.team_b_id : row.team_a_id;
    const opponentName = isTeamA ? row.team_b : row.team_a;
    const opponentClass = isTeamA ? 'team-link team-link-b' : 'team-link team-link-a';
    const won = row.actual_winner_id === team.id;
    const teamScore = isTeamA ? row.score_a : row.score_b;
    const opponentScore = isTeamA ? row.score_b : row.score_a;
    const scoreText = (teamScore == null || opponentScore == null) ? 'Ergebnis nicht verfügbar' : `Ergebnis: ${teamScore} - ${opponentScore}`;

    const teamProb = isTeamA ? row.probability_a : row.probability_b;
    const winrateText = teamProb != null ? probabilityPercent(teamProb) : '-';
    const conf = getConfidenceInfo(row.confidence);

    return element('li', { className: won ? 'result-win' : 'result-loss' }, [
      element('span', { className: 'result-mark', text: won ? 'S' : 'N', attributes: { 'aria-label': won ? 'Sieg' : 'Niederlage' } }),
      element('div', { className: 'result-opponent' }, [
        element('span', {}, [
          element('span', { className: 'vs-prefix', text: 'vs ' }),
          teamLink(opponentId, opponentName, opponentClass)
        ]),
        element('small', { className: 'muted', text: `${dateLabel(row.date)} · ${matchContextLabel(row)}` })
      ]),
      element('div', { className: 'result-score', text: scoreText }),
      element('div', { className: 'result-winrate-col' }, [
        element('small', { className: 'muted', text: 'Siegchance:' }),
        element('strong', { text: winrateText })
      ]),
      element('div', { className: 'result-conf-col' }, [
        element('small', { className: 'muted', text: 'Confidence:' }),
        element('strong', { text: conf.label })
      ])
    ]);
  });
  return element('section', { className: 'results-panel' }, [
    element('div', { className: 'section-heading' }, [
      element('h2', { text: 'Letzte 10 Ergebnisse' }),
      element('span', { className: 'muted', text: 'Neueste zuerst' })
    ]),
    element('ol', { className: 'results-list' }, items)
  ]);
}

async function comparePage() {
  const [data, comparisons, ratingHistory] = await Promise.all([
    load('teams'),
    load('comparisons'),
    load('ratingHistory').catch(() => ({ history: [] }))
  ]);

  const options = data.teams.sort((a,b) => a.name.localeCompare(b.name)).map(team => element('option', { text: team.name, attributes: { value: team.id } }));
  document.querySelector('#compare-a')?.append(...options);
  document.querySelector('#compare-b')?.append(...options.map(option => option.cloneNode(true)));

  const render = () => {
    const a = data.teams.find(team => team.id === document.querySelector('#compare-a')?.value);
    const b = data.teams.find(team => team.id === document.querySelector('#compare-b')?.value);
    const target = document.querySelector('#compare-result');
    if (!target) return;
    if (!a || !b) { replaceChildren(target, [emptyState('Wähle zwei Teams um ihre Daten zu vergleichen.')]); return; }
    if (a.id === b.id) { replaceChildren(target, [emptyState('Wähle zwei verschiedene Teams.')]); return; }

    const comparison = comparisons.comparisons.find(row => (row.team_a_id === a.id && row.team_b_id === b.id) || (row.team_a_id === b.id && row.team_b_id === a.id));
    const probabilityA = comparison ? (comparison.team_a_id === a.id ? comparison.probability_a : comparison.probability_b) : null;
    const probabilityB = comparison ? (comparison.team_b_id === b.id ? comparison.probability_b : comparison.probability_a) : null;
    const conf = comparison ? getConfidenceInfo(comparison.confidence) : null;

    const prediction = comparison ? element('section', { className: 'comparison-prediction' }, [
      element('p', { className: 'eyebrow', text: 'DIREKTVERGLEICH' }),
      element('h2', { text: 'Veröffentlichte Siegchancen' }),
      element('div', { className: 'comparison-probabilities' }, [
        element('div', {}, [
          teamLink(a.id, a.name, 'team-link team-link-a'),
          element('strong', { text: probabilityPercent(probabilityA) })
        ]),
        element('div', {}, [
          teamLink(b.id, b.name, 'team-link team-link-b'),
          element('strong', { text: probabilityPercent(probabilityB) })
        ])
      ]),
      element('p', { className: 'muted', style: { marginTop: '1rem', marginBottom: '0' } }, [
        element('a', { attributes: { href: '../about/about.html#confidence' }, text: 'Confidence' }),
        document.createTextNode(`: ${conf.label}. Vor dem Spiel privat erstellt.`)
      ])
    ]) : emptyState('Für dieses Paar ist keine veröffentlichte Vergleichsvorhersage verfügbar.');

    const compareCardsNode = element('div', { className: 'compare-cards' }, [
      element('article', { className: 'compare-card', style: { borderTop: '4px solid var(--blue)' } }, [
        element('p', { className: 'eyebrow', text: a.league }),
        element('h2', {}, [teamLink(a.id, a.name, 'team-link team-link-a')]),
        element('div', { className: 'compare-rating', text: Math.round(a.rating) }),
        element('p', { className: 'muted', text: `Rating-Abweichung: ${Math.round(a.rating_deviation)}` }),
        element('div', { className: 'team-extra' }, [
          element('span', { text: `Saison: ${a.season}` }),
          element('span', { text: `Gruppe: ${a.group ? 'Gruppe ' + a.group : 'Nicht veröffentlicht'}` }),
          element('a', { className: 'team-link team-link-a', text: 'Teamdetails anzeigen →', attributes: { href: `${ROOT}teams/team_detail.html?id=${encodeURIComponent(a.id)}` } })
        ])
      ]),
      element('article', { className: 'compare-card', style: { borderTop: '4px solid #14B8A6' } }, [
        element('p', { className: 'eyebrow', text: b.league }),
        element('h2', {}, [teamLink(b.id, b.name, 'team-link team-link-b')]),
        element('div', { className: 'compare-rating', style: { color: '#14B8A6' }, text: Math.round(b.rating) }),
        element('p', { className: 'muted', text: `Rating-Abweichung: ${Math.round(b.rating_deviation)}` }),
        element('div', { className: 'team-extra' }, [
          element('span', { text: `Saison: ${b.season}` }),
          element('span', { text: `Gruppe: ${b.group ? 'Gruppe ' + b.group : 'Nicht veröffentlicht'}` }),
          element('a', { className: 'team-link team-link-b', text: 'Teamdetails anzeigen →', attributes: { href: `${ROOT}teams/team_detail.html?id=${encodeURIComponent(b.id)}` } })
        ])
      ])
    ]);

    const histA = ratingHistory.history?.filter(row => row.team_id === a.id) || [];
    const histB = ratingHistory.history?.filter(row => row.team_id === b.id) || [];

    const series = [
      { name: a.name, rows: [{ date: 'Ausgangsrating', rating: a.initial_rating }, ...histA.slice(-10)] },
      { name: b.name, rows: [{ date: 'Ausgangsrating', rating: b.initial_rating }, ...histB.slice(-10)] }
    ];

    let chartPanel = null;
    if (series.every(item => item.rows.length > 0)) {
      chartPanel = element('section', { className: 'history-panel comparison-history-panel' }, [
        element('h2', { text: 'Vergleichbarer Rating-Verlauf' }),
        element('div', { className: 'rating-history-canvas' }, [
          element('div', { className: 'rating-chart-maintenance', text: 'Rating chart vorrübergehend nicht verfügbar, wird nochmal überarbeitet.' })
        ])
      ]);
    }

    replaceChildren(target, [prediction, compareCardsNode, chartPanel]);
  };

  document.querySelector('#compare-a')?.addEventListener('change', render);
  document.querySelector('#compare-b')?.addEventListener('change', render);
  render();
}

async function teamDetailPage() {
  const [teams, history, predictionHistory, performanceHistory, sustainability] = await Promise.all([
    load('teams'),
    load('ratingHistory'),
    load('predictionHistory'),
    load('performanceHistory').catch(() => ({ history: [] })),
    load('teamSustainability').catch(() => ({ history: [] }))
  ]);
  const leagueThresholds = currentLeagueThresholds(teams, performanceHistory);
  const teamId = new URLSearchParams(window.location.search).get('id');
  const team = teams.teams.find(item => item.id === teamId);
  const target = document.querySelector('#team-detail');
  if (!team) { if (target) replaceChildren(target, [emptyState('This team could not be found in the public snapshot.')]); return; }

  if (target) {
    const statCards = [
      ['Rating', Math.round(team.rating)],
      ['Rating-Abweichung', Math.round(team.rating_deviation)],
      ['Prognostiziertes nachhaltiges Niveau', predictedSustainableLevel(team)],
      ['Liga-Confidence', team.league_confidence ? percent(team.league_confidence) : '—'],
      ['Gespielte Spiele', team.matches_played]
    ].map(([label, value]) => element('article', { className: 'performance-card' }, [
      element('div', { className: 'performance-value', text: value }),
      element('div', { className: 'performance-label', text: label })
    ]));
    statCards.push(element('article', { className: 'performance-card' }, [
      element('div', { className: 'performance-label', text: 'Daten vom' }),
      element('div', { className: 'performance-value', text: 'Wird geladen...', attributes: { id: 'home-updated' } }),
      element('div', { className: 'performance-label', text: 'Öffentlicher Snapshot' })
    ]));
    replaceChildren(target, [
      element('section', { className: 'team-hero' }, [
        element('p', { className: 'eyebrow', text: `${team.league}${team.group ? ' · Group ' + team.group : ''}` }),
        element('h1', {}, [
          element('span', { text: team.name }),
          element('small', { className: 'team-abbreviation team-detail-abbreviation', text: teamAbbreviation(team) })
        ]),
        element('p', { className: 'muted', text: `Saison ${team.season}` })
      ]),
      element('section', { className: 'team-stats' }, statCards),
      resultsPanel(team, predictionHistory.history),
      historyPanel(
        team,
        history.history,
        leagueThresholds,
        sustainability,
        history.season_transitions,
        predictionHistory
      )
    ]);
  }
}

async function performancePage() {
  const [data, performanceHistory] = await Promise.all([
    load('performance'),
    load('performanceHistory')
  ]);
  const select = document.querySelector('#performance-period');
  const periods = data.periods || [{ id: 'all_time', label: 'Gesamtzeitraum', ...data }];
  if (select) select.append(...periods.map(period => element('option', { text: period.label, attributes: { value: period.id } })));
  const render = () => {
    const period = periods.find(item => item.id === select?.value) || periods[0];
    const target = document.querySelector('#performance-summary');
    if (target) replaceChildren(target, [['Accuracy', percent(period.accuracy)], ['Log Loss', Number(period.log_loss).toFixed(3)], ['Brier Score', Number(period.brier_score).toFixed(3)], ['Calibration Error', Number(period.calibration_error).toFixed(3)], ['Vorhersagen', period.predictions], ['Auswertungszeitraum', `${dateLabel(period.evaluation_start)} - ${dateLabel(period.evaluation_end)}`]].map(([label, value]) => element('article', { className: 'performance-card' }, [element('div', { className: 'performance-value', text: value }), element('div', { className: 'performance-label', text: label })])));
    const chartTarget = document.querySelector('#performance-history-chart');
    if (chartTarget && !chartTarget.dataset.rendered) {
      replaceChildren(chartTarget, [
        historicalPerformanceCharts(performanceHistory.history)
      ]);
      chartTarget.dataset.rendered = 'true';
    }
    const runtimeTarget = document.querySelector('#performance-runtime');
    if (runtimeTarget) {
      const runtime = data.runtime_display || (
        Number.isFinite(Number(data.runtime_seconds))
          ? `${Number(data.runtime_seconds).toFixed(2)} Sekunden`
          : 'Nicht verfügbar'
      );
      const timestamp = data.runtime_generated_at
        ? ` · Stand: ${technicalDateLabel(data.runtime_generated_at)}`
        : '';
      replaceChildren(runtimeTarget, [
        element('div', {}, [
          element('strong', { text: 'Letzte Publish-Laufzeit (Engine + Sync): ' }),
          element('span', { text: `${runtime}${timestamp}` })
        ])
      ]);
    }
  };
  select?.addEventListener('change', render);
  render();
}

async function run() {
  try {
    if (page === 'changelog') {
      await changelogPage();
      return;
    }
    const predictions = await load('predictions');

    if (page === 'home') await home();
    if (page === 'predictions') await predictionsPage();
    if (page === 'teams') await teamsPage();
    if (page === 'team-detail') await teamDetailPage();
    if (page === 'compare') await comparePage();
    if (page === 'performance') await performancePage();

    const homeUpdated = document.querySelector('#home-updated');
    if (homeUpdated) homeUpdated.textContent = technicalDateLabel(predictions.generated_at);
  } catch (error) {
    document.querySelectorAll('.loading').forEach(target => showError(target, error));
  }
}

document.querySelector('.menu-toggle')?.addEventListener('click', event => {
  const nav = document.querySelector('#site-nav');
  const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
  event.currentTarget.setAttribute('aria-expanded', String(!expanded));
  nav?.classList.toggle('open', !expanded);
});

function initTheme() {
  const getStoredTheme = () => {
    try { return localStorage.getItem('theme') || 'system'; } catch (e) { return 'system'; }
  };
  const setStoredTheme = (val) => {
    try { localStorage.setItem('theme', val); } catch (e) {}
  };

  let currentTheme = getStoredTheme();

  const getResolvedTheme = () => {
    if (currentTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return currentTheme;
  };

  const applyTheme = () => {
    const resolved = getResolvedTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    updateButtonUI(resolved);
  };

  const updateButtonUI = (resolved) => {
    const themeBtn = document.querySelector('#theme-toggle');
    if (themeBtn) {
      themeBtn.setAttribute('aria-label', `Design: ${resolved === 'dark' ? 'Dunkel' : 'Hell'}`);
      themeBtn.title = resolved === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      themeBtn.innerHTML = resolved === 'dark' ? MOON_SVG : SUN_SVG;
    }
  };

  const mountHeaderControls = () => {
    const header = document.querySelector('.site-header');
    if (!header) return;

    let brandZone = header.querySelector('.header-brand-zone');
    if (!brandZone) {
      const brand = header.querySelector('.brand');
      if (brand) {
        brandZone = element('div', { className: 'header-brand-zone' }, [brand]);
        header.prepend(brandZone);
      }
    }

    let actionsZone = header.querySelector('.header-actions-zone');
    if (!actionsZone) {
      const menuToggle = header.querySelector('.menu-toggle');
      actionsZone = element('div', { className: 'header-actions-zone' }, [menuToggle]);
      header.append(actionsZone);
    }

    if (!actionsZone.querySelector('#theme-toggle')) {
      const resolved = getResolvedTheme();
      const themeBtn = element('button', {
        className: 'header-btn',
        attributes: {
          id: 'theme-toggle',
          type: 'button',
          'aria-label': `Design: ${resolved === 'dark' ? 'Dunkel' : 'Hell'}`,
          title: resolved === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
        }
      });
      themeBtn.innerHTML = resolved === 'dark' ? MOON_SVG : SUN_SVG;
      actionsZone.prepend(themeBtn);
    }

    updateButtonUI(getResolvedTheme());

    document.querySelector('#theme-toggle')?.addEventListener('click', () => {
      let resolved = getResolvedTheme();
      currentTheme = resolved === 'dark' ? 'light' : 'dark';
      setStoredTheme(currentTheme);
      applyTheme();
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') applyTheme();
  });

  applyTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountHeaderControls);
  } else {
    mountHeaderControls();
  }
}

function initWelcomeModal() {
  if (page !== 'home') return;

  const modal = document.querySelector('#welcome-modal');
  const closeButton = document.querySelector('#welcome-modal-close');
  if (!modal || !closeButton) return;

  const storageKey = 'welcome-modal-dismissed';
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(storageKey) === 'true';
  } catch (error) {
    dismissed = false;
  }

  if (!dismissed) {
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', 'open');
    }
  }

  closeButton.addEventListener('click', () => {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch (error) {}

    if (typeof modal.close === 'function' && modal.open) {
      modal.close();
    } else {
      modal.removeAttribute('open');
    }
  });
}

function initCopyName() {
  const copyButton = document.querySelector('.copy-name-button');
  const status = document.querySelector('.copy-name-status');
  if (!copyButton || !status) return;

  copyButton.addEventListener('click', async () => {
    const name = 'sweetdweams';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(name);
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = name;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        fallback.remove();
        if (!copied) throw new Error('Clipboard copy was rejected');
      }
      status.textContent = 'Kopiert!';
      copyButton.setAttribute('aria-label', 'Namen sweetdweams kopiert');
    } catch (error) {
      status.textContent = 'Kopieren nicht möglich';
      copyButton.setAttribute('aria-label', 'Namen sweetdweams kopieren, fehlgeschlagen');
    }

    window.setTimeout(() => {
      status.textContent = '';
      copyButton.setAttribute('aria-label', 'Namen sweetdweams kopieren');
    }, 2500);
  });
}

const dataStampPlaceholders = new WeakMap();

function positionHomeDataStamp() {
  const stamp = document.getElementById('1');
  const main = document.getElementById('main-content');
  const header = document.querySelector('.site-header');
  const { page } = document.body?.dataset ?? {};
  if (!stamp || !main || !header || page === 'about') return;

  const anchorSelector = page === 'home'
    ? '.dashboard-grid'
    : page === 'compare'
      ? '.toolbar.compare-controls'
      : page === 'predictions' || page === 'performance' || page === 'teams'
      ? '.toolbar'
      : '.page-intro';
  const anchor = main.querySelector(anchorSelector);
  if (!anchor) return;

  const anchorRect = anchor.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const viewportGap = Math.max(16, Math.min(32, anchorRect.left / 6));
  const mainGap = viewportGap;
  const stampWidth = Math.ceil(stamp.scrollWidth);
  const stampLeft = Math.max(viewportGap, anchorRect.left - mainGap - stampWidth);
  const top = Math.max(headerRect.bottom + viewportGap, anchorRect.top);
  const shouldStackStamp = page === 'home'
    ? window.innerWidth < 1280 || anchorRect.left <= stampWidth + mainGap + viewportGap
    : anchorRect.left <= stampWidth + mainGap + viewportGap;

  document.body.classList.toggle('data-stamp-below-intro', shouldStackStamp);
  if (shouldStackStamp) {
    stamp.style.removeProperty('--data-stamp-left');
    stamp.style.removeProperty('--data-stamp-top');
    if (page !== 'home') {
      if (!dataStampPlaceholders.has(stamp)) {
        const placeholder = document.createComment('data-stamp-position');
        stamp.before(placeholder);
        dataStampPlaceholders.set(stamp, placeholder);
      }
      anchor.before(stamp);
    }
  }

  if (!shouldStackStamp) {
    if (page !== 'home') {
      const placeholder = dataStampPlaceholders.get(stamp);
      if (placeholder) placeholder.after(stamp);
    }
    stamp.style.setProperty('--data-stamp-left', `${stampLeft}px`);
    stamp.style.setProperty('--data-stamp-top', `${top}px`);
  }
}

function scheduleDataStampPosition() {
  window.requestAnimationFrame(() => {
    positionHomeDataStamp();
    window.requestAnimationFrame(positionHomeDataStamp);
  });
}

initTheme();
initWelcomeModal();
initCopyName();
scheduleDataStampPosition();
window.addEventListener('load', scheduleDataStampPosition, { once: true });
window.addEventListener('resize', scheduleDataStampPosition);
window.addEventListener('scroll', positionHomeDataStamp, { passive: true });
if (typeof ResizeObserver !== 'undefined') {
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    new ResizeObserver(scheduleDataStampPosition).observe(mainContent);
  }
}
if (document.fonts?.ready) {
  document.fonts.ready.then(scheduleDataStampPosition);
}
run();
