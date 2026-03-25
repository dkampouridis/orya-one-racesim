from __future__ import annotations

from dataclasses import dataclass, field

from racesim.data.models import DriverProfile, StrategyTemplate, TrackProfile
from racesim.sim.strategies import StrategyFit


@dataclass(frozen=True)
class CircuitLeverageProfile:
    circuit_type: str
    degradation_profile: str
    track_position_multiplier: float
    qualifying_carryover_factor: float
    dirty_air_factor: float
    overtake_suppression_factor: float
    degradation_factor: float
    pit_window_pressure_factor: float
    disruption_leverage_factor: float
    restart_factor: float
    weather_sensitivity_factor: float
    deployment_sensitivity_factor: float
    strategy_flex_factor: float
    recovery_factor: float
    clean_air_factor: float
    order_lock_factor: float
    undercut_factor: float
    alternate_strategy_factor: float
    disruption_reshuffle_factor: float

    def as_dict(self) -> dict[str, float | str]:
        return {
            "circuit_type": self.circuit_type,
            "degradation_profile": self.degradation_profile,
            "track_position_multiplier": round(self.track_position_multiplier, 4),
            "qualifying_carryover_factor": round(self.qualifying_carryover_factor, 4),
            "dirty_air_factor": round(self.dirty_air_factor, 4),
            "overtake_suppression_factor": round(self.overtake_suppression_factor, 4),
            "degradation_factor": round(self.degradation_factor, 4),
            "pit_window_pressure_factor": round(self.pit_window_pressure_factor, 4),
            "disruption_leverage_factor": round(self.disruption_leverage_factor, 4),
            "restart_factor": round(self.restart_factor, 4),
            "weather_sensitivity_factor": round(self.weather_sensitivity_factor, 4),
            "deployment_sensitivity_factor": round(self.deployment_sensitivity_factor, 4),
            "strategy_flex_factor": round(self.strategy_flex_factor, 4),
            "recovery_factor": round(self.recovery_factor, 4),
            "clean_air_factor": round(self.clean_air_factor, 4),
            "order_lock_factor": round(self.order_lock_factor, 4),
            "undercut_factor": round(self.undercut_factor, 4),
            "alternate_strategy_factor": round(self.alternate_strategy_factor, 4),
            "disruption_reshuffle_factor": round(self.disruption_reshuffle_factor, 4),
        }


