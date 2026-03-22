# Methodology

## Purpose

Orya One RaceSim is a hybrid simulation project. It is designed to make its assumptions visible rather than hide them behind a single opaque forecast.

## Modeling philosophy

The system separates three kinds of logic:

1. what can be learned as a pace prior
2. what should remain explicit motorsport logic
3. what should remain probabilistic uncertainty

That separation is the core design principle behind the simulator.

## 1. Neural pace prior

The neural component is a compact PyTorch MLP trained on synthetic tabular samples in `data/model/training_samples.csv`.

It estimates a baseline pace prior from features such as:

- recent form
- qualifying strength
- tire management
- overtaking ability
- consistency
- aggression
- wet-weather skill
- reliability
- track tire stress
- overtaking difficulty
- track-position importance
- fuel sensitivity
- normalized pit loss
- weather risk

Important boundary:

- the model does not directly predict the finishing order
- it provides the pace signal for the broader race simulation

## 2. Deterministic race logic

Explicit logic is used where assumptions should remain visible:

- tire degradation pressure
- fuel sensitivity
- qualifying and track-position leverage
- pit-loss cost
- team pit efficiency
- reliability pressure
- strategy-template interactions

This keeps the simulator explainable and easier to calibrate later.

## 3. Strategy engine

The strategy engine evaluates templates against:

- track-position pressure
- overtaking bandwidth
- tire-stress profile
- weather pressure
- safety-car pressure
- driver traits such as tire management and consistency

Each recommendation returns:

- strategy selection
- risk profile
- rationale bullets
- tradeoff statement

The aim is coherent, scenario-specific strategy logic rather than a fake optimizer.

## 4. Event engine

The event engine introduces controlled uncertainty through:

- wet starts
- weather shifts
- yellow flags
- VSCs
- safety cars
- red flags
- local incidents
- DNFs
- late-race disruptions

These events influence:

- overtaking bandwidth
- degradation pressure
- pit-stop value
- reliability exposure
- finish-position variance

## 5. Monte Carlo aggregation

Each request resolves many independent races and aggregates:

- expected finish position
- finish distributions
- win / podium / top-10 probabilities
- DNF probability
- strategy success rate
- confidence labels
- event-impact summary
- team-level outlook

The output should be read as a probability map for the configured scenario, not as a deterministic prediction.

## 6. Explainability

Driver explanations are built from real simulation signals such as:

- qualifying leverage
- strategy fit
- tire-risk exposure
- weather adaptability
- incident exposure
- event pressure

The product avoids generic AI-style wording in favor of short, simulation-grounded statements.

## Current MVP simplifications

The current version is intentionally bounded:

- event-aware and stint-aware rather than full lap-by-lap
- qualifying influence is modeled inside race performance rather than via a separate session simulator
- safety-car behavior is abstracted into compression and pit-value effects
- sample data is synthetic and intended for replacement later

These are explicit MVP boundaries, not caveats buried in the fine print.

## Future realism path

Likely next steps:

- standalone qualifying simulation
- richer weather transitions by lap window
- pit-stop optimization and undercut / overcut search
- calibration against historical outcomes
- teammate interactions
- more detailed restart behavior

The existing architecture already supports those upgrades without needing a rewrite.
