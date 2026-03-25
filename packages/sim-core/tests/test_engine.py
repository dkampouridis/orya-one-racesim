import random

from racesim.api.contracts import EnvironmentControls, SimulationRequest, SimulationWeights
from racesim.data.loaders import get_track, get_weather, load_drivers
from racesim.sim.engine import SimulationService
from racesim.sim.lap_engine import LapRaceEngine
from racesim.sim.state import build_circuit_leverage
from racesim.sim.strategies import strategy_lookup


def _build_lap_engine(service: SimulationService, request: SimulationRequest) -> LapRaceEngine:
    track = get_track(request.grand_prix_id)
    weather = get_weather(request.weather_preset_id)
    drivers = load_drivers()
    assigned = {
        driver.id: strategy_lookup(request.strategies.get(driver.id, "one-stop-control"))
        for driver in drivers
    }
    profiles = service._build_static_profiles(drivers, assigned, track, weather, request)
    return LapRaceEngine(track=track, weather=weather, request=request, profiles=profiles)


def test_lap_by_lap_run_records_pits_and_stints():
    service = SimulationService()
    request = SimulationRequest(
        grand_prix_id="bahrain-grand-prix",
        weather_preset_id="heat-deg",
        simulation_runs=50,
    )
    engine = _build_lap_engine(service, request)
    run = engine.simulate_run(random.Random(7))

    assert len(run.finish_order) == 22
    assert any(summary.pit_stops >= 1 for summary in run.driver_summaries.values())
    assert any(summary.average_stint_length > 0 for summary in run.driver_summaries.values())
    assert any(summary.diagnostics["tire_penalty"] > 0 for summary in run.driver_summaries.values())


def test_simulation_returns_ranked_driver_results():
    service = SimulationService()
    response = service.simulate(
        SimulationRequest(
            grand_prix_id="bahrain-grand-prix",
            weather_preset_id="heat-deg",
            simulation_runs=60,
        )
    )
    assert len(response.drivers) == 22
    assert response.drivers[0].expected_finish_position <= response.drivers[-1].expected_finish_position
    assert response.event_summary.safety_car_rate >= 0
    assert response.scenario.confidence_note
    assert response.scenario.simulation_engine == "lap-by-lap"
    assert response.event_summary.impact_summary
    assert response.drivers[0].expected_points >= 0
    assert "pace_component" in response.drivers[0].diagnostics
    assert "track_fit_score" in response.drivers[0].diagnostics
    assert response.drivers[0].expected_stop_count >= 0
    assert response.event_summary.circuit_diagnostics.track_position_multiplier > 0
    assert response.event_summary.circuit_diagnostics.overtake_suppression_factor > 0
    assert response.event_summary.strategy_diagnostics.avg_stop_count >= 0
    assert response.event_summary.strategy_diagnostics.strategy_sensitivity_index > 0


def test_named_circuits_hold_extreme_leverage_profiles():
    monaco = build_circuit_leverage(get_track("monaco-grand-prix"))
    monza = build_circuit_leverage(get_track("italian-grand-prix"))
    spa = build_circuit_leverage(get_track("belgian-grand-prix"))
    singapore = build_circuit_leverage(get_track("singapore-grand-prix"))
    baku = build_circuit_leverage(get_track("azerbaijan-grand-prix"))
    zandvoort = build_circuit_leverage(get_track("dutch-grand-prix"))

    assert monaco.track_position_multiplier > 2.8
    assert monaco.order_lock_factor > 2.8
    assert monza.deployment_sensitivity_factor > 2.5
    assert monza.recovery_factor > 1.45
    assert spa.weather_sensitivity_factor > 2.2
    assert singapore.disruption_leverage_factor > 2.1
    assert baku.restart_factor > 2.0
    assert baku.disruption_reshuffle_factor > 1.65
    assert zandvoort.order_lock_factor > 2.25


def _avg_position_delta(drivers, limit: int = 8) -> float:
    subset = drivers[:limit]
    return sum(abs(driver.expected_finish_position - driver.expected_grid_position) for driver in subset) / len(subset)


def _avg_first_pit_lap(drivers, limit: int = 8) -> float:
    subset = [driver.average_first_pit_lap for driver in drivers[:limit] if driver.average_first_pit_lap is not None]
    return sum(subset) / len(subset)


