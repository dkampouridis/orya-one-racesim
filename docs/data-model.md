# Data Model

The repository ships with synthetic sample data so Orya One RaceSim works immediately after clone, without authentication, external APIs, or proprietary feeds.

## Design goals

The sample-data layer is designed to:

- make the product runnable on first setup
- keep fields understandable and well-documented
- provide a clean seam for future real-data replacement
- avoid copyrighted or official motorsport branding

## Files and purpose

### `data/drivers/drivers.json`

Driver-level synthetic attributes used by the pace prior, strategy evaluation, and event-exposure logic.

Key fields include:

- `recent_form`
- `qualifying_strength`
- `tire_management`
- `overtaking`
- `consistency`
- `aggression`
- `wet_weather_skill`
- `reliability`

### `data/drivers/teams.json`

Team-level metadata used for:

- display identity
- pit-crew efficiency
- baseline reliability contribution

### `data/tracks/grands_prix.json`

Track and event metadata used by both strategy and simulation layers, including:

- race distance
- overtaking difficulty
- tire stress
- fuel sensitivity
- pit-loss delta
- track-position importance
- weather volatility
- surface evolution

### `data/strategies/strategy_templates.json`

Abstract strategy templates with fields for:

- compound sequence
- pit windows
- aggression
- flexibility
- tire-load bias
- track-position bias
- safety-car bias
- weather adaptability

These are intentionally abstract enough for an MVP while still being coherent and scenario-aware.

### `data/weather/weather_event_priors.json`

Weather and event presets that seed:

- dry bias
- rain-onset probability
- temperature variation
- yellow / VSC / safety-car probabilities
- red-flag probability
- baseline DNF pressure

### `data/model/training_samples.csv`

Synthetic tabular samples used for pace-model training. The file is intentionally easy to inspect so contributors can understand the feature path and replace it later with richer real-world data.

## Demo presets

The simulator UI includes a few demo presets built on top of the sample data:

- Harbor volatility
- Street-track control
- Thermal deg pressure

These are designed for demos, screenshots, and consistent evaluation passes.

## Real-data replacement path

The intended progression for future data work is:

1. preserve the current logical field contracts where possible
2. build ingestion and normalization pipelines that populate the same structures
3. retrain the pace prior on upgraded feature tables
4. calibrate deterministic and event-engine logic against historical outcomes

This helps future realism work land incrementally instead of forcing a rewrite.

## Canonical field reference

The detailed field-level schema reference lives in `data/schemas/catalog.json`.
