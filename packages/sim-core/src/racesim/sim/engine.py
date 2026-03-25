from __future__ import annotations

import math
import random
from collections import Counter, defaultdict

from racesim.api.contracts import (
    DriverResult,
    EventSummary,
    PositionProbability,
    ScenarioSummary,
    SimulationRequest,
    SimulationResponse,
    StrategySuggestionRequest,
    TeamSummary,
)
from racesim.data.loaders import build_defaults_payload, get_team, get_track, get_weather, load_drivers
from racesim.data.models import DriverProfile, StrategyTemplate, TrackProfile, WeatherPreset
from racesim.model.predictor import PacePredictor
from racesim.sim.lap_engine import LapRaceEngine
from racesim.sim.state import DriverStaticProfile, build_circuit_leverage
from racesim.sim.strategies import StrategyFit, apply_overrides, evaluate_strategy, strategy_lookup, suggest_strategies

RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1]


def build_feature_vector(driver: DriverProfile, track: TrackProfile, weather: WeatherPreset) -> dict[str, float]:
    return {
        "recent_form": driver.recent_form,
        "qualifying_strength": driver.qualifying_strength,
        "tire_management": driver.tire_management,
        "overtaking": driver.overtaking,
        "consistency": driver.consistency,
        "aggression": driver.aggression,
        "wet_weather_skill": driver.wet_weather_skill,
        "reliability": driver.reliability,
        "track_tire_stress": track.tire_stress,
        "overtaking_difficulty": track.overtaking_difficulty,
        "track_position_importance": track.track_position_importance,
        "fuel_sensitivity": track.fuel_sensitivity,
        "pit_loss_norm": min(1.0, track.pit_loss_seconds / 36.0),
        "weather_risk": max(track.weather_volatility, weather.rain_onset_probability),
    }


