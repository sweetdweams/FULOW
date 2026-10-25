# Uniliga Match Predict

Static public website for already generated match-prediction results.

## Local preview

Run a static server from this directory, for example:

```text
python -m http.server 8000
```

Then open `http://localhost:8000/`.

The site only reads JSON files from `data/`. It does not contain the private prediction engine, settings, training data, feature calculations, model weights or calibration internals. The JSON snapshot is generated separately by the private project with `python publish.py` and then copied into this repository's `data/` directory.

## How the current model works

The private engine processes every match strictly in chronological order. It
maintains Glicko-based team ratings, rating deviation (RD) and volatility.
Inactivity increases the RD, while new results update both the rating and its
uncertainty. Each prediction uses only information available before that
match.

The model combines the rating difference with several matchup signals:

- recent form and recency weighting
- direct head-to-head matches
- common-opponent results
- graph-path evidence through shared opponents
- the strength of previous opponents
- league strength differences and the current RD

These signals are combined into a match score and converted into a win
probability. Feature weights are learned incrementally after completed
matchdays with regularization and can be overridden per league for direct
matches, common opponents and graph paths. Confidence reflects the available
evidence and the uncertainty of both teams. Probability calibration is learned
chronologically from prior predictions only.

### Season transitions

Team IDs remain stable across seasons, so historical ratings and predictions
can be connected without confusing a rename with a new team. Promotion,
relegation and wildcards are explicit state transitions:

- Existing teams start every wildcard attempt with their final regular-season
  rating.
- A failed wildcard attempt is discarded before a follow-up attempt.
- After the wildcard path is finalized, only the actual wildcard rating change
  is applied once, followed by the season adjustment.
- New teams receive a configured target-league wildcard seed, do not receive a
  season adjustment and retain their actual wildcard rating after success.

The engine also derives an informational sustainable-league distribution from
rating, RD and configured league thresholds. This estimate does not replace
the official league assignment.

### Optimization and evaluation

The optional optimization workflow uses a chronological 70/30 train/holdout
split. Optuna TPE searches up to 200 trials with seed 42. The objective is
walk-forward Log Loss; the holdout remains untouched during optimization.
Optional Platt scaling is fitted only on training predictions using
`sigmoid(a * logit(p) + b)`.

Published performance includes Accuracy, Log Loss, Brier Score and Calibration
Error. The browser never recalculates ratings, probabilities, optimization or
metrics; it only renders the generated JSON snapshot.

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
