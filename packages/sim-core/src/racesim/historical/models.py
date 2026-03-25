from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from racesim.api.contracts import SimulationResponse
from racesim.data.models import DriverProfile, TeamProfile

SourceAuthority = Literal["Formula 1", "FIA"]
SourceType = Literal[
    "race_result",
    "starting_grid",
    "qualifying_classification",
    "pit_stop_summary",
    "lap_chart",
    "lap_analysis",
    "race_control_messages",
    "sector_summary",
    "weather_timing",
    "sprint_classification",
]
SignalProvenance = Literal["official", "derived", "modeled"]


class OfficialSourceReference(BaseModel):
    authority: SourceAuthority
    source_type: SourceType
    title: str
    url: str
    notes: str | None = None


class RawClassificationRow(BaseModel):
    position: int | None = None
    driver_code: str
    driver_name: str
    team_name: str
    car_number: int | None = None
    laps_completed: int | None = None
    race_time: str | None = None
    points: float | None = None
    status: str = "Finished"
    dnf: bool = False


class RawGridRow(BaseModel):
    position: int
    driver_code: str
    driver_name: str
    team_name: str
    car_number: int | None = None
    qualifying_time: str | None = None


class RawPitStopRow(BaseModel):
    driver_code: str
    driver_name: str
    team_name: str
    lap: int
    stop_number: int
    duration_seconds: float | None = None
    compound_out: str | None = None
    compound_in: str | None = None


class HistoricalNeutralization(BaseModel):
    kind: Literal["YELLOW", "VSC", "SC", "RED_FLAG"]
    start_lap: int
    end_lap: int
    provenance: SignalProvenance = "derived"
    notes: str | None = None


class HistoricalWeatherMarker(BaseModel):
    lap: int
    condition: Literal["dry", "mixed", "wet", "intermediate"]
    provenance: SignalProvenance = "derived"
    notes: str | None = None


class HistoricalCoverage(BaseModel):
    classification_depth: int
    grid_depth: int
    pit_stop_coverage: bool
    neutralization_coverage: bool
    weather_coverage: bool
    lap_trace_coverage: bool = False


class HistoricalRawWeekendExtract(BaseModel):
    season: int
    round: int
    grand_prix_id: str
    grand_prix_name: str
    circuit_id: str
    circuit_name: str
    country: str
    source_refs: list[OfficialSourceReference]
    classification_rows: list[RawClassificationRow]
    grid_rows: list[RawGridRow] = Field(default_factory=list)
    pit_stop_rows: list[RawPitStopRow] = Field(default_factory=list)
    neutralizations: list[HistoricalNeutralization] = Field(default_factory=list)
    weather_markers: list[HistoricalWeatherMarker] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class HistoricalPitStopEvent(BaseModel):
    driver_id: str
    driver_name: str
    team_id: str
    lap: int
    stop_number: int
    duration_seconds: float | None = None
    compound_out: str | None = None
    compound_in: str | None = None


class HistoricalEntrantResult(BaseModel):
    driver_id: str
    driver_name: str
    team_id: str
    team_name: str
    driver_code: str
    car_number: int | None = None
    qualifying_position: int | None = None
    grid_position: int | None = None
    finish_position: int | None = None
    points: float = 0.0
    laps_completed: int | None = None
    status: str = "Finished"
    classified: bool = True
    dnf: bool = False
    pit_stops: int | None = None
    average_first_stop_lap: float | None = None
    average_position_change: float | None = None


class HistoricalWeekend(BaseModel):
    season: int
    round: int
    grand_prix_id: str
    grand_prix_name: str
    circuit_id: str
    circuit_name: str
    country: str
    source_refs: list[OfficialSourceReference]
    coverage: HistoricalCoverage
    entrants: list[HistoricalEntrantResult]
    pit_stop_events: list[HistoricalPitStopEvent] = Field(default_factory=list)
    neutralizations: list[HistoricalNeutralization] = Field(default_factory=list)
    weather_markers: list[HistoricalWeatherMarker] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class HistoricalSeedBundle(BaseModel):
    season: int
    assumptions_note: str
    teams: list[TeamProfile]
    drivers: list[DriverProfile]


class BacktestWeekendMetrics(BaseModel):
    covered_driver_count: int
    winner_hit: float
    actual_winner_probability: float
    podium_overlap_rate: float
    top_10_overlap_rate: float
    mean_abs_finish_error: float
    qualifying_conversion_mae: float
    stop_count_mae: float | None = None
    first_stop_mae: float | None = None
    dnf_brier: float
    actual_avg_position_change: float
    simulated_avg_position_change: float
    volatility_proxy_error: float
    track_behavior_error: float


class BacktestWeekendResult(BaseModel):
    season: int
    grand_prix_id: str
    grand_prix_name: str
    metrics: BacktestWeekendMetrics
    simulation: SimulationResponse
    actual_weekend: HistoricalWeekend


class AggregateBacktestMetrics(BaseModel):
    weekends: int
    winner_hit_rate: float
    avg_actual_winner_probability: float
    avg_podium_overlap_rate: float
    avg_top_10_overlap_rate: float
    avg_finish_mae: float
    avg_qualifying_conversion_mae: float
    avg_stop_count_mae: float | None = None
    avg_first_stop_mae: float | None = None
    avg_dnf_brier: float
    avg_volatility_proxy_error: float
    avg_track_behavior_error: float


class CalibrationHint(BaseModel):
    area: str
    message: str


class BacktestAggregateReport(BaseModel):
    season: int
    aggregate: AggregateBacktestMetrics
    weekends: list[BacktestWeekendResult]
    calibration_hints: list[CalibrationHint] = Field(default_factory=list)