def build_circuit_leverage(track: TrackProfile) -> CircuitLeverageProfile:
    degradation_bonus = {
        "low": 0.0,
        "medium": 0.08,
        "medium-high": 0.18,
        "high": 0.28,
    }.get(track.degradation_profile, 0.08)
    street_boost = 0.18 if track.circuit_type == "street" else 0.1 if track.circuit_type == "semi-street" else 0.0
    monaco_like = track.track_position_importance > 0.95 and track.overtaking_difficulty > 0.95
    monza_like = track.energy_sensitivity > 0.88 and track.overtaking_difficulty < 0.35
    spa_like = track.weather_volatility > 0.65 and track.tire_stress > 0.55
    singapore_like = (
        track.circuit_type == "street"
        and track.safety_car_risk > 0.6
        and track.tire_stress > 0.65
        and track.track_position_importance > 0.72
    )
    baku_like = (
        track.circuit_type == "street"
        and track.energy_sensitivity > 0.85
        and track.safety_car_risk > 0.6
        and track.overtaking_difficulty < 0.45
    )
    zandvoort_like = (
        track.circuit_type == "permanent"
        and track.track_position_importance > 0.8
        and track.overtaking_difficulty > 0.8
    )

    track_position_multiplier = 0.75 + track.track_position_importance * 1.25 + track.qualifying_importance * 0.45
    qualifying_carryover_factor = 0.7 + track.qualifying_importance * 1.1 + track.track_position_importance * 0.55
    dirty_air_factor = 0.65 + track.track_position_importance * 0.95 + track.overtaking_difficulty * 0.95
    overtake_suppression_factor = max(
        0.75,
        0.65
        + track.overtaking_difficulty * 1.25
        + track.track_position_importance * 0.45
        - track.energy_sensitivity * 0.28,
    )
    degradation_factor = 0.7 + track.tire_stress * 1.2 + degradation_bonus
    pit_window_pressure_factor = (
        0.7
        + track.tire_stress * 0.6
        + (1.0 - track.strategy_flexibility) * 0.7
        + track.track_position_importance * 0.35
    )
    disruption_leverage_factor = 0.72 + track.safety_car_risk * 1.1 + track.weather_volatility * 0.55 + street_boost
    restart_factor = (
        0.72
        + track.safety_car_risk * 0.55
        + track.energy_sensitivity * 0.55
        + (1.0 - track.overtaking_difficulty) * 0.28
        + street_boost * 0.35
    )
    weather_sensitivity_factor = 0.7 + track.weather_volatility * 1.55 + track.tire_stress * 0.25
    deployment_sensitivity_factor = 0.72 + track.energy_sensitivity * 1.45 + (1.0 - track.overtaking_difficulty) * 0.22
    strategy_flex_factor = max(
        0.55,
        0.65 + track.strategy_flexibility * 1.2 - track.track_position_importance * 0.25,
    )
    recovery_factor = max(
        0.35,
        0.7
        + track.strategy_flexibility * 0.75
        + track.energy_sensitivity * 0.35
        - track.track_position_importance * 0.45
        - track.overtaking_difficulty * 0.35,
    )
    clean_air_factor = 0.75 + track.track_position_importance * 0.8 + track.overtaking_difficulty * 0.35
    order_lock_factor = max(
        0.55,
        0.62
        + track.track_position_importance * 1.05
        + track.overtaking_difficulty * 0.82
        - track.strategy_flexibility * 0.22,
    )
    undercut_factor = max(
        0.55,
        0.78
        + track.track_position_importance * 0.52
        + track.tire_stress * 0.78
        + track.overtaking_difficulty * 0.24
        - min(0.18, track.pit_loss_seconds / 100.0),
    )
    alternate_strategy_factor = max(
        0.45,
        0.58
        + track.strategy_flexibility * 1.05
        + track.energy_sensitivity * 0.36
        - track.track_position_importance * 0.42
        - track.overtaking_difficulty * 0.22,
    )
    disruption_reshuffle_factor = max(
        0.55,
        0.64
        + track.safety_car_risk * 0.86
        + track.weather_volatility * 0.4
        + street_boost * 0.4
        + track.energy_sensitivity * 0.18,
    )

    if monaco_like:
        track_position_multiplier += 0.55
        qualifying_carryover_factor += 0.42
        dirty_air_factor += 0.28
        overtake_suppression_factor += 0.5
        pit_window_pressure_factor += 0.2
        strategy_flex_factor = max(0.5, strategy_flex_factor - 0.12)
        recovery_factor = max(0.32, recovery_factor - 0.1)
        clean_air_factor += 0.2
        order_lock_factor += 0.5
        undercut_factor += 0.18
        alternate_strategy_factor = max(0.4, alternate_strategy_factor - 0.08)
    if monza_like:
        overtake_suppression_factor = max(0.68, overtake_suppression_factor - 0.16)
        disruption_leverage_factor += 0.08
        restart_factor += 0.26
        deployment_sensitivity_factor += 0.42
        strategy_flex_factor += 0.14
        recovery_factor += 0.22
        alternate_strategy_factor += 0.18
        disruption_reshuffle_factor += 0.08
    if spa_like:
        degradation_factor += 0.12
        pit_window_pressure_factor += 0.1
        disruption_leverage_factor += 0.12
        weather_sensitivity_factor += 0.42
        strategy_flex_factor += 0.08
        recovery_factor += 0.1
        alternate_strategy_factor += 0.08
        disruption_reshuffle_factor += 0.12
    if singapore_like:
        overtake_suppression_factor += 0.12
        degradation_factor += 0.18
        pit_window_pressure_factor += 0.12
        disruption_leverage_factor += 0.34
        restart_factor += 0.12
        strategy_flex_factor = max(0.55, strategy_flex_factor - 0.08)
        recovery_factor = max(0.4, recovery_factor - 0.06)
        order_lock_factor += 0.18
        disruption_reshuffle_factor += 0.22
    if baku_like:
        disruption_leverage_factor += 0.24
        restart_factor += 0.36
        deployment_sensitivity_factor += 0.24
        strategy_flex_factor += 0.08
        recovery_factor += 0.12
        alternate_strategy_factor += 0.1
        disruption_reshuffle_factor += 0.18
    if zandvoort_like:
        track_position_multiplier += 0.16
        qualifying_carryover_factor += 0.1
        overtake_suppression_factor += 0.14
        strategy_flex_factor = max(0.55, strategy_flex_factor - 0.08)
        recovery_factor = max(0.35, recovery_factor - 0.06)
        order_lock_factor += 0.24

    return CircuitLeverageProfile(
        circuit_type=track.circuit_type,
        degradation_profile=track.degradation_profile,
        track_position_multiplier=track_position_multiplier,
        qualifying_carryover_factor=qualifying_carryover_factor,
        dirty_air_factor=dirty_air_factor,
        overtake_suppression_factor=overtake_suppression_factor,
        degradation_factor=degradation_factor,
        pit_window_pressure_factor=pit_window_pressure_factor,
        disruption_leverage_factor=disruption_leverage_factor,
        restart_factor=restart_factor,
        weather_sensitivity_factor=weather_sensitivity_factor,
        deployment_sensitivity_factor=deployment_sensitivity_factor,
        strategy_flex_factor=strategy_flex_factor,
        recovery_factor=recovery_factor,
        clean_air_factor=clean_air_factor,
        order_lock_factor=order_lock_factor,
        undercut_factor=undercut_factor,
        alternate_strategy_factor=alternate_strategy_factor,
        disruption_reshuffle_factor=disruption_reshuffle_factor,
    )


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
    projected_rejoin_position: int | None = None
    projected_traffic_density: float = 0.0


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
    traffic_penalty: float = 0.0
    post_pit_traffic_penalty: float = 0.0
    pit_timing_regret: float = 0.0
    undercut_delta: float = 0.0
    overcut_delta: float = 0.0
    post_pit_position_delta: float = 0.0
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
            "traffic_penalty": self.traffic_penalty / divisor,
            "post_pit_traffic_penalty": self.post_pit_traffic_penalty / divisor,
            "pit_timing_regret": self.pit_timing_regret / divisor,
            "undercut_delta": self.undercut_delta / divisor,
            "overcut_delta": self.overcut_delta / divisor,
            "post_pit_position_delta": self.post_pit_position_delta / divisor,
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
    current_position: int
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
    position_change_events: int = 0
    positions_gained: int = 0
    last_lap_time: float = 0.0
    clean_air: bool = True
    traffic_load: float = 0.0
    incident_time_loss: float = 0.0
    strategy_adaptations: int = 0
    undercut_attempts: int = 0
    undercut_successes: int = 0
    overcut_attempts: int = 0
    overcut_successes: int = 0
    post_pit_position_delta_total: float = 0.0
    post_pit_traffic_penalty_total: float = 0.0
    pit_timing_regret_total: float = 0.0
    pending_pit_eval_laps: int = 0
    pending_pit_reference_position: int | None = None
    pending_pit_reason: str | None = None
    pending_pit_traffic_accum: float = 0.0
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
    position_changes: int
    positions_gained: int
    incident_time_loss: float
    strategy_success: bool
    strategy_adaptations: int
    undercut_attempts: int
    undercut_successes: int
    overcut_attempts: int
    overcut_successes: int
    post_pit_position_delta: float
    post_pit_traffic_penalty: float
    pit_timing_regret: float
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
