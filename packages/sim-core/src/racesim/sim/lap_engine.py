from __future__ import annotations

import math
import random
from collections import Counter
from dataclasses import dataclass

from racesim.api.contracts import EnvironmentControls, SimulationRequest, SimulationWeights
from racesim.data.loaders import get_team
from racesim.data.models import TrackProfile, WeatherPreset
from racesim.sim.events import EventEngine, RaceEvents
from racesim.sim.state import DriverRaceState, DriverRunSummary, DriverStaticProfile, PitStopRecord, RaceRunResult


COMPOUND_SPECS = {
    "Soft": {"pace_offset": -0.42, "deg_rate": 0.034, "cliff": 0.76, "wet_optimum": 0.0},
    "Medium": {"pace_offset": -0.2, "deg_rate": 0.026, "cliff": 0.81, "wet_optimum": 0.0},
    "Hard": {"pace_offset": 0.04, "deg_rate": 0.019, "cliff": 0.87, "wet_optimum": 0.0},
    "Intermediate": {"pace_offset": 0.68, "deg_rate": 0.03, "cliff": 0.79, "wet_optimum": 0.62},
}


@dataclass
class AttackPlan:
    traffic_penalty: float = 0.0
    attack_bonus: float = 0.0
    compression_penalty: float = 0.0
    overtake_success: bool = False


