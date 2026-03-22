# Orya One RaceSim

![Status](https://img.shields.io/badge/status-showcase%20mvp-0f172a?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-15-111111?style=flat-square&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-0f766e?style=flat-square&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.11+-1d4ed8?style=flat-square&logo=python)
![License](https://img.shields.io/badge/license-MIT-b45309?style=flat-square)

Orya One RaceSim is an open-source motorsport simulation platform for Grand Prix scenario analysis. It combines a neural pace prior, deterministic strategy and race logic, dynamic event simulation, and Monte Carlo aggregation inside a serious, product-grade web interface.

The goal is to offer a credible, technically interesting simulation workspace that feels worth publishing, forking, and building on.

## Why this project exists

Most public motorsport simulators land in one of three weak categories:

- static dashboards with little real scenario value
- black-box predictors that hide how the result was produced

Orya One RaceSim takes the opposite path:

- a small neural network estimates a pace prior
- deterministic logic handles the race mechanics that should stay explicit
- an event engine introduces believable uncertainty
- Monte Carlo aggregation turns everything into probability distributions, not hard claims

The result is a research/product-grade MVP with a clear path to deeper realism.

## Feature highlights

- Premium simulator workspace with grouped control layers
- Grand Prix selection, weather presets, and event-pressure tuning
- Strategy assignment plus scenario-aware strategy recommendations
- Driver-level adjustments for controlled experimentation
- Monte Carlo results for win, podium, top-10, DNF, and expected finish
- Event-impact summaries and confidence language
- Team-level outlook and explainability cards
- Original branding and synthetic public-safe sample data

## Quick start

### 1. Create a Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
make setup
```

Equivalent manual steps:

```bash
pip install -r apps/api/requirements.txt
pip install -e packages/sim-core
npm install
```

### 3. Start the API

```bash
make dev-api
```

### 4. Start the web app

```bash
make dev-web
```

The frontend targets `http://localhost:8000/api` by default.

## Demo-ready simulator presets

The simulator includes showcase presets intended for screenshots and walkthroughs:

- `Harbor volatility`
- `Street-track control`
- `Thermal deg pressure`

The best all-around preset for demos is `Harbor volatility`, which produces the richest balance of event activity, strategy variation, and visually interesting outputs.

See [docs/demo-guide.md](docs/demo-guide.md) for exact capture guidance.

## Product surfaces

### Landing page

Frames the product as a serious motorsport analytics tool and explains the hybrid architecture clearly.

### Simulator workspace

Organized into five grouped control areas:

1. GP & Scenario
2. Environment & Dynamic Events
3. Strategy Controls
4. Driver Adjustments
5. Simulation Settings

### Results dashboard

Presents:

- expected finishing order
- confidence labels
- strategy fit scores
- event exposure
- disruption summaries
- recommendation cards
- team outlook

### Methodology page

Explains the neural model, deterministic logic, event engine, Monte Carlo aggregation, and current simplifications.

## Hybrid simulation overview

### Neural pace model

A compact PyTorch MLP estimates a baseline pace prior from tabular features such as:

- recent form
- qualifying strength
- tire management
- overtaking ability
- consistency
- wet-weather skill
- reliability
- track context

Important boundary:

- it does not directly predict the finishing order
- it provides the pace signal that the wider simulation builds on

### Deterministic race logic

The explicit rules layer models:

- tire degradation
- fuel sensitivity
- qualifying and track-position leverage
- pit-loss penalties
- team pit efficiency
- reliability pressure
- strategy-template interactions

### Strategy engine

The strategy engine scores templates against the current scenario using:

- track-position pressure
- overtaking bandwidth
- weather pressure
- safety-car probability
- tire stress
- driver strengths such as tire management and consistency

Each recommendation includes:

- selected strategy
- risk label
- rationale bullets
- tradeoff statement

### Event engine

The event engine models:

- wet starts
- weather shifts
- yellow flags
- VSCs
- safety cars
- red flags
- local incidents
- DNFs
- late-race disruptions

These alter degradation pressure, pit-value timing, reliability stress, and finish-position variance.

### Monte Carlo engine

The simulator runs many races and aggregates:

- finish distributions
- win / podium / top-10 probabilities
- DNF rates
- strategy success
- uncertainty and confidence labels
- event-impact summaries
- team-level outlook

## Architecture overview

```text
apps/
  api/        FastAPI service
  web/        Next.js frontend
packages/
  sim-core/   Simulation, model, strategy, and event logic
data/         Sample catalogs, schemas, and training data
docs/         Technical and release-facing documentation
```

Further reading:

- [docs/architecture.md](docs/architecture.md)
- [docs/methodology.md](docs/methodology.md)
- [docs/data-model.md](docs/data-model.md)
- [docs/demo-guide.md](docs/demo-guide.md)
- [docs/deployment.md](docs/deployment.md)

## Local development commands

### Install

```bash
make setup
```

### Train the pace model artifact

```bash
make train-model
```

### Run checks

```bash
make check
```

### Individual commands

```bash
make test
make lint-web
make build-web
```

## Environment configuration

### API

See [apps/api/.env.example](apps/api/.env.example).

- `CORS_ORIGINS` accepts a comma-separated list of local frontend origins

### Web

See [apps/web/.env.example](apps/web/.env.example).

- `NEXT_PUBLIC_API_URL` points the frontend at the FastAPI service

## Deployment overview

Recommended production setup:

- frontend on Vercel
- FastAPI backend deployed separately

The frontend is already prepared to work with:

- a hosted API URL in production via `NEXT_PUBLIC_API_URL`
- a local API in development via the built-in fallback to `http://localhost:8000/api`

Backend recommendation:

- deploy the FastAPI service separately
- easiest platform: Render

Production variables:

- Vercel: `NEXT_PUBLIC_API_URL=https://YOUR-API-HOST/api`
- Backend: `CORS_ORIGINS=https://YOUR-FRONTEND-HOST`

Exact deployment steps are in [docs/deployment.md](docs/deployment.md).

## Vercel quick deploy

1. Push the repository to GitHub.
2. In Vercel, create a new project from the repo.
3. Set `Root Directory` to `apps/web`.
4. Add `NEXT_PUBLIC_API_URL` in Project Settings.
5. Set it to your deployed backend URL with `/api` at the end.
6. Deploy.

Do not leave `NEXT_PUBLIC_API_URL` unset in production. The frontend now throws a clear error if it is missing.

## Verification and test notes

Verified locally with:

- `pytest`
- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`

Note on API tests:

- `apps/api/tests/test_api.py` uses `pytest.importorskip("fastapi")`
- if FastAPI is not installed in the active Python environment, the API test module skips cleanly
- once `apps/api/requirements.txt` is installed, the API path runs normally

## Suggested screenshots

Recommended static captures for a public GitHub README or social post:

1. Landing page hero on desktop
2. Simulator control column with `Harbor volatility` preset loaded
3. Results dashboard with event-impact cards and expected order table visible
4. Strategy recommendation panel plus explainability cards
5. Methodology page overview

See [docs/demo-guide.md](docs/demo-guide.md) for exact scenario settings, viewport guidance, and capture order.

## Screenshot / demo placeholders

Suggested README placement once assets exist:

- `assets/readme/landing-overview.png`
- `assets/readme/simulator-controls.png`
- `assets/readme/results-dashboard.png`
- `assets/readme/strategy-and-explainability.png`

Suggested demo additions:

- short GIF of switching presets and running a simulation
- 30 to 60 second walkthrough clip

## Project status

Current status: `showcase-quality MVP`

What that means:

- the product is intentionally polished and public-ready
- the modeling approach is coherent and documented
- the current realism level is meaningful, but not maximal
- the codebase is structured for future calibration and realism upgrades

## Current limitations

- sample data is synthetic and not calibrated to real telemetry
- race resolution is event-aware and stint-aware, not full lap-by-lap simulation
- qualifying is modeled as an influence factor, not a standalone session engine
- safety-car behavior is abstracted into pit-value and compression effects
- strategy recommendations are scenario-aware but not exhaustive optimization outputs

These are deliberate MVP boundaries, not hidden caveats.

## Future realism improvements

Short-term:

- qualifying simulation and grid generation
- richer weather transitions by lap window
- pit-stop optimization and undercut / overcut search

Mid-term:

- calibration against historical data
- teammate interactions
- richer restart and bunching behavior
- benchmark and evaluation workflows

Longer-term:

- lap-by-lap simulation mode
- deeper explainability by stint
- multi-race comparison mode

See [docs/roadmap.md](docs/roadmap.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance, expected checks, and pull request standards.

## Changelog

The first public-release scaffold is in [CHANGELOG.md](CHANGELOG.md).

## License

Released under the [MIT License](LICENSE).

## Research notice

Orya One RaceSim is a research/demo simulator. It is not a guaranteed predictor of real-world race outcomes and is not intended for wagering, betting, or unauthorized use of protected motorsport branding.
