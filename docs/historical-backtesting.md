# Historical Backtesting And Calibration

This workflow adds a first official-data-grounded calibration loop to Orya One RaceSim without changing the public simulator surface.

## Goals

The historical layer is designed to:

1. ingest official Formula 1 / FIA weekend outputs
2. normalize them into a stable project schema
3. map them onto the existing lap-by-lap simulation engine
4. run Monte Carlo backtests against real weekends
5. score simulator quality with explicit calibration metrics
6. produce repeatable evidence for manual tuning

This is not a claim that the simulator fully reconstructs history. It is a structured realism loop.

## Data layout

```text
data/historical/
  raw/
    formula1/
      2024-*.json
  normalized/
    2024-*.json
  catalog/
    2024_seed_bundle.json
  reports/
    2024-backtest-*.json
    2024-backtest-*.md
```

### What each layer means

- `raw/`: curated extracts from official Formula 1 result pages
- `normalized/`: validated project schema for historical weekends
- `catalog/`: modeled seed priors used to simulate the historical field
- `reports/`: backtest outputs and markdown summaries

The raw extracts remain official-source grounded. The seed bundle is explicitly modeled.

## Supported official source types

The ingestion schema supports:

- race classification
- starting grid / qualifying classification
- pit stop summary
- lap chart
- lap analysis
- race control messages
- sector summary
- weather timing
- sprint classification

The first pass curates Formula1.com official result pages first. FIA race-control style sources are already represented in the schema and can be added incrementally.

## Normalized schema

Each `HistoricalWeekend` stores:

- season / round
- event and circuit identifiers
- official source references
- coverage flags
- entrants with:
  - driver and team ids
  - qualifying position
  - starting grid
  - finish position
  - points
  - DNF status
  - pit stop count when available
  - first stop lap when available
  - position-change proxy
- pit stop events
- neutralization windows
- weather markers
- notes

## Initial first-pass coverage

The initial curated subset covers:

- Monaco 2024
- Great Britain 2024
- Belgium 2024
- Italy 2024
- Azerbaijan 2024
- Singapore 2024

Coverage is intentionally honest. The current extracts are mostly top-10 depth with partial pit-stop detail for the lead group. Coverage flags make that explicit.

## Commands

Normalize the raw official extracts:

```bash
python -m racesim.historical.cli normalize --season 2024
```

Run JSON backtests:

```bash
python -m racesim.historical.cli backtest --season 2024 --runs 250
```

Generate JSON and Markdown reports:

```bash
python -m racesim.historical.cli report --season 2024 --runs 250
```

Equivalent Make targets:

```bash
make historical-normalize
make historical-backtest
make historical-report
```

## Current backtest metrics

Per weekend:

- winner hit
- actual winner probability
- podium overlap
- top-10 overlap
- mean absolute finish error
- qualifying-to-race conversion error
- stop-count error when pit data exists
- first-stop error when pit data exists
- DNF Brier score
- simulated vs actual position-change proxy
- track-behavior error

Aggregate reports also emit heuristic calibration hints.

## How to add another historical weekend

1. Add a raw official extract in `data/historical/raw/formula1/`.
2. Reference the official Formula1.com or FIA sources in `source_refs`.
3. Keep the extract faithful to the official output. If you derive a signal, mark it as `derived`.
4. Ensure the driver/team identities exist in `data/historical/catalog/2024_seed_bundle.json` or add them.
5. Run:

```bash
python -m racesim.historical.cli normalize --season 2024 --events <grand-prix-id>
python -m racesim.historical.cli report --season 2024 --events <grand-prix-id> --runs 250
```

## Known limitations

- The current seed bundle is modeled, not official performance data.
- Weekend coverage is not yet full-field for every event.
- Pit and weather timing are only partially captured in the first pass.
- FIA documents are schema-supported but not yet broadly curated into the raw layer.
- Calibration is still manual and semi-structured rather than fully optimized.

That is expected for this pass. The objective is an honest, repeatable, evidence-based tuning loop.
