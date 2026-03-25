from __future__ import annotations

import math
import random
from collections import Counter
from dataclasses import dataclass

from racesim.api.contracts import EnvironmentControls, SimulationRequest, SimulationWeights
from racesim.data.loaders import get_team
from racesim.data.models import TrackProfile, WeatherPreset
from racesim.sim.events import EventEngine, RaceEvents
from racesim.sim.state import (
    DriverRaceState,
    DriverRunSummary,
    DriverStaticProfile,
    PitStopRecord,
    RaceRunResult,
    build_circuit_leverage,
)


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
        self.leverage = build_circuit_leverage(track)
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
            self._update_live_positions(sorted_states)
            attack_plan = self._build_attack_plan(sorted_states, lap, wetness, status, events, rng)

            for state in sorted_states:
                if not state.in_race:
                    continue

                pit_reason = self._pit_reason(state, lap, wetness, status, events, sorted_states)
                lap_time = self._lap_time_for_driver(
                    state=state,
                    lap=lap,
                    wetness=wetness,
                    track_grip=track_grip,
                    status=status,
                    events=events,
                    attack=attack_plan.get(state.profile.driver.id, AttackPlan()),
                    pit_reason=pit_reason,
                    ordered_states=sorted_states,
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
            self._update_live_positions(self._ordered_active_states(states))
            self._resolve_post_pit_effects(states)

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
                position_changes=state.position_change_events,
                positions_gained=state.starting_position - finish_position,
                incident_time_loss=round(state.incident_time_loss, 3),
                strategy_success=(
                    state.in_race
                    and (
                        finish_position <= state.starting_position + 1
                        or abs(state.pit_stops - len(state.profile.strategy.pit_windows)) <= 1
                        or state.undercut_successes > 0
                        or state.overcut_successes > 0
                    )
                    and state.incident_time_loss < 6.0
                    and state.pit_timing_regret_total < 2.8
                ),
                strategy_adaptations=state.strategy_adaptations,
                undercut_attempts=state.undercut_attempts,
                undercut_successes=state.undercut_successes,
                overcut_attempts=state.overcut_attempts,
                overcut_successes=state.overcut_successes,
                post_pit_position_delta=round(state.post_pit_position_delta_total, 3),
                post_pit_traffic_penalty=round(state.post_pit_traffic_penalty_total, 3),
                pit_timing_regret=round(state.pit_timing_regret_total, 3),
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
                current_position=grid_position,
                qualifying_baseline=qualifying_score,
                total_time=(grid_position - 1) * (0.08 + self.leverage.track_position_multiplier * 0.18),
                current_compound=compound,
                compound_index=0,
                fuel_load=1.0,
                energy_store=0.84 + profile.energy_strength * 0.08,
            )
        return states

    def _ordered_active_states(self, states: dict[str, DriverRaceState]) -> list[DriverRaceState]:
        ordered = sorted(states.values(), key=lambda item: item.total_time)
        return [state for state in ordered if state.in_race]

    def _update_live_positions(self, ordered_states: list[DriverRaceState]) -> None:
        for position, ordered_state in enumerate(ordered_states, start=1):
            if ordered_state.completed_laps > 0 and ordered_state.current_position != position:
                ordered_state.position_change_events += abs(ordered_state.current_position - position)
            ordered_state.current_position = position

    def _pit_rejoin_context(
        self,
        state: DriverRaceState,
        ordered_states: list[DriverRaceState],
        status: str,
        events: RaceEvents,
    ) -> dict[str, float]:
        team = get_team(state.profile.driver.team_id)
        projected_loss = self.track.pit_loss_seconds
        if status in {"vsc", "safety_car", "red_flag"}:
            projected_loss *= events.pit_discount
        projected_loss += max(1.9, 2.5 - team.pit_crew_efficiency * 0.5 + state.damage * 0.08)

        projected_time = state.total_time + projected_loss
        others = [other for other in ordered_states if other.profile.driver.id != state.profile.driver.id]
        ahead = [other for other in others if other.total_time <= projected_time]
        behind = [other for other in others if other.total_time > projected_time]
        rejoin_position = len(ahead) + 1
        ahead_gap = projected_time - ahead[-1].total_time if ahead else 3.5
        behind_gap = behind[0].total_time - projected_time if behind else 3.5
        density = sum(1 for other in others if abs(other.total_time - projected_time) <= 1.45)
        projected_position_loss = max(0, rejoin_position - state.current_position)
        clean_air_probability = max(0.0, min(1.0, (ahead_gap + behind_gap - density * 0.3) / 3.2))
        return {
            "rejoin_position": float(rejoin_position),
            "ahead_gap": float(ahead_gap),
            "behind_gap": float(behind_gap),
            "density": float(density),
            "projected_position_loss": float(projected_position_loss),
            "clean_air_probability": float(clean_air_probability),
        }

    def _resolve_post_pit_effects(self, states: dict[str, DriverRaceState]) -> None:
        for state in states.values():
            if not state.in_race or state.pending_pit_eval_laps <= 0 or state.pending_pit_reference_position is None:
                continue

            state.pending_pit_eval_laps -= 1
            state.pending_pit_traffic_accum += state.traffic_load
            state.post_pit_traffic_penalty_total += state.traffic_load
            state.diagnostics.post_pit_traffic_penalty += state.traffic_load

            if state.pending_pit_eval_laps > 0:
                continue

            position_delta = state.pending_pit_reference_position - state.current_position
            traffic_burden = state.pending_pit_traffic_accum
            state.post_pit_position_delta_total += position_delta
            state.diagnostics.post_pit_position_delta += position_delta

            reason = state.pending_pit_reason or ""
            if reason in {"undercut_window", "neutralized_window"}:
                if position_delta > 0:
                    state.undercut_successes += 1
                state.diagnostics.undercut_delta += position_delta
            elif reason in {"offset_window", "late_window"}:
                if position_delta >= 0:
                    state.overcut_successes += 1
                state.diagnostics.overcut_delta += position_delta

            regret = 0.0
            if position_delta < 0:
                regret += abs(position_delta) * 0.45
            if traffic_burden > 0.36:
                regret += traffic_burden * 0.3
            state.pit_timing_regret_total += regret
            state.diagnostics.pit_timing_regret += regret

            state.pending_pit_reference_position = None
            state.pending_pit_reason = None
            state.pending_pit_traffic_accum = 0.0

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

        restart_bonus = 0.0
        if lap in events.restart_laps:
            restart_bonus = 0.07 + max(
                0.0,
                self.leverage.restart_factor - self.leverage.overtake_suppression_factor * 0.45,
            ) * 0.11 + max(0.0, self.leverage.disruption_reshuffle_factor - 1.0) * 0.03
        for index in range(1, len(ordered_states)):
            follower = ordered_states[index]
            leader = ordered_states[index - 1]
            gap = max(0.0, follower.total_time - leader.total_time)
            leader_train_gap = (
                max(0.0, leader.total_time - ordered_states[index - 2].total_time) if index >= 2 else 3.0
            )
            attack_gap_limit = (
                0.82
                + self.leverage.alternate_strategy_factor * 0.52
                + self.leverage.deployment_sensitivity_factor * 0.24
                - self.leverage.order_lock_factor * 0.31
                + restart_bonus * 2.2
            )
            if gap > attack_gap_limit:
                continue

            dirty_air_penalty = (
                0.045
                + self.leverage.dirty_air_factor * 0.05
                + follower.profile.strategy.track_position_bias * 0.04
            )
            if leader_train_gap < 1.1:
                dirty_air_penalty += 0.03 + self.leverage.order_lock_factor * 0.01
            plan[follower.profile.driver.id].traffic_penalty += max(0.04, dirty_air_penalty)
            plan[follower.profile.driver.id].compression_penalty += (
                self.leverage.clean_air_factor * max(0.0, 1.1 - gap) * 0.07
            )

            tire_phase_ratio = follower.tire_wear / max(
                0.55,
                COMPOUND_SPECS.get(follower.current_compound, COMPOUND_SPECS["Medium"])["cliff"],
            )
            stint_attack_phase = max(0.0, tire_phase_ratio - 0.45)
            defense_factor = (
                (leader.profile.driver.consistency / 100.0) * 0.1
                + leader.profile.energy_strength * 0.08
                + leader.profile.strategy.track_position_bias * 0.1
                + leader.profile.qualifying_leverage * 0.04
            )

            relative_attack = (
                (follower.profile.pace_edge - leader.profile.pace_edge)
                * (0.32 + self.leverage.recovery_factor * 0.28)
                + (follower.profile.driver.overtaking - leader.profile.driver.overtaking)
                / 180.0
                * (0.72 + self.leverage.deployment_sensitivity_factor * 0.22)
                + (follower.profile.energy_strength - leader.profile.energy_strength)
                * (0.18 + self.leverage.deployment_sensitivity_factor * 0.22)
                + (leader.tire_wear - follower.tire_wear) * (0.48 + self.leverage.degradation_factor * 0.26)
                + (follower.profile.strategy.aggression - leader.profile.strategy.aggression)
                * (0.14 + self.leverage.strategy_flex_factor * 0.1)
                + restart_bonus
                + stint_attack_phase * (0.08 + self.leverage.degradation_factor * 0.05)
                + (0.06 + self.leverage.track_position_multiplier * 0.03 if follower.pit_stops < leader.pit_stops else 0.0)
                - self.leverage.overtake_suppression_factor * 1.02
                - defense_factor
                - wetness * (0.16 + self.leverage.weather_sensitivity_factor * 0.07)
            )
            if follower.current_compound == "Intermediate" and wetness > 0.45:
                relative_attack += 0.08 + max(0.0, self.leverage.weather_sensitivity_factor - 1.2) * 0.03
            fresher_tire_push = max(0.0, leader.tire_age - follower.tire_age) * (
                0.012 + self.leverage.alternate_strategy_factor * 0.008
            )
            offset_strategy_push = max(0, leader.pit_stops - follower.pit_stops) * (
                0.03 + self.leverage.alternate_strategy_factor * 0.04
            )
            relative_attack += fresher_tire_push + offset_strategy_push
            if (
                self.leverage.order_lock_factor > 1.75
                and lap not in events.restart_laps
                and gap > 0.45
                and fresher_tire_push + offset_strategy_push < 0.08
            ):
                relative_attack -= 0.28 + self.leverage.order_lock_factor * 0.11
            if self.leverage.alternate_strategy_factor > 1.35 and follower.pit_stops < leader.pit_stops:
                relative_attack += 0.1
            max_pass_probability = min(
                0.78,
                0.42
                + self.leverage.recovery_factor * 0.16
                + self.leverage.deployment_sensitivity_factor * 0.08
                + restart_bonus * 0.8
                - self.leverage.overtake_suppression_factor * 0.11,
            )
            pass_probability = max(
                0.004 if self.leverage.overtake_suppression_factor > 1.6 else 0.01,
                min(
                    max_pass_probability,
                    0.07
                    + relative_attack * 0.25
                    + (1.35 - gap) * (0.08 + self.leverage.recovery_factor * 0.05)
                    + self.request.weights.overtaking_sensitivity * 0.06
                    + (events.overtaking_window - 1.0) * 0.18
                    - max(0.0, 1.05 - leader_train_gap) * (0.04 + self.leverage.order_lock_factor * 0.015)
                    - self.leverage.dirty_air_factor * 0.035,
                ),
            )
            if self.leverage.order_lock_factor > 1.8 and lap not in events.restart_laps:
                pass_probability *= max(0.12, 1.0 - (self.leverage.order_lock_factor - 1.4) * 0.58)
            if relative_attack > -0.05 and rng.random() < pass_probability:
                bonus = 0.08 + max(0.0, relative_attack) * (0.17 + self.leverage.recovery_factor * 0.08)
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
        ordered_states: list[DriverRaceState],
        rng: random.Random,
    ) -> float:
        compound = COMPOUND_SPECS.get(state.current_compound, COMPOUND_SPECS["Medium"])
        fuel_factor = state.fuel_load
        tire_delta = self._tire_delta(state, wetness, compound)
        energy_delta, energy_penalty = self._energy_delta(state, wetness, events)
        track_position_bonus = self._track_position_bonus(state, lap)
        qualifying_bonus = max(
            0.0,
            state.profile.qualifying_leverage
            * self.leverage.qualifying_carryover_factor
            * (1.0 - lap / max(1, self.track.laps))
            * 0.14,
        )
        pace_component = state.profile.pace_edge * (0.28 + self.request.weights.driver_form_weight * 0.18)
        track_fit_bonus = state.profile.track_fit_score / 28.0
        strategy_component = ((state.profile.strategy_fit.score - 50.0) / 20.0) * (
            0.14
            + self.leverage.strategy_flex_factor * 0.12
            + self.leverage.pit_window_pressure_factor * 0.06
            + state.profile.strategy.aggression * 0.04
        )
        chaos_bonus = state.profile.chaos_resilience * events.event_pressure * self.request.weights.reliability_sensitivity * 0.22
        flexibility_bonus = (
            state.profile.strategy.flexibility
            * (
                0.05
                + max(0.0, self.leverage.strategy_flex_factor - 1.0) * 0.2
                + self.leverage.disruption_leverage_factor
                * 0.08
                * int(status in {"vsc", "safety_car", "red_flag"} or wetness > 0.35)
            )
        )
        weather_bonus = 0.0
        if wetness > 0.25:
            weather_bonus += (
                (state.profile.driver.wet_weather_skill / 100.0)
                * wetness
                * (0.2 + self.leverage.weather_sensitivity_factor * 0.14)
            )
        if pit_reason == "weather_crossover":
            weather_bonus += state.profile.strategy.weather_adaptability * (0.12 + self.leverage.weather_sensitivity_factor * 0.08)

        track_evo_bonus = self.request.environment.track_evolution * self.track.surface_evolution * (lap / self.track.laps) * 0.08
        fuel_penalty = fuel_factor * self.track.fuel_sensitivity * self.request.weights.fuel_effect_weight * 0.82
        tire_penalty = tire_delta
        temperature_penalty = self.request.environment.temperature_variation * self.track.tire_stress * 0.14 * (1.0 + wetness * 0.2)
        reliability_penalty = (1.0 - state.profile.driver.reliability / 100.0) * self.request.weights.reliability_sensitivity * 0.18
        risk_penalty = state.damage * 0.22 + state.profile.event_exposure * events.event_pressure * 0.08
        compression_penalty = attack.compression_penalty
        traffic_penalty = attack.traffic_penalty * (
            1.0 + self.leverage.order_lock_factor * 0.06 + state.profile.strategy.track_position_bias * 0.05
        )
        overtaking_bonus = attack.attack_bonus * (
            0.62
            + self.request.weights.overtaking_sensitivity * 0.54
            + state.profile.strategy.aggression * 0.08
        )

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
            lap_time += self._execute_pit_stop(state, lap, pit_reason, status, events, ordered_states)

        state.tire_age += 1
        wear_gain = compound["deg_rate"] * self.track.tire_stress * events.degradation_multiplier
        wear_gain *= (
            0.82
            + self.leverage.degradation_factor * 0.25
            + state.profile.strategy.tire_load * 0.38
            + self.request.weights.tire_wear_weight * 0.24
        )
        wear_gain *= 1.05 - state.profile.driver.tire_management / 220.0
        if wetness > 0.35 and state.current_compound != "Intermediate":
            wear_gain *= 1.12
        if state.clean_air is False:
            wear_gain *= 1.02 + self.leverage.clean_air_factor * 0.03
        state.tire_wear = min(1.4, state.tire_wear + wear_gain)
        state.fuel_load = max(0.0, 1.0 - lap / self.track.laps)
        state.energy_store = max(
            0.24,
            min(
                1.0,
                state.energy_store
                + 0.06
                - self.leverage.deployment_sensitivity_factor * 0.025
                - state.profile.strategy.aggression * 0.03,
            ),
        )
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
        diagnostics.traffic_penalty += traffic_penalty
        diagnostics.compression_penalty += compression_penalty + traffic_penalty
        diagnostics.stochastic_contribution += stochastic
        diagnostics.lap_count += 1
        return lap_time

    def _tire_delta(self, state: DriverRaceState, wetness: float, compound: dict[str, float]) -> float:
        mismatch_penalty = 0.0
        if state.current_compound == "Intermediate":
            mismatch_penalty = max(0.0, 0.22 - wetness) * (3.4 + self.leverage.weather_sensitivity_factor * 0.55)
        else:
            mismatch_penalty = max(0.0, wetness - 0.22) * (4.0 + self.leverage.weather_sensitivity_factor * 0.62)

        wear_factor = state.tire_wear * (
            0.32 + self.request.weights.tire_wear_weight * 0.62 + self.leverage.degradation_factor * 0.26
        )
        age_factor = state.tire_age * compound["deg_rate"] * (0.2 + self.leverage.degradation_factor * 0.42)
        cliff_penalty = max(0.0, state.tire_wear - compound["cliff"]) * (1.2 + self.leverage.degradation_factor * 1.8)
        return mismatch_penalty + wear_factor + age_factor + cliff_penalty

    def _energy_delta(self, state: DriverRaceState, wetness: float, events: RaceEvents) -> tuple[float, float]:
        available = state.energy_store * state.profile.energy_strength
        deployment_bonus = (
            available
            * self.leverage.deployment_sensitivity_factor
            * self.request.weights.energy_deployment_weight
            * 0.28
        )
        if wetness > 0.35:
            deployment_bonus *= 0.82
        if state.current_compound == "Intermediate":
            deployment_bonus *= 0.9
        deployment_bonus *= events.energy_management_multiplier

        target_spend = 0.06 + self.leverage.deployment_sensitivity_factor * 0.05 + state.profile.strategy.energy_bias * 0.05
        if wetness > 0.35:
            target_spend *= 0.88
        state.energy_store = max(0.25, min(1.0, state.energy_store - target_spend + 0.05))

        energy_penalty = max(0.0, 0.5 - state.energy_store) * self.leverage.deployment_sensitivity_factor * 0.42
        return deployment_bonus, energy_penalty

    def _track_position_bonus(self, state: DriverRaceState, lap: int) -> float:
        live_position = 1.0 - (state.current_position - 1) / max(1, len(self.profiles) - 1)
        grid_position = 1.0 - (state.starting_position - 1) / max(1, len(self.profiles) - 1)
        field_position = live_position * 0.7 + grid_position * 0.3
        race_phase = max(0.22, ((self.track.laps - lap) / self.track.laps) ** (0.8 + (1.0 - self.track.strategy_flexibility) * 0.45))
        return (
            self.leverage.track_position_multiplier
            * self.request.weights.qualifying_importance
            * race_phase
            * field_position
            * 0.18
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

    def _pit_reason(
        self,
        state: DriverRaceState,
        lap: int,
        wetness: float,
        status: str,
        events: RaceEvents,
        ordered_states: list[DriverRaceState],
    ) -> str | None:
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

        pit_context = self._pit_rejoin_context(state, ordered_states, status, events)
        target_lap = strategy.pit_windows[min(state.next_planned_stop_index, len(strategy.pit_windows) - 1)]
        window = max(
            1,
            min(
                4,
                int(
                    round(
                        1
                        + self.track.strategy_flexibility * 2.5
                        + strategy.flexibility * 1.8
                        - self.track.track_position_importance * 0.9
                    )
                ),
            ),
        )
        undercut_pull = strategy.aggression * (
            0.45
            + self.track.overtaking_difficulty * 0.4
            + self.track.tire_stress * 1.2
            + self.track.track_position_importance * 0.18
            - min(0.22, self.track.pit_loss_seconds / 100.0)
        )
        if self.leverage.weather_sensitivity_factor > 1.7 and wetness > 0.24 and state.current_compound != "Intermediate":
            return "weather_crossover"
        if self.leverage.weather_sensitivity_factor > 1.7 and wetness < 0.22 and state.current_compound == "Intermediate":
            return "weather_crossover"
        position_loss = max(0, state.current_position - state.starting_position)
        stuck_in_train = self.leverage.order_lock_factor > 1.7 and not state.clean_air and state.traffic_load > 0.14
        recovery_track = self.leverage.alternate_strategy_factor > 1.3
        projected_traffic_trap = (
            pit_context["density"] >= 3.0
            or pit_context["ahead_gap"] < 0.7
            or pit_context["projected_position_loss"] >= 4.0
        )
        clean_air_after_pit = pit_context["clean_air_probability"] > 0.56
        extend_window = (
            strategy.flexibility > 0.7
            or strategy.track_position_bias > 0.72
            or strategy.id in {"one-stop-control", "long-first-stint", "tire-preservation-offset"}
        )
        aggressive_window = (
            strategy.aggression > 0.72
            or strategy.energy_bias > 0.82
            or strategy.id in {"two-stop-attack", "undercut-attack", "high-deployment-attack"}
        )
        safety_car_reactive = strategy.safety_car_bias > 0.8 or strategy.id == "safety-car-reactive"
        cliff_threshold = max(
            0.48,
            COMPOUND_SPECS.get(state.current_compound, COMPOUND_SPECS["Medium"])["cliff"]
            + 0.1
            - self.leverage.degradation_factor * 0.08,
        )

        if (
            status in {"vsc", "safety_car"}
            and lap > 6
            and strategy.safety_car_bias + max(0.0, self.leverage.disruption_reshuffle_factor - 1.0) * 0.28 > 0.5
        ):
            return "neutralized_window"
        if state.tire_wear > cliff_threshold:
            return "tire_cliff"
        if (
            safety_car_reactive
            and status == "green"
            and projected_traffic_trap
            and events.safety_car
            and lap < target_lap + window
            and state.tire_wear < cliff_threshold - 0.08
        ):
            return None
        if (
            recovery_track
            and position_loss >= 2
            and lap >= max(7, target_lap - 4)
            and lap < target_lap
            and state.tire_wear > 0.31
        ):
            return "offset_window"
        if (
            extend_window
            and projected_traffic_trap
            and lap < target_lap + window
            and state.tire_wear < cliff_threshold - 0.06
        ):
            return None
        if (
            stuck_in_train
            and lap >= max(6, target_lap - 2 - int(round(undercut_pull)))
            and state.tire_wear > 0.27
            and clean_air_after_pit
        ):
            return "undercut_window"
        if (
            aggressive_window
            and clean_air_after_pit
            and lap >= max(5, target_lap - 3 - int(round(undercut_pull)))
            and lap < target_lap
            and state.tire_wear > 0.24
        ):
            return "undercut_window"
        if lap >= target_lap + window:
            return "late_window"
        if (
            extend_window
            and lap >= target_lap
            and lap < target_lap + window
            and projected_traffic_trap
            and state.tire_wear < cliff_threshold - 0.04
        ):
            return "late_window"
        if target_lap - undercut_pull <= lap <= target_lap + window and state.tire_wear > 0.46 + self.track.tire_stress * 0.08:
            return "planned_window"
        return None

    def _execute_pit_stop(
        self,
        state: DriverRaceState,
        lap: int,
        reason: str,
        status: str,
        events: RaceEvents,
        ordered_states: list[DriverRaceState],
    ) -> float:
        team = get_team(state.profile.driver.team_id)
        pit_context = self._pit_rejoin_context(state, ordered_states, status, events)
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
        pit_lane_loss = self.track.pit_loss_seconds
        if status in {"vsc", "safety_car", "red_flag"}:
            pit_lane_loss *= events.pit_discount
        total_loss = pit_lane_loss + stationary
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
                projected_rejoin_position=int(pit_context["rejoin_position"]),
                projected_traffic_density=round(pit_context["density"], 3),
            )
        )
        state.current_compound = compound_in
        state.compound_index = next_index
        state.next_planned_stop_index = min(state.next_planned_stop_index + 1, len(state.profile.strategy.pit_windows))
        state.pit_stops += 1
        state.tire_age = 0
        state.tire_wear = 0.0
        state.energy_store = min(0.95, state.energy_store + 0.08)
        state.pending_pit_eval_laps = 3
        state.pending_pit_reference_position = state.current_position
        state.pending_pit_reason = reason
        state.pending_pit_traffic_accum = 0.0
        if reason in {"undercut_window", "neutralized_window"}:
            state.undercut_attempts += 1
        if reason in {"offset_window", "late_window"}:
            state.overcut_attempts += 1
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
            + self.leverage.disruption_leverage_factor * 0.08
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
            + self.leverage.disruption_leverage_factor * 0.3
            + wetness * (0.36 + self.leverage.weather_sensitivity_factor * 0.08)
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
            gap_step = max(
                0.18,
                (0.48 if status == "red_flag" else 0.62)
                - self.leverage.disruption_leverage_factor * 0.14
                - self.leverage.restart_factor * 0.08,
            )
            target_gap = index * gap_step
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
