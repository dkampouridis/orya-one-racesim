from __future__ import annotations

import random
from dataclasses import dataclass

from racesim.api.contracts import EnvironmentControls
from racesim.data.models import TrackProfile, WeatherPreset
from racesim.sim.state import build_circuit_leverage


@dataclass
class NeutralizationWindow:
    kind: str
    start_lap: int
    end_lap: int


@dataclass
class RaceEvents:
    wet_start: bool
    weather_shift: bool
    yellow_flag: bool
    vsc: bool
    safety_car: bool
    red_flag: bool
    late_incident: bool
    weather_shift_lap: int | None
    drying_lap: int | None
    peak_wetness: float
    degradation_multiplier: float
    overtaking_window: float
    energy_management_multiplier: float
    pit_discount: float
    event_pressure: float
    neutralizations: list[NeutralizationWindow]
    restart_laps: set[int]
    narrative: list[str]

    def status_for_lap(self, lap: int) -> str:
        for window in self.neutralizations:
            if window.start_lap <= lap <= window.end_lap:
                return window.kind
        return "green"


class EventEngine:
    def __init__(self, rng: random.Random) -> None:
        self.rng = rng

    def race_events(self, track: TrackProfile, weather: WeatherPreset, env: EnvironmentControls) -> RaceEvents:
        leverage = build_circuit_leverage(track)
        complexity_multiplier = 1.0 + (env.randomness_intensity - 0.5) * 0.8
        mixed_pressure = max(
            env.mixed_conditions,
            weather.rain_onset_probability,
            track.weather_volatility,
        ) * (0.82 + leverage.weather_sensitivity_factor * 0.22)
        wet_start = self.rng.random() < max(0.02, (1.0 - env.dry_race) * mixed_pressure * 0.78)
        weather_shift_probability = max(
            env.rain_onset,
            weather.rain_onset_probability * (0.58 + leverage.weather_sensitivity_factor * 0.54),
        )
        weather_shift = not wet_start and self.rng.random() < min(0.82, weather_shift_probability * complexity_multiplier)

        caution_pressure = (
            max(env.yellow_flags, weather.yellow_flag_probability) * 0.42
            + max(env.virtual_safety_cars, weather.vsc_probability) * 0.2
            + max(env.full_safety_cars, weather.safety_car_probability) * 0.26
            + env.crashes * 0.12
        ) * (
            0.74
            + leverage.disruption_leverage_factor * 0.48
            + track.track_position_importance * 0.16
        )
        caution_pressure += max(0.0, leverage.restart_factor - 1.3) * 0.03

        yellow_flag = self.rng.random() < min(0.95, caution_pressure * complexity_multiplier)
        vsc_probability = max(env.virtual_safety_cars, weather.vsc_probability) * (
            0.56 + leverage.disruption_leverage_factor * 0.34 + track.overtaking_difficulty * 0.12
        )
        vsc = yellow_flag and self.rng.random() < min(0.74, vsc_probability * complexity_multiplier)

        safety_car_probability = (
            max(env.full_safety_cars, weather.safety_car_probability, track.safety_car_risk)
            * (0.58 + leverage.disruption_leverage_factor * 0.4 + track.track_position_importance * 0.12)
            * (1.0 + 0.18 * int(wet_start or weather_shift))
        )
        safety_car = self.rng.random() < min(0.66, safety_car_probability * complexity_multiplier)

        red_flag_probability = max(env.red_flags, weather.red_flag_probability) * (
            0.9 + 0.35 * int(wet_start or weather_shift) + 0.18 * int(safety_car)
        )
        red_flag = self.rng.random() < min(0.24, red_flag_probability * complexity_multiplier)
        late_incident = self.rng.random() < min(
            0.62,
            env.late_race_incidents
            * (
                0.72
                + leverage.disruption_leverage_factor * 0.3
                + leverage.weather_sensitivity_factor * 0.1
                + track.overtaking_difficulty * 0.18
            ),
        )

        weather_shift_lap: int | None = None
        drying_lap: int | None = None
        peak_wetness = 0.0
        narrative: list[str] = []
        if wet_start:
            peak_wetness = min(0.92, 0.52 + mixed_pressure * 0.42)
            if env.dry_race > 0.5 and env.mixed_conditions > 0.2:
                drying_lap = int(track.laps * self.rng.uniform(0.45, 0.72))
            narrative.append("wet conditions are live from the opening laps")
        elif weather_shift:
            weather_shift_lap = max(6, min(track.laps - 8, int(track.laps * self.rng.uniform(0.2, 0.72))))
            peak_wetness = min(0.9, 0.38 + mixed_pressure * 0.48)
            if env.dry_race > 0.4:
                drying_lap = min(track.laps - 2, weather_shift_lap + int(track.laps * self.rng.uniform(0.14, 0.24)))
            narrative.append("a mid-race weather shift opens a real crossover window")

        degradation_multiplier = 1.0 + max(0.0, leverage.degradation_factor - 1.0) * 0.18
        overtaking_window = (
            1.0
            + max(0.0, leverage.deployment_sensitivity_factor - 1.0) * 0.22
            + max(0.0, leverage.recovery_factor - 1.0) * 0.08
            - max(0.0, leverage.overtake_suppression_factor - 1.0) * 0.18
        )
        energy_management_multiplier = 1.0
        pit_discount = 1.0

        neutralizations: list[NeutralizationWindow] = []
        restart_laps: set[int] = set()
        safety_car_lap_seed: list[int] = []

        if vsc:
            start_lap = int(track.laps * self.rng.uniform(0.18, 0.68))
            duration = 1 if track.laps < 60 else self.rng.randint(1, 2)
            neutralizations.append(
                NeutralizationWindow(kind="vsc", start_lap=start_lap, end_lap=min(track.laps, start_lap + duration - 1))
            )
            pit_discount -= 0.06 + max(0.0, leverage.disruption_leverage_factor - 1.0) * 0.03
            energy_management_multiplier -= 0.02
            narrative.append("VSC exposure improves opportunistic stop timing")

        if safety_car:
            start_lap = int(track.laps * self.rng.uniform(0.16, 0.74))
            duration = self.rng.randint(2, 4)
            end_lap = min(track.laps, start_lap + duration - 1)
            neutralizations.append(NeutralizationWindow(kind="safety_car", start_lap=start_lap, end_lap=end_lap))
            safety_car_lap_seed.extend(list(range(start_lap, end_lap + 1)))
            restart_laps.add(min(track.laps, end_lap + 1))
            pit_discount -= 0.14 + max(0.0, leverage.disruption_leverage_factor - 1.0) * 0.06
            energy_management_multiplier -= 0.03
            overtaking_window -= max(0.03, leverage.overtake_suppression_factor * 0.025)
            narrative.append("a safety car compresses the field and changes pit-loss math")

        if late_incident:
            start_lap = max(4, int(track.laps * self.rng.uniform(0.72, 0.92)))
            if not any(window.start_lap <= start_lap <= window.end_lap for window in neutralizations):
                kind = "safety_car" if track.safety_car_risk > 0.42 or wet_start or weather_shift else "vsc"
                end_lap = min(track.laps, start_lap + (2 if kind == "safety_car" else 1))
                neutralizations.append(NeutralizationWindow(kind=kind, start_lap=start_lap, end_lap=end_lap))
                if kind == "safety_car":
                    safety_car_lap_seed.extend(list(range(start_lap, end_lap + 1)))
                    restart_laps.add(min(track.laps, end_lap + 1))
                narrative.append("late disruption keeps the final phase unstable")

        if red_flag:
            start_lap = int(track.laps * self.rng.uniform(0.22, 0.78))
            neutralizations.append(NeutralizationWindow(kind="red_flag", start_lap=start_lap, end_lap=min(track.laps, start_lap + 1)))
            restart_laps.add(min(track.laps, start_lap + 2))
            degradation_multiplier -= 0.03
            energy_management_multiplier -= 0.05
            pit_discount -= 0.08 + max(0.0, leverage.disruption_leverage_factor - 1.0) * 0.03
            narrative.append("a red flag resets tire pressure more than a normal caution")

        if wet_start:
            degradation_multiplier += 0.08 + max(0.0, leverage.weather_sensitivity_factor - 1.0) * 0.1
            overtaking_window -= 0.05 + leverage.weather_sensitivity_factor * 0.03
            energy_management_multiplier += 0.05
        if weather_shift:
            degradation_multiplier += 0.1 + max(0.0, leverage.weather_sensitivity_factor - 1.0) * 0.1
            overtaking_window -= 0.05 + leverage.weather_sensitivity_factor * 0.035
            energy_management_multiplier += 0.06

        event_pressure = min(
            1.0,
            0.18
            + max(0.0, leverage.disruption_leverage_factor - 1.0) * 0.12
            + 0.18 * int(wet_start or weather_shift)
            + 0.12 * int(yellow_flag)
            + 0.18 * int(vsc)
            + 0.2 * int(safety_car)
            + 0.12 * int(red_flag)
            + 0.1 * int(late_incident),
        )

        neutralizations.sort(key=lambda item: item.start_lap)
        return RaceEvents(
            wet_start=wet_start,
            weather_shift=weather_shift,
            yellow_flag=yellow_flag,
            vsc=vsc,
            safety_car=safety_car,
            red_flag=red_flag,
            late_incident=late_incident,
            weather_shift_lap=weather_shift_lap,
            drying_lap=drying_lap,
            peak_wetness=peak_wetness,
            degradation_multiplier=degradation_multiplier,
            overtaking_window=max(0.55, overtaking_window),
            energy_management_multiplier=max(0.8, energy_management_multiplier),
            pit_discount=max(0.62, pit_discount),
            event_pressure=event_pressure,
            neutralizations=neutralizations,
            restart_laps=restart_laps,
            narrative=narrative,
        )