class LapRaceEngine:
    def __init__(
        self,
        track: TrackProfile,
        weather: WeatherPreset,
        request: SimulationRequest,
        profiles: dict[str, DriverStaticProfile],
    ) -> None:
        self.track = track
        self.weather = weather
        self.request = request
        self.profiles = profiles
        self.base_lap_time = track.base_race_time_sec / track.laps

    def simulate_run(self, rng: random.Random) -> RaceRunResult:
        events = EventEngine(rng).race_events(self.track, self.weather, self.request.environment)
        states = self._initialize_grid(rng)

        turning_points = list(events.narrative)
        green_overtakes = 0

        for lap in range(1, self.track.laps + 1):
            status = events.status_for_lap(lap)
            wetness = self._wetness_for_lap(lap, events)
            track_grip = self._track_grip_for_lap(lap, wetness)
            sorted_states = self._ordered_active_states(states)
            attack_plan = self._build_attack_plan(sorted_states, lap, wetness, status, events, rng)

            for state in sorted_states:
                if not state.in_race:
                    continue

                pit_reason = self._pit_reason(state, lap, wetness, status)
                lap_time = self._lap_time_for_driver(
                    state=state,
                    lap=lap,
                    wetness=wetness,
                    track_grip=track_grip,
                    status=status,
                    events=events,
                    attack=attack_plan.get(state.profile.driver.id, AttackPlan()),
                    pit_reason=pit_reason,
                    rng=rng,
                )
                state.total_time += lap_time
                state.last_lap_time = lap_time
                state.completed_laps = lap

                if status == "green" and attack_plan.get(state.profile.driver.id, AttackPlan()).overtake_success:
                    green_overtakes += 1
                    state.overtake_count += 1

                dnf_triggered, incident_loss = self._resolve_incident(
                    state=state,
                    lap=lap,
                    wetness=wetness,
                    status=status,
                    events=events,
                    rng=rng,
                )
                if incident_loss > 0:
                    state.total_time += incident_loss
                    state.incident_time_loss += incident_loss
                    state.diagnostics.incident_penalty += incident_loss

                if dnf_triggered:
                    state.in_race = False
                    state.dnf_lap = lap
                    state.total_time += 12000.0 - lap * 10.0

            self._apply_neutralization_bunching(states, status, rng)

            if lap in events.restart_laps:
                turning_points.append(f"lap {lap} restart compresses the field and reopens attack windows")

        finish_order = self._final_order(states)
        summaries: dict[str, DriverRunSummary] = {}
        total_pit_stops = 0
        safety_car_laps = [lap for lap in range(1, self.track.laps + 1) if events.status_for_lap(lap) == "safety_car"]

        for finish_position, driver_id in enumerate(finish_order, start=1):
            state = states[driver_id]
            total_pit_stops += state.pit_stops
            if state.completed_laps:
                state.stint_laps.append(max(1, state.tire_age))
            average_stint_length = (
                sum(state.stint_laps) / len(state.stint_laps)
                if state.stint_laps
                else float(state.completed_laps or self.track.laps)
            )
            first_pit_lap = state.pit_records[0].lap if state.pit_records else None
            pace_projection = (
                state.diagnostics.pace_component
                + state.diagnostics.track_fit_bonus
                + state.diagnostics.strategy_component
                + state.diagnostics.qualifying_bonus
                + state.diagnostics.overtaking_bonus
                + state.diagnostics.energy_bonus
                + state.diagnostics.track_position_bonus
                + state.diagnostics.flexibility_bonus
                + state.diagnostics.chaos_bonus
                + state.diagnostics.weather_event_bonus
                + state.diagnostics.track_evolution_bonus
                - state.diagnostics.tire_penalty
                - state.diagnostics.fuel_penalty
                - state.diagnostics.energy_penalty
                - state.diagnostics.temperature_penalty
                - state.diagnostics.pit_penalty
                - state.diagnostics.reliability_penalty
                - state.diagnostics.risk_penalty
                - state.diagnostics.compression_penalty
                - state.diagnostics.incident_penalty
                + state.diagnostics.stochastic_contribution
            )
            state.diagnostics.projected_score = pace_projection
            summaries[driver_id] = DriverRunSummary(
                driver_id=driver_id,
                starting_position=state.starting_position,
                finish_position=finish_position,
                dnf=not state.in_race,
                dnf_lap=state.dnf_lap,
                pit_stops=state.pit_stops,
                pit_laps=[record.lap for record in state.pit_records],
                average_stint_length=round(average_stint_length, 2),
                average_first_pit_lap=float(first_pit_lap) if first_pit_lap is not None else None,
                overtakes=state.overtake_count,
                positions_gained=state.starting_position - finish_position,
                incident_time_loss=round(state.incident_time_loss, 3),
                strategy_success=(
                    state.in_race
                    and (
                        finish_position <= state.starting_position + 1
                        or abs(state.pit_stops - len(state.profile.strategy.pit_windows)) <= 1
                    )
                    and state.incident_time_loss < 6.0
                ),
                strategy_adaptations=state.strategy_adaptations,
                diagnostics=state.diagnostics.as_average_dict(),
            )

        if not turning_points:
            turning_points.append("the race stays green enough for baseline pace and pit windows to decide the order")

        return RaceRunResult(
            driver_summaries=summaries,
            finish_order=finish_order,
            weather_shift=events.weather_shift,
            wet_start=events.wet_start,
            yellow_flag=events.yellow_flag,
            vsc=events.vsc,
            safety_car=events.safety_car,
            red_flag=events.red_flag,
            late_incident=events.late_incident,
            event_pressure=events.event_pressure,
            green_overtakes=green_overtakes,
            total_pit_stops=total_pit_stops,
            safety_car_laps=safety_car_laps,
            turning_points=turning_points[:4],
        )

    def _initialize_grid(self, rng: random.Random) -> dict[str, DriverRaceState]:
        qualifiers: list[tuple[str, float]] = []
        for driver_id, profile in self.profiles.items():
            variability = 1.8 * (1.08 - profile.driver.consistency / 220.0)
            qualifying_score = (
                profile.qualifying_leverage * 18.0
                + profile.pace_edge * 10.5
                + profile.track_fit_score * 0.6
                + profile.team_baseline * 0.16
                + (profile.strategy.qualifying_bias - 0.5) * 5.2
                + rng.gauss(0.0, variability)
            )
            qualifiers.append((driver_id, qualifying_score))

        qualifiers.sort(key=lambda item: item[1], reverse=True)
        states: dict[str, DriverRaceState] = {}
        for grid_position, (driver_id, qualifying_score) in enumerate(qualifiers, start=1):
            profile = self.profiles[driver_id]
            compound = profile.strategy.compound_sequence[0]
            states[driver_id] = DriverRaceState(
                profile=profile,
                starting_position=grid_position,
                qualifying_baseline=qualifying_score,
                total_time=(grid_position - 1) * (0.14 + self.track.track_position_importance * 0.26),
                current_compound=compound,
                compound_index=0,
                fuel_load=1.0,
                energy_store=0.84 + profile.energy_strength * 0.08,
            )
        return states

    def _ordered_active_states(self, states: dict[str, DriverRaceState]) -> list[DriverRaceState]:
        ordered = sorted(states.values(), key=lambda item: item.total_time)
        return [state for state in ordered if state.in_race]

    def _build_attack_plan(
        self,
        ordered_states: list[DriverRaceState],
        lap: int,
        wetness: float,
        status: str,
        events: RaceEvents,
        rng: random.Random,
    ) -> dict[str, AttackPlan]:
        plan = {state.profile.driver.id: AttackPlan() for state in ordered_states}
        if status != "green":
            return plan

        restart_bonus = 0.18 if lap in events.restart_laps else 0.0
        for index in range(1, len(ordered_states)):
            follower = ordered_states[index]
            leader = ordered_states[index - 1]
            gap = max(0.0, follower.total_time - leader.total_time)
            if gap > 1.8:
                continue

            dirty_air_penalty = (
                self.track.overtaking_difficulty
                * 0.08
                + self.track.track_position_importance * 0.18
                + follower.profile.strategy.track_position_bias * 0.06
            )
            plan[follower.profile.driver.id].traffic_penalty += max(0.04, dirty_air_penalty)
            plan[follower.profile.driver.id].compression_penalty += self.track.track_position_importance * max(0.0, 0.9 - gap) * 0.04

            relative_attack = (
                (follower.profile.pace_edge - leader.profile.pace_edge) * 0.46
                + (follower.profile.driver.overtaking - leader.profile.driver.overtaking) / 180.0
                + (follower.profile.energy_strength - leader.profile.energy_strength) * 0.34
                + (leader.tire_wear - follower.tire_wear) * 0.76
                + (follower.profile.strategy.aggression - leader.profile.strategy.aggression) * 0.28
                + restart_bonus
                + (0.08 if follower.pit_stops < leader.pit_stops else 0.0)
                - self.track.overtaking_difficulty * 0.72
                - wetness * 0.24
                - self.track.track_position_importance * 0.22
            )
            if follower.current_compound == "Intermediate" and wetness > 0.45:
                relative_attack += 0.08
            pass_probability = max(
                0.02,
                min(
                    0.62,
                    0.14
                    + relative_attack * 0.2
                    + (1.2 - gap) * 0.1
                    + self.request.weights.overtaking_sensitivity * 0.08
                    + events.overtaking_window * 0.04,
                ),
            )
            if relative_attack > -0.05 and rng.random() < pass_probability:
                bonus = 0.12 + max(0.0, relative_attack) * 0.22
                plan[follower.profile.driver.id].attack_bonus += bonus
                plan[follower.profile.driver.id].overtake_success = True

        return plan

    def _lap_time_for_driver(
        self,
        state: DriverRaceState,
        lap: int,
        wetness: float,
        track_grip: float,
        status: str,
        events: RaceEvents,
        attack: AttackPlan,
        pit_reason: str | None,
        rng: random.Random,
    ) -> float:
        compound = COMPOUND_SPECS.get(state.current_compound, COMPOUND_SPECS["Medium"])
        fuel_factor = state.fuel_load
        tire_delta = self._tire_delta(state, wetness, compound)
        energy_delta, energy_penalty = self._energy_delta(state, wetness, events)
        track_position_bonus = self._track_position_bonus(state, lap)
        qualifying_bonus = max(0.0, state.profile.qualifying_leverage * self.track.track_position_importance * (1.0 - lap / max(1, self.track.laps)) * 0.16)
        pace_component = state.profile.pace_edge * (0.28 + self.request.weights.driver_form_weight * 0.18)
        track_fit_bonus = state.profile.track_fit_score / 28.0
        strategy_component = ((state.profile.strategy_fit.score - 50.0) / 24.0) * (0.16 + self.track.strategy_flexibility * 0.1)
        chaos_bonus = state.profile.chaos_resilience * events.event_pressure * self.request.weights.reliability_sensitivity * 0.22
        flexibility_bonus = (
            state.profile.strategy.flexibility
            * (0.08 + 0.12 * int(status in {"vsc", "safety_car", "red_flag"} or wetness > 0.35))
        )
        weather_bonus = 0.0
        if wetness > 0.25:
            weather_bonus += (state.profile.driver.wet_weather_skill / 100.0) * wetness * 0.34
        if pit_reason == "weather_crossover":
            weather_bonus += state.profile.strategy.weather_adaptability * 0.22

        track_evo_bonus = self.request.environment.track_evolution * self.track.surface_evolution * (lap / self.track.laps) * 0.08
        fuel_penalty = fuel_factor * self.track.fuel_sensitivity * self.request.weights.fuel_effect_weight * 0.82
        tire_penalty = tire_delta
        temperature_penalty = self.request.environment.temperature_variation * self.track.tire_stress * 0.14 * (1.0 + wetness * 0.2)
        reliability_penalty = (1.0 - state.profile.driver.reliability / 100.0) * self.request.weights.reliability_sensitivity * 0.18
        risk_penalty = state.damage * 0.22 + state.profile.event_exposure * events.event_pressure * 0.08
        compression_penalty = attack.compression_penalty
        traffic_penalty = attack.traffic_penalty
        overtaking_bonus = attack.attack_bonus * (0.65 + self.request.weights.overtaking_sensitivity * 0.5)

        noise_sigma = (
            0.12
            + (1.0 - state.profile.driver.consistency / 100.0) * 0.18
            + self.request.weights.stochastic_variance * 0.22
            + wetness * 0.08
        )
        if status in {"vsc", "safety_car", "red_flag"}:
            noise_sigma *= 0.5
        stochastic = rng.gauss(0.0, noise_sigma)

        lap_time = self.base_lap_time
        if status == "vsc":
            lap_time *= 1.18
        elif status == "safety_car":
            lap_time *= 1.32
        elif status == "red_flag":
            lap_time *= 1.52

        lap_time += (
            fuel_penalty
            + tire_penalty
            + energy_penalty
            + temperature_penalty
            + reliability_penalty
            + risk_penalty
            + compression_penalty
            + traffic_penalty
            - pace_component
            - track_fit_bonus
            - strategy_component
            - qualifying_bonus
            - overtaking_bonus
            - energy_delta
            - track_position_bonus
            - flexibility_bonus
            - chaos_bonus
            - weather_bonus
            - track_evo_bonus
            - compound["pace_offset"]
            - max(0.0, track_grip - 1.0) * 0.16
            + stochastic
        )

        if pit_reason:
            lap_time += self._execute_pit_stop(state, lap, pit_reason, status)

        state.tire_age += 1
        wear_gain = compound["deg_rate"] * self.track.tire_stress * events.degradation_multiplier
        wear_gain *= 0.86 + state.profile.strategy.tire_load * 0.42 + self.request.weights.tire_wear_weight * 0.26
        wear_gain *= 1.05 - state.profile.driver.tire_management / 220.0
        if wetness > 0.35 and state.current_compound != "Intermediate":
            wear_gain *= 1.12
        if state.clean_air is False:
            wear_gain *= 1.04
        state.tire_wear = min(1.4, state.tire_wear + wear_gain)
        state.fuel_load = max(0.0, 1.0 - lap / self.track.laps)
        state.energy_store = max(0.28, min(1.0, state.energy_store + 0.06 - self.track.energy_sensitivity * 0.04 - state.profile.strategy.aggression * 0.03))
        state.clean_air = attack.traffic_penalty <= 0.08
        state.traffic_load = attack.traffic_penalty

        diagnostics = state.diagnostics
        diagnostics.pace_component += pace_component
        diagnostics.track_fit_bonus += track_fit_bonus
        diagnostics.strategy_component += strategy_component
        diagnostics.qualifying_bonus += qualifying_bonus
        diagnostics.overtaking_bonus += overtaking_bonus
        diagnostics.energy_bonus += energy_delta
        diagnostics.track_position_bonus += track_position_bonus
        diagnostics.flexibility_bonus += flexibility_bonus
        diagnostics.chaos_bonus += chaos_bonus
        diagnostics.weather_event_bonus += weather_bonus
        diagnostics.track_evolution_bonus += track_evo_bonus
        diagnostics.tire_penalty += tire_penalty
        diagnostics.fuel_penalty += fuel_penalty
        diagnostics.energy_penalty += energy_penalty
        diagnostics.temperature_penalty += temperature_penalty
        diagnostics.reliability_penalty += reliability_penalty
        diagnostics.risk_penalty += risk_penalty
        diagnostics.compression_penalty += compression_penalty + traffic_penalty
        diagnostics.stochastic_contribution += stochastic
        diagnostics.lap_count += 1
        return lap_time

    def _tire_delta(self, state: DriverRaceState, wetness: float, compound: dict[str, float]) -> float:
        mismatch_penalty = 0.0
        if state.current_compound == "Intermediate":
            mismatch_penalty = max(0.0, 0.22 - wetness) * 4.0
        else:
            mismatch_penalty = max(0.0, wetness - 0.22) * 4.6

        wear_factor = state.tire_wear * (0.44 + self.request.weights.tire_wear_weight * 0.68)
        age_factor = state.tire_age * compound["deg_rate"] * (0.32 + self.track.tire_stress * 0.38)
        cliff_penalty = max(0.0, state.tire_wear - compound["cliff"]) * (1.8 + self.track.tire_stress * 0.8)
        return mismatch_penalty + wear_factor + age_factor + cliff_penalty

    def _energy_delta(self, state: DriverRaceState, wetness: float, events: RaceEvents) -> tuple[float, float]:
        available = state.energy_store * state.profile.energy_strength
        deployment_bonus = available * self.track.energy_sensitivity * self.request.weights.energy_deployment_weight * 0.38
        if wetness > 0.35:
            deployment_bonus *= 0.82
        if state.current_compound == "Intermediate":
            deployment_bonus *= 0.9
        deployment_bonus *= events.energy_management_multiplier

        target_spend = 0.08 + self.track.energy_sensitivity * 0.06 + state.profile.strategy.energy_bias * 0.04
        if wetness > 0.35:
            target_spend *= 0.88
        state.energy_store = max(0.25, min(1.0, state.energy_store - target_spend + 0.05))

        energy_penalty = max(0.0, 0.52 - state.energy_store) * self.track.energy_sensitivity * 0.52
        return deployment_bonus, energy_penalty

    def _track_position_bonus(self, state: DriverRaceState, lap: int) -> float:
        return (
            self.track.track_position_importance
            * self.request.weights.qualifying_importance
            * max(0.0, (self.track.laps - lap) / self.track.laps)
            * (1.0 - (state.starting_position - 1) / max(1, len(self.profiles) - 1))
            * 0.22
        )

    def _track_grip_for_lap(self, lap: int, wetness: float) -> float:
        evolution = self.request.environment.track_evolution * self.track.surface_evolution * (lap / self.track.laps)
        temperature_drag = self.request.environment.temperature_variation * self.track.tire_stress * 0.06
        return 0.98 + evolution * 0.07 - wetness * 0.06 - temperature_drag

    def _wetness_for_lap(self, lap: int, events: RaceEvents) -> float:
        if events.wet_start:
            wetness = events.peak_wetness
            if events.drying_lap and lap >= events.drying_lap:
                fade_span = max(3, self.track.laps - events.drying_lap)
                wetness *= max(0.05, 1.0 - (lap - events.drying_lap) / fade_span)
            return wetness

        if not events.weather_shift or events.weather_shift_lap is None:
            return 0.0

        if lap < events.weather_shift_lap:
            return 0.0

        build_span = max(3, int(self.track.laps * 0.08))
        if events.drying_lap is None or lap <= events.drying_lap:
            ramp = min(1.0, (lap - events.weather_shift_lap + 1) / build_span)
            return events.peak_wetness * ramp

        fade_span = max(4, self.track.laps - events.drying_lap)
        fade = max(0.05, 1.0 - (lap - events.drying_lap) / fade_span)
        return events.peak_wetness * fade

    def _pit_reason(self, state: DriverRaceState, lap: int, wetness: float, status: str) -> str | None:
        profile = state.profile
        strategy = profile.strategy
        next_compound_index = min(state.compound_index + 1, len(strategy.compound_sequence) - 1)
        has_next_compound = next_compound_index > state.compound_index

        if wetness > 0.36 and state.current_compound != "Intermediate":
            return "weather_crossover"
        if wetness < 0.16 and state.current_compound == "Intermediate":
            return "weather_crossover"
        if not has_next_compound:
            return None

        target_lap = strategy.pit_windows[min(state.next_planned_stop_index, len(strategy.pit_windows) - 1)]
        window = max(1, int(1 + self.track.strategy_flexibility * 3 + strategy.flexibility * 2))
        undercut_pull = strategy.aggression * (1.0 - self.track.overtaking_difficulty) * 3

        if status in {"vsc", "safety_car"} and strategy.safety_car_bias > 0.55 and lap > 6:
            return "neutralized_window"
        if state.tire_wear > COMPOUND_SPECS.get(state.current_compound, COMPOUND_SPECS["Medium"])["cliff"] + 0.08:
            return "tire_cliff"
        if lap >= target_lap + window:
            return "late_window"
        if target_lap - undercut_pull <= lap <= target_lap + window and state.tire_wear > 0.52:
            return "planned_window"
        return None

    def _execute_pit_stop(self, state: DriverRaceState, lap: int, reason: str, status: str) -> float:
        team = get_team(state.profile.driver.team_id)
        compound_out = state.current_compound
        next_index = state.compound_index
        if reason == "weather_crossover":
            if state.current_compound == "Intermediate":
                next_index = min(state.compound_index + 1, len(state.profile.strategy.compound_sequence) - 1)
                compound_in = state.profile.strategy.compound_sequence[next_index]
            else:
                compound_in = "Intermediate"
            state.strategy_adaptations += 1
        else:
            next_index = min(state.compound_index + 1, len(state.profile.strategy.compound_sequence) - 1)
            compound_in = state.profile.strategy.compound_sequence[next_index]

        stationary = max(1.9, 2.5 - team.pit_crew_efficiency * 0.5 + state.damage * 0.08)
        total_loss = self.track.pit_loss_seconds * (0.82 if status in {"vsc", "safety_car"} else 1.0) + stationary
        state.diagnostics.pit_penalty += total_loss
        state.stint_laps.append(max(1, state.tire_age))
        state.pit_records.append(
            PitStopRecord(
                lap=lap,
                compound_out=compound_out,
                compound_in=compound_in,
                reason=reason,
                stationary_time=round(stationary, 3),
                total_loss=round(total_loss, 3),
            )
        )
        state.current_compound = compound_in
        state.compound_index = next_index
        state.next_planned_stop_index = min(state.next_planned_stop_index + 1, len(state.profile.strategy.pit_windows))
        state.pit_stops += 1
        state.tire_age = 0
        state.tire_wear = 0.0
        state.energy_store = min(0.95, state.energy_store + 0.08)
        return total_loss

    def _resolve_incident(
        self,
        state: DriverRaceState,
        lap: int,
        wetness: float,
        status: str,
        events: RaceEvents,
        rng: random.Random,
    ) -> tuple[bool, float]:
        if not state.in_race:
            return False, 0.0

        lap_dnf_probability = (
            max(self.request.environment.dnfs, self.weather.dnf_probability) / self.track.laps
        ) * (
            0.88
            + (1.0 - state.profile.driver.reliability / 100.0) * 0.9
            + wetness * 0.38
            + events.event_pressure * 0.24
        )
        if status in {"safety_car", "red_flag"}:
            lap_dnf_probability *= 0.7
        if rng.random() < lap_dnf_probability:
            state.diagnostics.reliability_penalty += 6.0 + wetness * 2.0
            return True, 0.0

        incident_probability = (
            max(self.request.environment.crashes, self.request.environment.yellow_flags) / self.track.laps
        ) * (
            1.1
            + state.profile.driver.aggression / 200.0
            + (1.0 - state.profile.driver.consistency / 100.0) * 0.8
            + self.track.safety_car_risk * 0.6
            + wetness * 0.5
        )
        if status == "green" and rng.random() < incident_probability:
            loss = rng.uniform(1.6, 7.8) * (1.0 + wetness * 0.3 + state.damage * 0.08)
            state.damage = min(0.55, state.damage + rng.uniform(0.02, 0.08))
            state.diagnostics.risk_penalty += state.damage * 0.2
            return False, loss
        return False, 0.0

    def _apply_neutralization_bunching(self, states: dict[str, DriverRaceState], status: str, rng: random.Random) -> None:
        if status not in {"safety_car", "red_flag"}:
            return

        active = sorted((state for state in states.values() if state.in_race), key=lambda item: item.total_time)
        if not active:
            return
        leader_time = active[0].total_time
        for index, state in enumerate(active[1:], start=1):
            target_gap = index * (0.42 if status == "red_flag" else 0.55)
            state.total_time = min(state.total_time, leader_time + target_gap + rng.uniform(0.0, 0.12))

    def _final_order(self, states: dict[str, DriverRaceState]) -> list[str]:
        classified = sorted(
            states.values(),
            key=lambda item: (
                0 if item.in_race else 1,
                item.total_time if item.in_race else -item.completed_laps,
                item.dnf_lap or self.track.laps + 1,
            ),
        )
        return [state.profile.driver.id for state in classified]
