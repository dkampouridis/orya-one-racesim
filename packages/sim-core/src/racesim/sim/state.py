from __future__ import annotations

from dataclasses import dataclass, field

from racesim.data.models import DriverProfile, StrategyTemplate
from racesim.sim.strategies import StrategyFit


@dataclass
class DriverStaticProfile:
    driver: DriverProfile
    team_name: str
    strategy: StrategyTemplate
    strategy_fit: StrategyFit
    pace_score: float
    raw_pace_score: float
    team_baseline: float
    pace_edge: float
    track_fit_score: float
    chaos_resilience: float
    energy_strength: float
    event_exposure: float
    qualifying_leverage: float
    tire_risk: float
    pace_rank: int


@dataclass
class PitStopRecord:
    lap: int
    compound_out: str
    compound_in: str
    reason: str
    stationary_time: float
    total_loss: float


@dataclass
class DriverDiagnosticsAccumulator:
    pace_component: float = 0.0
    track_fit_bonus: float = 0.0
    strategy_component: float = 0.0
    qualifying_bonus: float = 0.0
    overtaking_bonus: float = 0.0
    energy_bonus: float = 0.0
    track_position_bonus: float = 0.0
    flexibility_bonus: float = 0.0
    chaos_bonus: float = 0.0
    weather_event_bonus: float = 0.0
    track_evolution_bonus: float = 0.0
    tire_penalty: float = 0.0
    fuel_penalty: float = 0.0
    energy_penalty: float = 0.0
    temperature_penalty: float = 0.0
    pit_penalty: float = 0.0
    reliability_penalty: float = 0.0
    risk_penalty: float = 0.0
    compression_penalty: float = 0.0
    incident_penalty: float = 0.0
    stochastic_contribution: float = 0.0
    projected_score: float = 0.0
    lap_count: int = 0

    def as_average_dict(self) -> dict[str, float]:
        divisor = max(1, self.lap_count)
        return {
            "pace_component": self.pace_component / divisor,
            "track_fit_bonus": self.track_fit_bonus / divisor,
            "strategy_component": self.strategy_component / divisor,
            "qualifying_bonus": self.qualifying_bonus / divisor,
            "overtaking_bonus": self.overtaking_bonus / divisor,
            "energy_bonus": self.energy_bonus / divisor,
            "track_position_bonus": self.track_position_bonus / divisor,
            "flexibility_bonus": self.flexibility_bonus / divisor,
            "chaos_bonus": self.chaos_bonus / divisor,
            "weather_event_bonus": self.weather_event_bonus / divisor,
            "track_evolution_bonus": self.track_evolution_bonus / divisor,
            "tire_penalty": self.tire_penalty / divisor,
            "fuel_penalty": self.fuel_penalty / divisor,
            "energy_penalty": self.energy_penalty / divisor,
            "temperature_penalty": self.temperature_penalty / divisor,
            "pit_penalty": self.pit_penalty / divisor,
            "reliability_penalty": self.reliability_penalty / divisor,
            "risk_penalty": self.risk_penalty / divisor,
            "compression_penalty": self.compression_penalty / divisor,
            "incident_penalty": self.incident_penalty / divisor,
            "stochastic_contribution": self.stochastic_contribution / divisor,
            "projected_score": self.projected_score / divisor,
        }


@dataclass
class DriverRaceState:
    profile: DriverStaticProfile
    starting_position: int
    qualifying_baseline: float
    total_time: float = 0.0
    current_compound: str = ""
    compound_index: int = 0
    tire_age: int = 0
    tire_wear: float = 0.0
    fuel_load: float = 1.0
    energy_store: float = 0.86
    pit_stops: int = 0
    next_planned_stop_index: int = 0
    completed_laps: int = 0
    in_race: bool = True
    dnf_lap: int | None = None
    damage: float = 0.0
    overtake_count: int = 0
    positions_gained: int = 0
    last_lap_time: float = 0.0
    clean_air: bool = True
    traffic_load: float = 0.0
    incident_time_loss: float = 0.0
    strategy_adaptations: int = 0
    pit_records: list[PitStopRecord] = field(default_factory=list)
    stint_laps: list[int] = field(default_factory=list)
    diagnostics: DriverDiagnosticsAccumulator = field(default_factory=DriverDiagnosticsAccumulator)


@dataclass
class DriverRunSummary:
    driver_id: str
    starting_position: int
    finish_position: int
    dnf: bool
    dnf_lap: int | None
    pit_stops: int
    pit_laps: list[int]
    average_stint_length: float
    average_first_pit_lap: float | None
    overtakes: int
    positions_gained: int
    incident_time_loss: float
    strategy_success: bool
    strategy_adaptations: int
    diagnostics: dict[str, float]


@dataclass
class RaceRunResult:
    driver_summaries: dict[str, DriverRunSummary]
    finish_order: list[str]
    weather_shift: bool
    wet_start: bool
    yellow_flag: bool
    vsc: bool
    safety_car: bool
    red_flag: bool
    late_incident: bool
    event_pressure: float
    green_overtakes: int
    total_pit_stops: int
    safety_car_laps: list[int]
    turning_points: list[str]
