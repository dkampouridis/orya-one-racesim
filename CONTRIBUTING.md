# Contributing

Thanks for contributing to Orya One RaceSim.

This repository is meant to feel like a finished open-source project, not a loose prototype. Contributions should keep that standard across the UI, simulation logic, API behavior, docs, and repo presentation.

## Principles

- Keep the product clear, grounded, and public-repo safe.
- Do not introduce copyrighted team marks, official race branding, or protected series assets.
- Prefer explainable simulation logic over opaque claims.
- Keep the UX disciplined: technical, calm, and readable.
- Document meaningful modeling assumptions and tradeoffs.

## Good contribution areas

- simulation realism improvements that do not bloat the architecture
- UI refinement that improves clarity or trust
- better scenario presets, demo readiness, or docs quality
- data-pipeline improvements and schema documentation
- tests, validation, and developer-experience polish

## Local setup

### Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt
pip install -e packages/sim-core
```

### Web

```bash
npm install
```

### Helper command

```bash
make setup
```

## Development commands

```bash
make dev-api
make dev-web
make train-model
make test
make lint-web
make build-web
make check
```

## Expected checks before opening a PR

```bash
pytest
cd apps/web && npm run lint
cd apps/web && npm run build
```

## API test note

`apps/api/tests/test_api.py` skips cleanly if `fastapi` is not installed in the active interpreter. If you installed dependencies from `apps/api/requirements.txt`, the API tests should run normally.

## Pull request standards

Please keep pull requests focused and concrete.

Include:

- what changed
- why it improves the product or codebase
- any modeling assumptions introduced or changed
- validation performed
- screenshots for visible UI changes

## Documentation expectations

If you change any of the following, update docs in the same PR when appropriate:

- simulation assumptions
- dataset fields
- setup instructions
- public-facing product framing
- roadmap positioning

## Scope discipline

Avoid large speculative rewrites. The project improves best through coherent, well-argued refinements rather than broad redesigns.
