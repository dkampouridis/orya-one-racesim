# Demo Guide

This guide is meant to make screenshot capture and short demo recording consistent and repeatable.

## Best default demo scenario

Use the `Harbor volatility` preset in the simulator.

Why:

- mixed conditions make the event-impact cards easier to read
- strategy recommendations separate more clearly
- the results table shows more variation in confidence and exposure
- the charts move more than they do in a low-volatility dry scenario

## Recommended capture order

1. Landing page hero
2. Simulator with `Harbor volatility` preset loaded before run
3. Simulator results hero after running the scenario
4. Event-impact summary and disruption chart
5. Expected order table
6. Strategy recommendation and explainability panels
7. Methodology page

If you create a short GIF, this is the best sequence:

1. open simulator
2. click `Harbor volatility`
3. run simulation
4. pause on the result hero and expected order table

## Suggested simulator inputs

### Primary demo

- Preset: `Harbor volatility`
- Grand Prix: `Rainford Harbor Grand Prix`
- Weather: `Mixed Conditions`
- Runs: `1200`
- Complexity: `High`

### Secondary demo

- Preset: `Street-track control`
- Grand Prix: `Azure Coast Grand Prix`
- Weather: `Dry Stable`
- Runs: `900`

Use the secondary demo if you want a calmer screenshot with a stronger track-position story.

## Best pages to capture

### 1. Landing page

Capture:

- hero
- right-side product framing card
- architecture pillars

### 2. Simulator controls

Capture:

- left control column with grouped sections visible
- preset buttons
- scenario framing card

### 3. Results dashboard

Capture:

- top metrics strip
- scenario narrative
- event-impact summary
- disruption chart
- expected order table

### 4. Strategy and explainability

Capture:

- strategy recommendation layer
- explainability cards
- team outlook

### 5. Methodology page

Capture:

- opening section
- methodology cards
- current simplifications / future realism sections

## Recommended viewport sizes

### README screenshots

- Desktop wide: `1600 x 1000`
- Desktop standard: `1440 x 900`

### Social preview or launch post

- Landscape crop: `1600 x 900`
- Square crop for socials: `1400 x 1400`

### GIF / short demo

- `1440 x 900`

This keeps the simulator readable without making the control column feel cramped.

## Visual quality tips

- use dark mode only
- keep browser chrome minimal
- avoid showing local development console output
- prefer one clean scenario per screenshot instead of mixing presets
- wait until the charts and table are fully rendered before capture

## Suggested asset filenames

- `assets/readme/landing-overview.png`
- `assets/readme/simulator-preset.png`
- `assets/readme/results-dashboard.png`
- `assets/readme/strategy-explainability.png`
- `assets/readme/methodology-overview.png`

## Recommended README image order

1. Landing overview
2. Simulator workspace
3. Results dashboard
4. Strategy and explainability

That order gives visitors a clean path from project overview to results detail.
