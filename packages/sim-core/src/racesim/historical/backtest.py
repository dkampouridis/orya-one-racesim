from __future__ import annotations

from racesim.api.contracts import EnvironmentControls, SimulationRequest
from racesim.data.loaders import get_track, get_weather
from racesim.historical.loaders import load_historical_seed_bundle, load_normalized_weekends
from racesim.historical.metrics import aggregate_backtest_results, compute_weekend_metrics
from racesim.historical.models import BacktestAggregateReport, BacktestWeekendResult, HistoricalSeedBundle, HistoricalWeekend
from racesim.sim.engine import SimulationService


class HistoricalBacktester:
    def __init__(self) -> None:
        self.service = SimulationService()

    def run_weekend(
        self,
        weekend: HistoricalWeekend,
        seed_bundle: HistoricalSeedBundle,
        simulation_runs: int = 250,
    ) -> BacktestWeekendResult:
        track = get_track(weekend.grand_prix_id)
        weather = get_weather(self._weather_preset_id(weekend))
        environment = self._environment_for_weekend(weekend, weather.id)
        forced_grid_positions = {
            entrant.driver_id: entrant.grid_position
            for entrant in weekend.entrants
            if entrant.grid_position is not None
        }
        drivers = [driver for driver in seed_bundle.drivers if any(driver.id == entrant.driver_id for entrant in weekend.entrants)]
        teams_by_id = {team.id: team for team in seed_bundle.teams}
        request = SimulationRequest(
            grand_prix_id=track.id,
            weather_preset_id=weather.id,
            simulation_runs=simulation_runs,
            forced_grid_positions=forced_grid_positions,
            environment=environment,
        )
        simulation = self.service.simulate_custom_context(
            request=request,
            drivers=drivers,
            teams_by_id=teams_by_id,
            track=track,
            weather=weather,
        )
        metrics = compute_weekend_metrics(weekend, simulation)
        return BacktestWeekendResult(
            season=weekend.season,
            grand_prix_id=weekend.grand_prix_id,
            grand_prix_name=weekend.grand_prix_name,
            metrics=metrics,
            simulation=simulation,
            actual_weekend=weekend,
        )

    def run_season(
        self,
        season: int,
        event_ids: list[str] | None = None,
        simulation_runs: int = 250,
    ) -> BacktestAggregateReport:
        seed_bundle = load_historical_seed_bundle(season)
        weekends = load_normalized_weekends(season, event_ids)
        results = [self.run_weekend(weekend, seed_bundle, simulation_runs=simulation_runs) for weekend in weekends]
        return aggregate_backtest_results(season=season, weekends=results)

    def _weather_preset_id(self, weekend: HistoricalWeekend) -> str:
        conditions = {marker.condition for marker in weekend.weather_markers}
        if "wet" in conditions or "intermediate" in conditions or "mixed" in conditions:
            return "rain-crossover-threat"
        return "dry-baseline"

    def _environment_for_weekend(self, weekend: HistoricalWeekend, weather_preset_id: str) -> EnvironmentControls:
        controls = EnvironmentControls()
        neutralizations = weekend.neutralizations
        if weekend.weather_markers and weather_preset_id == "rain-crossover-threat":
            controls.mixed_conditions = max(controls.mixed_conditions, 0.7)
            controls.rain_onset = max(controls.rain_onset, 0.55)
            controls.randomness_intensity = max(controls.randomness_intensity, 0.62)
        if neutralizations:
            controls.full_safety_cars = max(controls.full_safety_cars, 0.18 + len(neutralizations) * 0.05)
            controls.virtual_safety_cars = max(
                controls.virtual_safety_cars,
                0.14 + sum(1 for window in neutralizations if window.kind == "VSC") * 0.06,
            )
            controls.red_flags = max(controls.red_flags, 0.06 if any(window.kind == "RED_FLAG" for window in neutralizations) else controls.red_flags)
        dnf_rate = sum(1 for entrant in weekend.entrants if entrant.dnf) / max(1, len(weekend.entrants))
        controls.dnfs = max(controls.dnfs, round(dnf_rate, 2))
        return controls
