# Architecture Overview

Orya One RaceSim is split into a small web app, a thin API, and a shared simulation package. The main design choice is to keep the UI and transport simple while putting the race logic in `packages/sim-core`.

## Repository structure

```text
apps/
  api/        FastAPI HTTP service
  web/        Next.js App Router frontend
packages/
  sim-core/   Shared simulation, lap engine, strategy logic, and model code
data/         2026 Formula 1 season catalogs, schemas, and training data
docs/         Technical notes and public documentation
```

## End-to-end flow

1. The frontend loads the 2026 season defaults from the API.
2. The user configures a Grand Prix weekend in the simulator.
3. The API validates the request and forwards it into `packages/sim-core`.
4. `sim-core` resolves:
   - pace prior estimation
   - strategy scoring and recommendations
   - lap-by-lap race simulation
   - event generation and race-control timing
   - Monte Carlo aggregation
5. The API returns typed results for the UI to render as the strategy board, timing strip, charts, and detailed tables.

## Layer breakdown

### `apps/web`

Responsibilities:

- landing, simulator, and methodology pages
- control grouping and interaction flow
- rendering summary metrics, charts, and tables
- surfacing diagnostics in a way that is still usable

### `apps/api`

Responsibilities:

- HTTP transport
- typed request and response boundaries
- defaults, strategy suggestion, and simulation endpoints
- health and lookup error handling

The API does not try to own race logic. It is a thin wrapper around `sim-core`.

### `packages/sim-core`

Responsibilities:

- loading the 2026 catalog
- pace-model training and inference
- strategy scoring
- lap-by-lap race state
- event scheduling
- Monte Carlo aggregation
- driver, team, and scenario summaries

Important modules:

- `sim/engine.py`: main runtime entrypoint
- `sim/lap_engine.py`: lap-by-lap race progression
- `sim/events.py`: weather and race-control timeline generation
- `sim/state.py`: race-state dataclasses
- `sim/strategies.py`: strategy fit and suggestions
- `historical/normalize.py`: official extract normalization into weekend fixtures
- `historical/backtest.py`: historical weekend replay and calibration runner
- `historical/metrics.py`: backtest scoring and calibration heuristics

## Why the split matters

The project does not try to force everything through a black-box model.

- The neural model estimates baseline pace.
- Strategy scoring remains explicit.
- Race flow is resolved lap by lap.
- Monte Carlo aggregation turns race flow into probabilities.

That split keeps the app easier to inspect and extend.

## What is real and what is modeled

Real 2026 season data in the current app:

- team names
- driver names
- Grand Prix names
- circuit names
- calendar order
- Sprint weekend flags

Modeled or estimated inputs:

- team pace priors
- driver pace priors
- circuit behavior weights
- event priors
- strategy scoring inputs
- tire and overtake simplifications

## Runtime path used by the app

The app’s main simulation path is now the lap-by-lap engine.

`POST /api/simulate` -> `SimulationService.simulate()` -> `LapRaceEngine.simulate_run()` for each Monte Carlo sample.

The API response also identifies the engine explicitly with:

- `scenario.simulation_engine = "lap-by-lap"`
- `/api/health` -> `simulation_engine: "lap-by-lap"`

## Current realism boundary

The current architecture is materially stronger than the old aggregate ranking model, but it is still not:

- a sector-by-sector or corner-by-corner simulator
- a separate qualifying + Sprint + race weekend engine
- calibrated from official FIA telemetry
- a full team-strategy optimizer

Those are the next realism steps, not hidden gaps in the current design.

## Historical calibration layer

The repository now also includes a historical backtesting workflow under `packages/sim-core/src/racesim/historical`.

That layer is intentionally separate from the public simulator path:

- official historical extracts live in `data/historical/raw`
- normalized weekend fixtures live in `data/historical/normalized`
- modeled seed priors live in `data/historical/catalog`
- calibration reports live in `data/historical/reports`

This keeps official evidence, modeled assumptions, and tuned simulator behavior auditable instead of blending them together.
