from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SimulationWeights(BaseModel):
    tire_wear_weight: float = Field(default=0.72, ge=0.0, le=1.0)
    fuel_effect_weight: float = Field(default=0.55, ge=0.0, le=1.0)
    driver_form_weight: float = Field(default=0.68, ge=0.0, le=1.0)
    qualifying_importance: float = Field(default=0.74, ge=0.0, le=1.0)
    overtaking_sensitivity: float = Field(default=0.57, ge=0.0, le=1.0)
    energy_deployment_weight: float = Field(default=0.66, ge=0.0, le=1.0)
    pit_stop_delta_sensitivity: float = Field(default=0.61, ge=0.0, le=1.0)
    stochastic_variance: float = Field(default=0.52, ge=0.0, le=1.0)
    reliability_sensitivity: float = Field(default=0.46, ge=0.0, le=1.0)


class EnvironmentControls(BaseModel):
    dry_race: float = Field(default=0.74, ge=0.0, le=1.0)
    mixed_conditions: float = Field(default=0.28, ge=0.0, le=1.0)
    rain_onset: float = Field(default=0.22, ge=0.0, le=1.0)
    track_evolution: float = Field(default=0.58, ge=0.0, le=1.0)
    temperature_variation: float = Field(default=0.44, ge=0.0, le=1.0)
    energy_deployment_intensity: float = Field(default=0.62, ge=0.0, le=1.0)
    crashes: float = Field(default=0.16, ge=0.0, le=1.0)
    dnfs: float = Field(default=0.1, ge=0.0, le=1.0)
    yellow_flags: float = Field(default=0.21, ge=0.0, le=1.0)
    virtual_safety_cars: float = Field(default=0.15, ge=0.0, le=1.0)
    full_safety_cars: float = Field(default=0.14, ge=0.0, le=1.0)
    red_flags: float = Field(default=0.04, ge=0.0, le=1.0)
    late_race_incidents: float = Field(default=0.12, ge=0.0, le=1.0)
    randomness_intensity: float = Field(default=0.5, ge=0.0, le=1.0)


class DriverOverride(BaseModel):
    driver_id: str
    recent_form_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    qualifying_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    tire_management_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    overtaking_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    consistency_delta: float = Field(default=0.0, ge=-15.0, le=15.0)
    aggression_delta: float = Field(default=0.0, ge=-15.0, le=15.0)


class StrategySuggestionRequest(BaseModel):
    grand_prix_id: str
    weather_preset_id: str = "dry-baseline"
    complexity_level: Literal["low", "balanced", "high"] = "balanced"
    environment: EnvironmentControls = Field(default_factory=EnvironmentControls)
    weights: SimulationWeights = Field(default_factory=SimulationWeights)
    driver_overrides: list[DriverOverride] = Field(default_factory=list)


class SimulationRequest(StrategySuggestionRequest):
    simulation_runs: int = Field(default=400, ge=50, le=5000)
    field_strategy_preset: str | None = None
    strategies: dict[str, str] = Field(default_factory=dict)


class StrategySuggestion(BaseModel):
    driver_id: str
    strategy_id: str
    strategy_name: str
    score: float
    risk_profile: Literal["Low", "Balanced", "Assertive", "High Variance"]
    rationale: list[str]
    tradeoff: str


class PositionProbability(BaseModel):
    position: int
    probability: float


class DriverResult(BaseModel):
    driver_id: str
    driver_name: str
    team_id: str
    team_name: str
    assigned_strategy_id: str
    assigned_strategy_name: str
    expected_finish_position: float
    win_probability: float
    podium_probability: float
    top_10_probability: float
    points_probability: float
    dnf_probability: float
    expected_points: float
    strategy_success_rate: float
    uncertainty_index: float
    confidence_label: Literal["Stable", "Measured", "Exposed", "High Variance"]
    scenario_sensitivity: float
    event_exposure: float
    strategy_fit_score: float
    expected_pace_score: float
    expected_grid_position: float = 0.0
    expected_stop_count: float = 0.0
    average_first_pit_lap: float | None = None
    average_overtakes: float = 0.0
    average_stint_length: float = 0.0
    net_position_delta: float = 0.0
    explanation: list[str]
    position_distribution: list[PositionProbability]
    diagnostics: dict[str, float]


class EventSummary(BaseModel):
    weather_shift_rate: float
    yellow_flag_rate: float
    vsc_rate: float
    safety_car_rate: float
    red_flag_rate: float
    dnf_rate: float
    late_incident_rate: float
    volatility_index: float
    dominant_factor: str
    impact_summary: list[str]
    avg_pit_stops_per_driver: float = 0.0
    avg_green_flag_overtakes: float = 0.0
    avg_safety_car_lap: float | None = None
    turning_points: list[str] = Field(default_factory=list)


class TeamSummary(BaseModel):
    team_id: str
    team_name: str
    avg_expected_finish: float
    expected_points: float
    combined_win_probability: float
    combined_podium_probability: float


class ScenarioSummary(BaseModel):
    grand_prix_id: str
    grand_prix_name: str
    weather_preset_id: str
    weather_preset_name: str
    simulation_engine: Literal["lap-by-lap"]
    simulation_runs: int
    complexity_level: str
    sprint_weekend: bool
    headline: str
    strategy_outlook: str
    event_outlook: str
    confidence_note: str


class SimulationResponse(BaseModel):
    scenario: ScenarioSummary
    drivers: list[DriverResult]
    team_summary: list[TeamSummary]
    event_summary: EventSummary
    strategy_suggestions: list[StrategySuggestion]
