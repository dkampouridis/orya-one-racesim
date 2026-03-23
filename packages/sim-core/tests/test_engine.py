import random

from racesim.api.contracts import EnvironmentControls, SimulationRequest, SimulationWeights
from racesim.data.loaders import get_track, get_weather, load_drivers
from racesim.sim.engine import SimulationService
from racesim.sim.lap_engine import LapRaceEngine
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


def test_monaco_and_monza_do_not_share_the_same_top_three_order():
    service = SimulationService()
    monaco = service.simulate(
        SimulationRequest(
            grand_prix_id="monaco-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
        )
    )
    monza = service.simulate(
        SimulationRequest(
            grand_prix_id="italian-grand-prix",
            weather_preset_id="dry-baseline",
            simulation_runs=120,
        )
    )

    monaco_top_three = [driver.driver_id for driver in monaco.drivers[:3]]
    monza_top_three = [driver.driver_id for driver in monza.drivers[:3]]

    assert monaco_top_three != monza_top_three
    assert monaco.event_summary.avg_green_flag_overtakes < monza.event_summary.avg_green_flag_overtakes


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
    assert (
        stable_winner.driver_id != chaos_winner.driver_id
        or abs(stable_winner.win_probability - chaos_winner.win_probability) >= 0.08
    )


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
