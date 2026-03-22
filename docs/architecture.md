# Architecture Overview

Orya One RaceSim is organized as a small monorepo with a clear split between presentation, transport, and simulation logic. The architecture is intentionally modest, with boundaries chosen to keep the project maintainable and easy to extend.

## Repository structure

```text
apps/
  api/        FastAPI HTTP service
  web/        Next.js App Router frontend
packages/
  sim-core/   Shared simulation, strategy, event, and model code
data/         Sample catalogs, training data, and schemas
docs/         Technical, demo, and release-facing documentation
```

## End-to-end flow

1. The frontend loads catalog defaults from the API.
2. The user configures a scenario in the simulator workspace.
3. The API validates the request and forwards it into `packages/sim-core`.
4. `sim-core` resolves:
   - pace prior estimation
   - strategy scoring and selection
   - event generation
   - Monte Carlo race resolution
5. The API returns typed results for the UI to render as metrics, charts, tables, and explainability cards.

## Layer breakdown

### `apps/web`

Responsibilities:

- landing, simulator, and methodology surfaces
- dense but readable control grouping
- result presentation and chart rendering
- landing and documentation surfaces

### `apps/api`

Responsibilities:

- HTTP transport and CORS configuration
- typed request / response boundaries
- defaults, strategy suggestion, and simulation endpoints
- translation of catalog lookup failures into useful HTTP errors

### `packages/sim-core`

Responsibilities:

- sample-data loading
- pace-model training and fallback inference
- strategy scoring and recommendation
- event generation and incident logic
- Monte Carlo aggregation
- construction of driver, team, and scenario summaries

## Why the hybrid architecture matters

The project intentionally avoids treating all motorsport behavior as a black-box modeling problem.

- The neural model estimates the baseline pace prior.
- Deterministic logic handles race effects that should stay visible.
- The event engine introduces controlled uncertainty.
- Monte Carlo resolution aggregates uncertainty into usable probabilities.

This keeps the simulator explainable while still giving it a real modeling core.

## Current realism boundary

The architecture supports meaningful scenario exploration without pretending to deliver lap-perfect race reconstruction.

Today the simulator is:

- event-aware
- stint-aware
- strategy-aware
- probability-driven

It is not yet:

- full lap-by-lap physics
- standalone qualifying-session simulation
- calibrated to real telemetry or race control logs

## Extension points

The current code structure is already suitable for:

- qualifying simulation and grid generation
- richer weather transitions by lap window
- pit-stop optimization
- teammate interactions
- calibration against real historical data
- more granular restart and bunching behavior

Those additions can be layered on top of the current architecture without replacing the frontend or API surface.