def _driver_by_id(drivers, driver_id: str):
    return next(driver for driver in drivers if driver.driver_id == driver_id)


def _distribution_distance(a, b) -> float:
    a_map = {item.position: item.probability for item in a}
    b_map = {item.position: item.probability for item in b}
    positions = set(a_map) | set(b_map)
    return sum(abs(a_map.get(position, 0.0) - b_map.get(position, 0.0)) for position in positions)


def test_monaco_and_monza_diverge_materially_on_overtakes_and_qualifying_retention():
    service = SimulationService()
    monaco = service.simulate(
        SimulationRequest(
            grand_prix_id="monaco-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=150,
        )
    )
    monza = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=150,
        )
    )

    monaco_position_delta = _avg_position_delta(monaco.drivers)
    monza_position_delta = _avg_position_delta(monza.drivers)
    assert (
        monaco.event_summary.circuit_diagnostics.track_position_multiplier
        > monza.event_summary.circuit_diagnostics.track_position_multiplier + 0.6
    )
    assert (
        monaco.event_summary.circuit_diagnostics.order_lock_factor
        > monza.event_summary.circuit_diagnostics.order_lock_factor + 0.9
    )
    assert monaco.event_summary.avg_green_flag_overtakes < monza.event_summary.avg_green_flag_overtakes * 0.75
    assert monaco_position_delta < monza_position_delta + 0.1


def test_high_chaos_wet_race_changes_winner_distribution():
    service = SimulationService()
    stable = service.simulate(
        SimulationRequest(
            grand_prix_id="belgian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=140,
            environment=EnvironmentControls(
                dry_race=0.95,
                mixed_conditions=0.05,
                rain_onset=0.02,
                track_evolution=0.55,
                temperature_variation=0.2,
                energy_deployment_intensity=0.55,
                crashes=0.05,
                dnfs=0.03,
                yellow_flags=0.08,
                virtual_safety_cars=0.05,
                full_safety_cars=0.05,
                red_flags=0.01,
                late_race_incidents=0.03,
                randomness_intensity=0.2,
            ),
        )
    )
    chaos = service.simulate(
        SimulationRequest(
            grand_prix_id="belgian-grand-prix",
            weather_preset_id="rain-crossover-threat",
            simulation_runs=140,
            environment=EnvironmentControls(
                dry_race=0.2,
                mixed_conditions=0.8,
                rain_onset=0.7,
                track_evolution=0.6,
                temperature_variation=0.6,
                energy_deployment_intensity=0.7,
                crashes=0.28,
                dnfs=0.2,
                yellow_flags=0.3,
                virtual_safety_cars=0.25,
                full_safety_cars=0.3,
                red_flags=0.08,
                late_race_incidents=0.25,
                randomness_intensity=0.8,
            ),
        )
    )

    stable_winner = stable.drivers[0]
    chaos_winner = chaos.drivers[0]

    assert stable.event_summary.volatility_index != chaos.event_summary.volatility_index
    assert stable.event_summary.avg_pit_stops_per_driver != chaos.event_summary.avg_pit_stops_per_driver
    assert abs(stable_winner.win_probability - chaos_winner.win_probability) >= 0.07
    assert abs(chaos_winner.net_position_delta) > abs(stable_winner.net_position_delta) + 2.0


def test_strategy_choice_changes_driver_projection():
    service = SimulationService()
    baseline = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
        )
    )
    aggressive = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"max-verstappen": "two-stop-attack"},
        )
    )

    baseline_max = next(driver for driver in baseline.drivers if driver.driver_id == "max-verstappen")
    aggressive_max = next(driver for driver in aggressive.drivers if driver.driver_id == "max-verstappen")

    assert baseline_max.assigned_strategy_id != aggressive_max.assigned_strategy_id
    assert (
        abs(baseline_max.expected_finish_position - aggressive_max.expected_finish_position) >= 0.3
        or abs(baseline_max.expected_stop_count - aggressive_max.expected_stop_count) >= 0.2
    )