class SimulationService:
    def __init__(self) -> None:
        self.predictor = PacePredictor()

    def defaults(self) -> dict:
        return build_defaults_payload()

    def strategy_suggestions(self, request: StrategySuggestionRequest):
        return suggest_strategies(request)

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        track = get_track(request.grand_prix_id)
        weather = get_weather(request.weather_preset_id)
        suggestions = suggest_strategies(request)
        suggestion_map = {item.driver_id: item for item in suggestions}
        drivers = [apply_overrides(driver, request.driver_overrides) for driver in load_drivers()]

        assigned_strategies = {
            driver.id: strategy_lookup(
                request.strategies.get(driver.id) or request.field_strategy_preset or suggestion_map[driver.id].strategy_id
            )
            for driver in drivers
        }
        profiles = self._build_static_profiles(drivers, assigned_strategies, track, weather, request)
        lap_engine = LapRaceEngine(track=track, weather=weather, request=request, profiles=profiles)

        finish_positions: dict[str, list[int]] = defaultdict(list)
        starting_positions: dict[str, list[int]] = defaultdict(list)
        dnf_counts: Counter[str] = Counter()
        strategy_success: Counter[str] = Counter()
        event_tallies = Counter()
        incident_time_totals: Counter[str] = Counter()
        event_pressure_totals: Counter[str] = Counter()
        diagnostic_totals: dict[str, Counter[str]] = defaultdict(Counter)
        pit_stop_totals: Counter[str] = Counter()
        first_pit_lap_totals: Counter[str] = Counter()
        first_pit_lap_counts: Counter[str] = Counter()
        overtake_totals: Counter[str] = Counter()
        stint_length_totals: Counter[str] = Counter()
        net_position_totals: Counter[str] = Counter()
        strategy_adaptation_totals: Counter[str] = Counter()
        turning_point_counts: Counter[str] = Counter()
        safety_car_lap_total = 0
        safety_car_lap_count = 0

        for run_index in range(request.simulation_runs):
            rng = random.Random(self._scenario_seed(request, track, weather) + run_index * 37)
            run = lap_engine.simulate_run(rng)
            self._record_race_events(event_tallies, run)
            for turning_point in run.turning_points:
                turning_point_counts[turning_point] += 1
            if run.safety_car_laps:
                safety_car_lap_total += sum(run.safety_car_laps) / len(run.safety_car_laps)
                safety_car_lap_count += 1

            for position, driver_id in enumerate(run.finish_order, start=1):
                summary = run.driver_summaries[driver_id]
                finish_positions[driver_id].append(position)
                starting_positions[driver_id].append(summary.starting_position)
                if summary.dnf:
                    dnf_counts[driver_id] += 1
                    event_tallies["dnf_total"] += 1
                if summary.strategy_success:
                    strategy_success[driver_id] += 1
                incident_time_totals[driver_id] += summary.incident_time_loss
                event_pressure_totals[driver_id] += run.event_pressure
                pit_stop_totals[driver_id] += summary.pit_stops
                overtake_totals[driver_id] += summary.overtakes
                stint_length_totals[driver_id] += summary.average_stint_length
                net_position_totals[driver_id] += summary.positions_gained
                if summary.average_first_pit_lap is not None:
                    first_pit_lap_totals[driver_id] += summary.average_first_pit_lap
                    first_pit_lap_counts[driver_id] += 1
                strategy_adaptation_totals[driver_id] += summary.strategy_adaptations
                for key, value in summary.diagnostics.items():
                    diagnostic_totals[driver_id][key] += value

            event_tallies["green_overtakes_total"] += run.green_overtakes
            event_tallies["pit_stops_total"] += run.total_pit_stops

        driver_results = self._build_driver_results(
            profiles=profiles,
            finish_positions=finish_positions,
            starting_positions=starting_positions,
            dnf_counts=dnf_counts,
            strategy_success=strategy_success,
            pit_stop_totals=pit_stop_totals,
            first_pit_lap_totals=first_pit_lap_totals,
            first_pit_lap_counts=first_pit_lap_counts,
            overtake_totals=overtake_totals,
            stint_length_totals=stint_length_totals,
            net_position_totals=net_position_totals,
            incident_time_totals=incident_time_totals,
            event_pressure_totals=event_pressure_totals,
            strategy_adaptation_totals=strategy_adaptation_totals,
            diagnostic_totals=diagnostic_totals,
            suggestions=suggestion_map,
            track=track,
            weather=weather,
            request=request,
        )

        team_summary = self._build_team_summary(driver_results)
        event_summary = self._build_event_summary(
            tallies=event_tallies,
            weather=weather,
            track=track,
            request=request,
            turning_point_counts=turning_point_counts,
            avg_safety_car_lap=round(safety_car_lap_total / safety_car_lap_count, 2) if safety_car_lap_count else None,
        )
        scenario = ScenarioSummary(
            grand_prix_id=track.id,
            grand_prix_name=track.name,
            weather_preset_id=weather.id,
            weather_preset_name=weather.label,
            simulation_engine="lap-by-lap",
            simulation_runs=request.simulation_runs,
            complexity_level=request.complexity_level,
            sprint_weekend=track.sprint_weekend,
            headline=self._headline(track, weather, request),
            strategy_outlook=self._strategy_outlook(track, weather, request),
            event_outlook=self._event_outlook(event_summary),
            confidence_note=self._confidence_note(driver_results, event_summary),
        )

        return SimulationResponse(
            scenario=scenario,
            drivers=driver_results,
            team_summary=team_summary,
            event_summary=event_summary,
            strategy_suggestions=list(suggestions),
        )

    def _build_static_profiles(
        self,
        drivers: list[DriverProfile],
        assigned_strategies: dict[str, StrategyTemplate],
        track: TrackProfile,
        weather: WeatherPreset,
        request: SimulationRequest,
    ) -> dict[str, DriverStaticProfile]:
        raw_profiles: list[DriverStaticProfile] = []
        for driver in drivers:
            strategy = assigned_strategies[driver.id]
            strategy_fit = evaluate_strategy(driver, track, weather, strategy, request.weights, request.environment)
            team = get_team(driver.team_id)
            team_baseline = (team.race_pace - 80.0) * 0.55 + (team.qualifying_pace - 80.0) * 0.18
            raw_pace_score = self.predictor.predict(build_feature_vector(driver, track, weather)) + team_baseline
            energy_strength = min(
                1.0,
                (((driver.energy_management / 100.0) * 0.62 + team.energy_efficiency * 0.38) * (0.82 + track.energy_sensitivity * 0.35)),
            )
            event_exposure = min(
                1.0,
                0.12
                + (driver.aggression / 100.0) * 0.28
                + (1.0 - driver.reliability / 100.0) * 0.32
                + track.safety_car_risk * 0.14
                + track.weather_volatility * 0.14
                + request.environment.randomness_intensity * 0.14,
            )
            qualifying_leverage = (
                (driver.qualifying_strength / 100.0)
                * track.qualifying_importance
                * (0.72 + team.qualifying_pace / 250.0)
            )
            tire_risk = track.tire_stress * strategy.tire_load * (1.04 - driver.tire_management / 100.0)
            track_fit_score = self._track_fit_score(driver, team, track, weather)
            chaos_resilience = self._chaos_resilience(driver, team)
            raw_profiles.append(
                DriverStaticProfile(
                    driver=driver,
                    team_name=team.name,
                    strategy=strategy,
                    strategy_fit=strategy_fit,
                    pace_score=0.0,
                    raw_pace_score=raw_pace_score,
                    team_baseline=team_baseline,
                    pace_edge=0.0,
                    track_fit_score=track_fit_score,
                    chaos_resilience=chaos_resilience,
                    energy_strength=energy_strength,
                    event_exposure=event_exposure,
                    qualifying_leverage=qualifying_leverage,
                    tire_risk=tire_risk,
                    pace_rank=0,
                )
            )

        raw_scores = [profile.raw_pace_score for profile in raw_profiles]
        mean_raw = sum(raw_scores) / len(raw_scores)
        variance_raw = sum((score - mean_raw) ** 2 for score in raw_scores) / len(raw_scores)
        std_raw = math.sqrt(max(variance_raw, 1e-6))

        for profile in raw_profiles:
            pace_edge = ((profile.raw_pace_score - mean_raw) / std_raw) * 0.78
            profile.pace_edge = max(-1.6, min(1.6, pace_edge))
            profile.pace_score = round(
                62.0
                + profile.pace_edge * 4.8
                + profile.track_fit_score * 1.2
                + (profile.strategy_fit.score - 50.0) * 0.1,
                2,
            )

        ranked = sorted(
            raw_profiles,
            key=lambda item: (
                item.pace_edge * 8.1
                + item.track_fit_score
                * (1.6 + track.track_position_importance * 1.2 + track.energy_sensitivity * 0.4 + track.tire_stress * 0.3)
                + (item.strategy_fit.score - 50.0) * (0.28 + track.strategy_flexibility * 0.16 + track.tire_stress * 0.08)
                + item.qualifying_leverage * (1.0 + track.qualifying_importance * 1.8 + track.track_position_importance * 0.9)
                - item.tire_risk * (3.8 + track.tire_stress * 2.4)
            ),
            reverse=True,
        )
        for index, profile in enumerate(ranked, start=1):
            profile.pace_rank = index
        return {profile.driver.id: profile for profile in raw_profiles}

    def _record_race_events(self, tallies: Counter, run) -> None:
        tallies["wet_start"] += int(run.wet_start)
        tallies["weather_shift"] += int(run.weather_shift)
        tallies["yellow_flag"] += int(run.yellow_flag)
        tallies["vsc"] += int(run.vsc)
        tallies["safety_car"] += int(run.safety_car)
        tallies["red_flag"] += int(run.red_flag)
        tallies["late_incident"] += int(run.late_incident)
        tallies["event_pressure_total"] += run.event_pressure

    def _build_driver_results(
        self,
        profiles: dict[str, DriverStaticProfile],
        finish_positions: dict[str, list[int]],
        starting_positions: dict[str, list[int]],
        dnf_counts: Counter[str],
        strategy_success: Counter[str],
        pit_stop_totals: Counter[str],
        first_pit_lap_totals: Counter[str],
        first_pit_lap_counts: Counter[str],
        overtake_totals: Counter[str],
        stint_length_totals: Counter[str],
        net_position_totals: Counter[str],
        incident_time_totals: Counter[str],
        event_pressure_totals: Counter[str],
        strategy_adaptation_totals: Counter[str],
        diagnostic_totals: dict[str, Counter[str]],
        suggestions: dict,
        track: TrackProfile,
        weather: WeatherPreset,
        request: SimulationRequest,
    ) -> list[DriverResult]:
        driver_results: list[DriverResult] = []
        for driver_id, profile in profiles.items():
            positions = finish_positions[driver_id]
            grids = starting_positions[driver_id]
            mean_position = sum(positions) / len(positions)
            variance = sum((position - mean_position) ** 2 for position in positions) / len(positions)
            stddev = math.sqrt(variance)
            dnf_probability = dnf_counts[driver_id] / request.simulation_runs
            uncertainty_index = round(stddev / len(profiles), 4)
            confidence_label = self._confidence_label(uncertainty_index, profile.event_exposure, dnf_probability)
            scenario_sensitivity = round(
                (
                    request.environment.randomness_intensity
                    + weather.rain_onset_probability
                    + track.weather_volatility
                    + profile.event_exposure
                )
                / 4.0,
                4,
            )
            distribution = [
                PositionProbability(position=position, probability=round(positions.count(position) / len(positions), 4))
                for position in range(1, len(profiles) + 1)
            ]

            diagnostics = {
                key: round(value / request.simulation_runs, 4)
                for key, value in diagnostic_totals[driver_id].items()
            }
            diagnostics |= {
                "raw_pace_score": round(profile.raw_pace_score, 4),
                "team_baseline": round(profile.team_baseline, 4),
                "pace_edge": round(profile.pace_edge, 4),
                "track_fit_score": round(profile.track_fit_score, 4),
                "chaos_resilience": round(profile.chaos_resilience, 4),
                "event_exposure": round(profile.event_exposure, 4),
                "average_first_pit_lap": round(
                    first_pit_lap_totals[driver_id] / first_pit_lap_counts[driver_id],
                    2,
                )
                if first_pit_lap_counts[driver_id]
                else 0.0,
                "average_overtakes": round(overtake_totals[driver_id] / request.simulation_runs, 4),
                "net_position_delta": round(net_position_totals[driver_id] / request.simulation_runs, 4),
            }

            expected_stop_count = round(pit_stop_totals[driver_id] / request.simulation_runs, 2)
            average_first_pit_lap = (
                round(first_pit_lap_totals[driver_id] / first_pit_lap_counts[driver_id], 2)
                if first_pit_lap_counts[driver_id]
                else None
            )
            average_overtakes = round(overtake_totals[driver_id] / request.simulation_runs, 2)
            average_stint_length = round(stint_length_totals[driver_id] / request.simulation_runs, 2)
            net_position_delta = round(net_position_totals[driver_id] / request.simulation_runs, 2)
            expected_grid_position = round(sum(grids) / len(grids), 2)

            driver_results.append(
                DriverResult(
                    driver_id=driver_id,
                    driver_name=profile.driver.name,
                    team_id=profile.driver.team_id,
                    team_name=profile.team_name,
                    assigned_strategy_id=profile.strategy.id,
                    assigned_strategy_name=profile.strategy.name,
                    expected_finish_position=round(mean_position, 2),
                    win_probability=round(positions.count(1) / len(positions), 4),
                    podium_probability=round(sum(1 for p in positions if p <= 3) / len(positions), 4),
                    top_10_probability=round(sum(1 for p in positions if p <= 10) / len(positions), 4),
                    points_probability=round(sum(1 for p in positions if p <= 10) / len(positions), 4),
                    dnf_probability=round(dnf_probability, 4),
                    expected_points=round(self._expected_points(positions, profile, track), 2),
                    strategy_success_rate=round(strategy_success[driver_id] / request.simulation_runs, 4),
                    uncertainty_index=uncertainty_index,
                    confidence_label=confidence_label,
                    scenario_sensitivity=scenario_sensitivity,
                    event_exposure=round(profile.event_exposure, 4),
                    strategy_fit_score=round(profile.strategy_fit.score, 2),
                    expected_pace_score=round(profile.pace_score, 2),
                    expected_grid_position=expected_grid_position,
                    expected_stop_count=expected_stop_count,
                    average_first_pit_lap=average_first_pit_lap,
                    average_overtakes=average_overtakes,
                    average_stint_length=average_stint_length,
                    net_position_delta=net_position_delta,
                    explanation=self._explain_driver(
                        profile=profile,
                        suggestion=suggestions[driver_id],
                        track=track,
                        weather=weather,
                        dnf_probability=dnf_probability,
                        mean_incident_loss=incident_time_totals[driver_id] / max(1, request.simulation_runs),
                        mean_event_pressure=event_pressure_totals[driver_id] / max(1, request.simulation_runs),
                        expected_stop_count=expected_stop_count,
                        average_first_pit_lap=average_first_pit_lap,
                        average_overtakes=average_overtakes,
                        net_position_delta=net_position_delta,
                        strategy_adaptations=strategy_adaptation_totals[driver_id] / max(1, request.simulation_runs),
                    ),
                    position_distribution=distribution,
                    diagnostics=diagnostics,
                )
            )

        driver_results.sort(key=lambda item: item.expected_finish_position)
        return driver_results

    def _track_fit_score(self, driver: DriverProfile, team, track: TrackProfile, weather: WeatherPreset) -> float:
        weather_pressure = max(track.weather_volatility, weather.rain_onset_probability)
        qualifying_fit = ((driver.qualifying_strength / 100.0) - 0.82) * track.qualifying_importance * 14.0
        tire_fit = ((driver.tire_management / 100.0) - 0.8) * track.tire_stress * 13.0
        overtake_fit = ((driver.overtaking / 100.0) - 0.8) * (1.0 - track.overtaking_difficulty) * 12.0
        energy_fit = (
            ((driver.energy_management / 100.0) * 0.6 + team.energy_efficiency * 0.4 - 0.82)
            * track.energy_sensitivity
            * 13.5
        )
        wet_fit = ((driver.wet_weather_skill / 100.0) - 0.79) * weather_pressure * 11.0
        consistency_fit = ((driver.consistency / 100.0) - 0.82) * track.surface_evolution * 9.0
        return qualifying_fit + tire_fit + overtake_fit + energy_fit + wet_fit + consistency_fit

    def _chaos_resilience(self, driver: DriverProfile, team) -> float:
        return min(
            1.0,
            max(
                0.0,
                (driver.reliability / 100.0) * 0.3
                + (driver.consistency / 100.0) * 0.24
                + (driver.wet_weather_skill / 100.0) * 0.18
                + (driver.tire_management / 100.0) * 0.14
                + team.reliability_base * 0.14,
            ),
        )

    def _scenario_seed(self, request: SimulationRequest, track: TrackProfile, weather: WeatherPreset) -> int:
        serial = [
            track.id,
            weather.id,
            request.complexity_level,
            str(request.simulation_runs),
            *(f"{value:.3f}" for value in request.weights.model_dump().values()),
            *(f"{value:.3f}" for value in request.environment.model_dump().values()),
            *(sorted(request.strategies.values())),
        ]
        return 1307 + sum((index + 1) * sum(ord(char) for char in item) for index, item in enumerate(serial))

    def _build_team_summary(self, driver_results: list[DriverResult]) -> list[TeamSummary]:
        grouped_team_results: dict[str, list[DriverResult]] = defaultdict(list)
        for result in driver_results:
            grouped_team_results[result.team_id].append(result)

        team_summary = [
            TeamSummary(
                team_id=team_id,
                team_name=results[0].team_name,
                avg_expected_finish=round(sum(item.expected_finish_position for item in results) / len(results), 2),
                expected_points=round(sum(item.expected_points for item in results), 2),
                combined_win_probability=round(sum(item.win_probability for item in results), 4),
                combined_podium_probability=round(sum(item.podium_probability for item in results), 4),
            )
            for team_id, results in grouped_team_results.items()
        ]
        team_summary.sort(key=lambda item: (-item.expected_points, item.avg_expected_finish))
        return team_summary

    def _build_event_summary(
        self,
        tallies: Counter,
        weather: WeatherPreset,
        track: TrackProfile,
        request: SimulationRequest,
        turning_point_counts: Counter[str],
        avg_safety_car_lap: float | None,
    ) -> EventSummary:
        leverage = build_circuit_leverage(track)
        runs = request.simulation_runs
        rates = {
            "Weather shift": tallies["weather_shift"] / runs,
            "Yellow flag": tallies["yellow_flag"] / runs,
            "VSC": tallies["vsc"] / runs,
            "Safety car": tallies["safety_car"] / runs,
            "Red flag": tallies["red_flag"] / runs,
            "Late incident": tallies["late_incident"] / runs,
        }
        dominant_factor = max(rates.items(), key=lambda item: item[1])[0]
        volatility_index = round(
            (
                tallies["event_pressure_total"] / runs
                + weather.rain_onset_probability
                + track.weather_volatility
                + request.environment.randomness_intensity
            )
            / 4.0,
            4,
        )
        avg_pit_stops_per_driver = round(tallies["pit_stops_total"] / (runs * len(load_drivers())), 2)
        avg_green_flag_overtakes = round(tallies["green_overtakes_total"] / runs, 2)
        turning_points = [item for item, _ in turning_point_counts.most_common(4)]

        impact_summary = []
        if rates["Weather shift"] > 0.24 or tallies["wet_start"] / runs > 0.12:
            impact_summary.append("lap-by-lap weather transitions are changing crossover laps and stint length")
        if rates["Safety car"] > 0.16:
            impact_summary.append("neutralized windows are materially changing pit-loss math and restart leverage")
        if avg_green_flag_overtakes < 6 and track.overtaking_difficulty > 0.8:
            impact_summary.append("track position remains sticky, so qualifying and early track order shape the race")
        if avg_pit_stops_per_driver > 1.7:
            impact_summary.append("the simulated race is stop-heavy, so tire cliff management matters more than usual")
        if not impact_summary:
            impact_summary.append("the race flow stays balanced enough that pace, pit timing, and traffic all retain influence")

        return EventSummary(
            weather_shift_rate=round(rates["Weather shift"], 4),
            yellow_flag_rate=round(rates["Yellow flag"], 4),
            vsc_rate=round(rates["VSC"], 4),
            safety_car_rate=round(rates["Safety car"], 4),
            red_flag_rate=round(rates["Red flag"], 4),
            dnf_rate=round(tallies["dnf_total"] / (runs * len(load_drivers())), 4),
            late_incident_rate=round(rates["Late incident"], 4),
            volatility_index=volatility_index,
            dominant_factor=dominant_factor,
            impact_summary=impact_summary[:3],
            avg_pit_stops_per_driver=avg_pit_stops_per_driver,
            avg_green_flag_overtakes=avg_green_flag_overtakes,
            avg_safety_car_lap=avg_safety_car_lap,
            turning_points=turning_points,
            circuit_diagnostics={
                "circuit_type": track.circuit_type,
                "degradation_profile": track.degradation_profile,
                "track_position_importance": round(track.track_position_importance, 4),
                "overtaking_difficulty": round(track.overtaking_difficulty, 4),
                "qualifying_importance": round(track.qualifying_importance, 4),
                "tire_stress": round(track.tire_stress, 4),
                "safety_car_risk": round(track.safety_car_risk, 4),
                "weather_volatility": round(track.weather_volatility, 4),
                "energy_sensitivity": round(track.energy_sensitivity, 4),
                "strategy_flexibility": round(track.strategy_flexibility, 4),
                **leverage.as_dict(),
            },
        )

    def _headline(self, track: TrackProfile, weather: WeatherPreset, request: SimulationRequest) -> str:
        if track.sprint_weekend:
            return f"{track.name} now runs through a full lap-by-lap weekend model, so Sprint-format grid pressure and Sunday race control both matter."
        if weather.rain_onset_probability > 0.45 or request.environment.rain_onset > 0.4:
            return f"{track.name} projects as a crossover race where the lap-by-lap pit window matters more than a static dry-race baseline."
        if track.qualifying_importance > 0.84:
            return f"{track.name} remains heavily qualifying-led, but the result now still evolves through laps, traffic, and pit timing."
        if track.energy_sensitivity > 0.8:
            return f"{track.name} puts real weight on 2026 energy release and active-aero transitions across the lap sequence."
        return f"{track.name} now resolves through evolving lap states instead of a one-shot ranking pass."

    def _strategy_outlook(self, track: TrackProfile, weather: WeatherPreset, request: SimulationRequest) -> str:
        if request.environment.full_safety_cars > 0.18:
            return "Flexible and safety-car-aware plans gain value because the lap model can now reward neutralized stop timing directly."
        if track.tire_stress > 0.68:
            return "Long-run tire management remains the key separator because stint fade now accumulates lap by lap."
        if track.energy_sensitivity > 0.75:
            return "Deployment management and low-drag efficiency are a bigger part of the race than usual, especially in traffic."
        if weather.rain_onset_probability > 0.35:
            return "Weather adaptability is not optional here; crossover timing now directly changes stint structure and pit outcomes."
        return "Balanced strategies retain the best regret profile because no single race phase dominates the Grand Prix."

    def _event_outlook(self, event_summary: EventSummary) -> str:
        return f"{event_summary.dominant_factor} is the strongest race-control channel, with a lap-model volatility index of {event_summary.volatility_index:.2f}."

    def _confidence_note(self, driver_results: list[DriverResult], event_summary: EventSummary) -> str:
        stable_count = sum(1 for driver in driver_results if driver.confidence_label == "Stable")
        if event_summary.volatility_index > 0.5:
            return "Interpret the order as a probability map rather than a hard forecast; lap-by-lap event pressure is wide enough to move the race after the start."
        if stable_count >= 4:
            return "The front of the field is comparatively well anchored, but the lap model still leaves room for strategy and traffic to reshuffle the points fight."
        return "Confidence is moderate overall; race flow matters enough that a single fixed ranking would overstate certainty."

    def _confidence_label(self, uncertainty_index: float, event_exposure: float, dnf_probability: float) -> str:
        combined = uncertainty_index * 0.5 + event_exposure * 0.35 + dnf_probability * 0.15
        if combined < 0.2:
            return "Stable"
        if combined < 0.28:
            return "Measured"
        if combined < 0.38:
            return "Exposed"
        return "High Variance"

    def _explain_driver(
        self,
        profile: DriverStaticProfile,
        suggestion,
        track: TrackProfile,
        weather: WeatherPreset,
        dnf_probability: float,
        mean_incident_loss: float,
        mean_event_pressure: float,
        expected_stop_count: float,
        average_first_pit_lap: float | None,
        average_overtakes: float,
        net_position_delta: float,
        strategy_adaptations: float,
    ) -> list[str]:
        explanation: list[str] = []
        if profile.qualifying_leverage > 0.7:
            explanation.append("qualifying still matters here because track position shapes the early lap sequence")
        if expected_stop_count > 1.6:
            explanation.append("the lap model is pulling this car into a multi-stop race more often than a simple baseline would suggest")
        if average_first_pit_lap is not None and average_first_pit_lap < track.laps * 0.32:
            explanation.append("the race often tilts toward an earlier first stop, so undercut timing matters")
        if profile.tire_risk > 0.42:
            explanation.append("tire degradation pressure is trimming the long-run projection as the stint ages")
        if average_overtakes > 1.2 and track.overtaking_difficulty < 0.5:
            explanation.append("cleaner overtaking windows are helping this car recover or attack through the run")
        if net_position_delta > 0.3:
            explanation.append("the lap-by-lap model expects this driver to gain track position over the race distance")
        if weather.rain_onset_probability > 0.3 and strategy_adaptations > 0.15:
            explanation.append("weather crossover pressure increases the value of strategy adaptability in this scenario")
        if suggestion.risk_profile in {"Assertive", "High Variance"}:
            explanation.append("strategy upside is available, but the finish range is still wider than the median order suggests")
        if mean_incident_loss > 1.2 or dnf_probability > 0.09 or mean_event_pressure > 0.45:
            explanation.append("incident and race-control exposure remain high enough to weaken confidence in the median finish")
        return explanation[:3] or [
            "pace, pit timing, traffic, and race-control pressure remain balanced with no single factor fully dominating the forecast"
        ]

    def _expected_points(self, positions: list[int], profile: DriverStaticProfile, track: TrackProfile) -> float:
        race_points = sum(RACE_POINTS[position - 1] for position in positions if position <= len(RACE_POINTS)) / len(positions)
        if not track.sprint_weekend:
            return race_points
        if profile.pace_rank > len(SPRINT_POINTS):
            return race_points

        sprint_seed = SPRINT_POINTS[profile.pace_rank - 1]
        sprint_multiplier = min(1.0, 0.48 + profile.qualifying_leverage * 0.36 + profile.strategy_fit.score / 140.0)
        sprint_points = sprint_seed * sprint_multiplier
        return race_points + sprint_points
