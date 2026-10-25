# Uniliga Match Predict

Static public website for already generated match-prediction results.

## Local preview

Run a static server from this directory, for example:

```text
python -m http.server 8000
```

Then open `http://localhost:8000/`.

The site only reads JSON files from `data/`. It does not contain the private prediction engine, settings, training data, feature calculations, model weights or calibration internals. The JSON snapshot is generated separately by the private project with `python publish.py` and then copied into this repository's `data/` directory.

## How the model works

The private engine processes matches in chronological order. It maintains
Glicko-style team ratings and rating deviation (RD), then combines the rating
difference with recent form, direct matches, common opponents, graph-path
evidence and opponent quality. The evidence weights can vary by league.
Predictions use only information available before the match and are published
as win probabilities with uncertainty-aware confidence.

Seasons are connected through stable team IDs. Promotion, relegation and
wildcards are explicit transitions: existing teams carry their previous
regular-season rating into wildcard attempts, failed attempts are reset before
a follow-up, and a successful wildcard change is applied once before the
season adjustment. New teams receive a configured target-league wildcard seed.
The engine also derives an informational sustainable-league distribution from
rating, RD and league thresholds; this does not replace the official league.

The optional optimization workflow uses a chronological walk-forward train and
holdout split. Parameters are optimized for Log Loss, and optional Platt
scaling is fitted only on training predictions. Published performance includes
Accuracy, Log Loss, Brier Score and Calibration Error. The browser never
recalculates these values; it only renders the generated JSON snapshot.

The Analytics page uses the optional historical and crossover-zone series in
`data/performance.json`. Older snapshots without these fields remain usable
and show the regular summary cards without the historical chart.

The same payload also contains the latest successful publish runtime, including
the engine run and public data synchronization.

During `python publish.py`, the private project also synchronizes the HTML
metadata for the web version, engine version and latest dataset update across
all public pages. The visible values on the Model page are updated in the same
step.

The canonical historical chart data is `performance.json.matchday_history`.
Each entry represents one season/matchday and contains cumulative performance
metrics plus the three dynamic crossover-zone rating boundaries used by the
chart. Its `label` is derived from the match phases in that snapshot rather
than from the matchday; multiple phases are listed together. The boundaries are calculated from the historical ratings as the
midpoint between the lowest-rated team in the upper league and the
highest-rated team in the lower league.

The Analytics page loads the chart series from the dedicated
`data/performance_history.json` snapshot. This keeps the chart payload
independent from the aggregate performance cards.

Each historical crossover zone also includes a `sigma` value. It is a
conservative two-sided uncertainty interval for the crossover midpoint with
more than 97% normal-distribution coverage, limited to 25–300 rating points.
The ranking page uses the current season's published sigma for both its
crosszone label and highlighted rating range.

Team rating history also exposes `season_transitions`. These are explicit
non-match events for wildcard starts, wildcard attempts, seasonal adjustment
and the actual season start. They retain the previous season-end rating, each
attempt's start/end/status, the actual wildcard rating change, and the
adjustment input/output. The team detail chart renders wildcard matches with
fainter dashed lines, separates the wildcard marker from the season-start
marker, and omits a seasonal-adjustment element for new teams.

`prediction_history.json` also contains a canonical `crosszone_history` timeline
with historical `crossover_zones` for regular-season, wildcard, and relegation
matchdays. Playoff and showdown matchdays are excluded. Every team detail chart
uses this shared timeline, so the automatic zone and dropdown selection show the
same step positions and values.

Legal pages are structural placeholders and require real provider details and jurisdiction-specific review before publication.