def test_aggressive_and_conservative_strategies_diverge_materially_at_monza():
    service = SimulationService()
    conservative = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"max-verstappen": "one-stop-control"},
        )
    )
    aggressive = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"max-verstappen": "two-stop-attack"},
        )
    )

    conservative_max = _driver_by_id(conservative.drivers, "max-verstappen")
    aggressive_max = _driver_by_id(aggressive.drivers, "max-verstappen")

    assert aggressive_max.expected_stop_count > conservative_max.expected_stop_count + 0.7
    assert aggressive_max.average_overtakes > conservative_max.average_overtakes + 0.2
    assert _distribution_distance(conservative_max.position_distribution, aggressive_max.position_distribution) > 0.12
    assert (
        abs(conservative_max.win_probability - aggressive_max.win_probability) >= 0.03
        or abs(conservative_max.expected_finish_position - aggressive_max.expected_finish_position) >= 0.2
    )


def test_undercut_and_long_first_stint_diverge_when_timing_windows_open():
    service = SimulationService()
    undercut = service.simulate(
        SimulationRequest(
            grand_prix_id="azerbaijan-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"max-verstappen": "undercut-attack"},
        )
    )
    long_stint = service.simulate(
        SimulationRequest(
            grand_prix_id="azerbaijan-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"max-verstappen": "long-first-stint"},
        )
    )

    undercut_driver = _driver_by_id(undercut.drivers, "max-verstappen")
    long_stint_driver = _driver_by_id(long_stint.drivers, "max-verstappen")

    assert undercut_driver.average_first_pit_lap < long_stint_driver.average_first_pit_lap - 6.0
    assert undercut_driver.diagnostics["undercut_success_rate"] > long_stint_driver.diagnostics["undercut_success_rate"]
    assert long_stint_driver.diagnostics["overcut_success_rate"] > undercut_driver.diagnostics["overcut_success_rate"]
    assert (
        abs(undercut_driver.expected_finish_position - long_stint_driver.expected_finish_position) >= 0.2
        or _distribution_distance(undercut_driver.position_distribution, long_stint_driver.position_distribution) > 0.1
    )


def test_pitting_into_traffic_can_worsen_finish_on_monaco():
    service = SimulationService()
    track_position = service.simulate(
        SimulationRequest(
            grand_prix_id="monaco-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"charles-leclerc": "qualifying-track-position"},
        )
    )
    aggressive = service.simulate(
        SimulationRequest(
            grand_prix_id="monaco-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"charles-leclerc": "undercut-attack"},
        )
    )

    control_charles = _driver_by_id(track_position.drivers, "charles-leclerc")
    aggressive_charles = _driver_by_id(aggressive.drivers, "charles-leclerc")

    assert aggressive_charles.diagnostics["pit_timing_regret"] > control_charles.diagnostics["pit_timing_regret"]
    assert aggressive_charles.diagnostics["post_pit_position_delta"] < control_charles.diagnostics["post_pit_position_delta"]
    assert aggressive_charles.expected_finish_position >= control_charles.expected_finish_position


def test_safety_car_opportunities_improve_reactive_strategy_on_baku():
    service = SimulationService()
    high_sc_environment = EnvironmentControls(
        dry_race=0.74,
        mixed_conditions=0.26,
        rain_onset=0.15,
        track_evolution=0.58,
        temperature_variation=0.44,
        energy_deployment_intensity=0.7,
        crashes=0.2,
        dnfs=0.14,
        yellow_flags=0.28,
        virtual_safety_cars=0.24,
        full_safety_cars=0.32,
        red_flags=0.05,
        late_race_incidents=0.2,
        randomness_intensity=0.68,
    )
    low_sc_environment = EnvironmentControls(
        dry_race=0.88,
        mixed_conditions=0.12,
        rain_onset=0.06,
        track_evolution=0.54,
        temperature_variation=0.28,
        energy_deployment_intensity=0.64,
        crashes=0.05,
        dnfs=0.04,
        yellow_flags=0.08,
        virtual_safety_cars=0.06,
        full_safety_cars=0.05,
        red_flags=0.01,
        late_race_incidents=0.04,
        randomness_intensity=0.24,
    )

    high_sc_control = service.simulate(
        SimulationRequest(
            grand_prix_id="azerbaijan-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            environment=high_sc_environment,
            strategies={"george-russell": "one-stop-control"},
        )
    )
    high_sc_reactive = service.simulate(
        SimulationRequest(
            grand_prix_id="azerbaijan-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            environment=high_sc_environment,
            strategies={"george-russell": "safety-car-reactive"},
        )
    )
    low_sc_control = service.simulate(
        SimulationRequest(
            grand_prix_id="azerbaijan-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            environment=low_sc_environment,
            strategies={"george-russell": "one-stop-control"},
        )
    )
    low_sc_reactive = service.simulate(
        SimulationRequest(
            grand_prix_id="azerbaijan-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            environment=low_sc_environment,
            strategies={"george-russell": "safety-car-reactive"},
        )
    )

    high_sc_delta = _driver_by_id(high_sc_control.drivers, "george-russell").expected_finish_position - _driver_by_id(
        high_sc_reactive.drivers, "george-russell"
    ).expected_finish_position
    low_sc_delta = _driver_by_id(low_sc_control.drivers, "george-russell").expected_finish_position - _driver_by_id(
        low_sc_reactive.drivers, "george-russell"
    ).expected_finish_position

    assert high_sc_delta > low_sc_delta + 0.15
    assert (
        _driver_by_id(high_sc_reactive.drivers, "george-russell").average_first_pit_lap
        < _driver_by_id(low_sc_reactive.drivers, "george-russell").average_first_pit_lap
    )


def test_strategy_presets_change_podium_and_winner_distributions():
    service = SimulationService()
    baseline = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"oscar-piastri": "one-stop-control"},
        )
    )
    alternate = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            strategies={"oscar-piastri": "high-deployment-attack"},
        )
    )

    baseline_podium = [driver.driver_id for driver in baseline.drivers[:3]]
    alternate_podium = [driver.driver_id for driver in alternate.drivers[:3]]
    baseline_oscar = _driver_by_id(baseline.drivers, "oscar-piastri")
    alternate_oscar = _driver_by_id(alternate.drivers, "oscar-piastri")

    assert baseline_podium != alternate_podium or baseline.drivers[0].driver_id != alternate.drivers[0].driver_id
    assert _distribution_distance(baseline_oscar.position_distribution, alternate_oscar.position_distribution) > 0.1


def test_qualifying_weight_changes_the_top_three_distribution():
    service = SimulationService()
    high_qualifying = service.simulate(
        SimulationRequest(
            grand_prix_id="monaco-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            weights=SimulationWeights(qualifying_importance=0.95),
        )
    )
    low_qualifying = service.simulate(
        SimulationRequest(
            grand_prix_id="monaco-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
            weights=SimulationWeights(qualifying_importance=0.2),
        )
    )

    high_top_three = [driver.driver_id for driver in high_qualifying.drivers[:3]]
    low_top_three = [driver.driver_id for driver in low_qualifying.drivers[:3]]

    assert high_top_three != low_top_three


def test_weather_crossover_changes_pit_windows():
    service = SimulationService()
    dry = service.simulate(
        SimulationRequest(
            grand_prix_id="belgian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=100,
        )
    )
    wet = service.simulate(
        SimulationRequest(
            grand_prix_id="belgian-grand-prix",
            weather_preset_id="rain-crossover-threat",
            simulation_runs=100,
            environment=EnvironmentControls(rain_onset=0.75, mixed_conditions=0.85, dry_race=0.2),
        )
    )

    assert dry.event_summary.volatility_index != wet.event_summary.volatility_index
    assert any(
        (driver.average_first_pit_lap or 0) != (wet_driver.average_first_pit_lap or 0)
        for driver, wet_driver in zip(dry.drivers[:5], wet.drivers[:5], strict=False)
    )


def test_spa_weather_swing_is_more_volatile_than_monaco_stable_dry():
    service = SimulationService()
    monaco = service.simulate(
        SimulationRequest(
            grand_prix_id="monaco-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=140,
            environment=EnvironmentControls(
                dry_race=0.96,
                mixed_conditions=0.04,
                rain_onset=0.01,
                track_evolution=0.52,
                temperature_variation=0.22,
                energy_deployment_intensity=0.52,
                crashes=0.05,
                dnfs=0.04,
                yellow_flags=0.08,
                virtual_safety_cars=0.05,
                full_safety_cars=0.06,
                red_flags=0.01,
                late_race_incidents=0.03,
                randomness_intensity=0.18,
            ),
        )
    )
    spa = service.simulate(
        SimulationRequest(
            grand_prix_id="belgian-grand-prix",
            weather_preset_id="rain-crossover-threat",
            simulation_runs=140,
            environment=EnvironmentControls(
                dry_race=0.22,
                mixed_conditions=0.84,
                rain_onset=0.78,
                track_evolution=0.64,
                temperature_variation=0.58,
                energy_deployment_intensity=0.7,
                crashes=0.22,
                dnfs=0.16,
                yellow_flags=0.24,
                virtual_safety_cars=0.2,
                full_safety_cars=0.22,
                red_flags=0.05,
                late_race_incidents=0.18,
                randomness_intensity=0.72,
            ),
        )
    )

    assert spa.event_summary.volatility_index > monaco.event_summary.volatility_index + 0.1
    assert (
        spa.event_summary.circuit_diagnostics.weather_sensitivity_factor
        > monaco.event_summary.circuit_diagnostics.weather_sensitivity_factor + 0.5
    )
    assert spa.event_summary.avg_pit_stops_per_driver > monaco.event_summary.avg_pit_stops_per_driver


def test_baku_and_singapore_show_stronger_disruption_leverage_than_monza():
    service = SimulationService()
    monza = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=140,
        )
    )
    baku = service.simulate(
        SimulationRequest(
            grand_prix_id="azerbaijan-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=140,
        )
    )
    singapore = service.simulate(
        SimulationRequest(
            grand_prix_id="singapore-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=140,
        )
    )

    monza_disruption = monza.event_summary.circuit_diagnostics.disruption_leverage_factor
    baku_disruption = baku.event_summary.circuit_diagnostics.disruption_leverage_factor
    singapore_disruption = singapore.event_summary.circuit_diagnostics.disruption_leverage_factor

    assert baku_disruption > monza_disruption + 0.45
    assert singapore_disruption > monza_disruption + 0.55
    assert (
        baku.event_summary.safety_car_rate + baku.event_summary.vsc_rate
        > monza.event_summary.safety_car_rate + monza.event_summary.vsc_rate
    )
    assert (
        singapore.event_summary.safety_car_rate + singapore.event_summary.vsc_rate
        > monza.event_summary.safety_car_rate + monza.event_summary.vsc_rate
    )


def test_high_deg_singapore_pits_earlier_than_low_deg_monza():
    service = SimulationService()
    monza = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=150,
        )
    )
    singapore = service.simulate(
        SimulationRequest(
            grand_prix_id="singapore-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=150,
        )
    )

    assert singapore.event_summary.circuit_diagnostics.degradation_factor > monza.event_summary.circuit_diagnostics.degradation_factor + 0.4
    assert _avg_first_pit_lap(singapore.drivers) < _avg_first_pit_lap(monza.drivers) - 1.5
    assert singapore.event_summary.avg_pit_stops_per_driver >= monza.event_summary.avg_pit_stops_per_driver


def test_zandvoort_is_order_locked_relative_to_monza():
    service = SimulationService()
    zandvoort = service.simulate(
        SimulationRequest(
            grand_prix_id="dutch-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=140,
        )
    )
    monza = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=140,
        )
    )

    assert (
        zandvoort.event_summary.circuit_diagnostics.order_lock_factor
        > monza.event_summary.circuit_diagnostics.order_lock_factor + 0.7
    )
    assert zandvoort.event_summary.avg_green_flag_overtakes < monza.event_summary.avg_green_flag_overtakes * 0.65
    assert (
        zandvoort.event_summary.circuit_diagnostics.strategy_flex_factor
        < monza.event_summary.circuit_diagnostics.strategy_flex_factor
    )


def test_winner_is_not_pinned_to_one_driver_across_materially_different_scenarios():
    service = SimulationService()
    scenarios = [
        SimulationRequest(grand_prix_id="monaco-grand-prix", weather_preset_id="dry-baseline", simulation_runs=100),
        SimulationRequest(grand_prix_id="italian-grand-prix", weather_preset_id="dry-baseline", simulation_runs=100),
        SimulationRequest(
            grand_prix_id="belgian-grand-prix",
            weather_preset_id="rain-crossover-threat",
            simulation_runs=100,
            environment=EnvironmentControls(rain_onset=0.7, full_safety_cars=0.28, randomness_intensity=0.75),
        ),
    ]
    winners = [service.simulate(request).drivers[0].driver_id for request in scenarios]
    assert len(set(winners)) >= 2
