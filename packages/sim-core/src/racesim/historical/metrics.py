from __future__ import annotations

from statistics import mean

from racesim.api.contracts import DriverResult, SimulationResponse
from racesim.historical.models import (
    AggregateBacktestMetrics,
    BacktestAggregateReport,
    BacktestWeekendMetrics,
    BacktestWeekendResult,
    CalibrationHint,
    HistoricalWeekend,
)


def _driver_map(drivers: list[DriverResult]) -> dict[str, DriverResult]:
    return {driver.driver_id: driver for driver in drivers}


def _actual_sorted_ids(weekend: HistoricalWeekend, limit: int | None = None) -> list[str]:
    entrants = [entrant for entrant in weekend.entrants if entrant.finish_position is not None]
    entrants.sort(key=lambda item: item.finish_position or 999)
    ids = [entrant.driver_id for entrant in entrants]
    return ids[:limit] if limit else ids


def compute_weekend_metrics(weekend: HistoricalWeekend, simulation: SimulationResponse) -> BacktestWeekendMetrics:
    predicted = _driver_map(simulation.drivers)
    actual_order = _actual_sorted_ids(weekend)
    covered = [entrant for entrant in weekend.entrants if entrant.driver_id in predicted and entrant.finish_position is not None]
    predicted_top3 = [driver.driver_id for driver in simulation.drivers[:3]]
    predicted_top10 = [driver.driver_id for driver in simulation.drivers[:10]]
    actual_top3 = set(actual_order[:3])
    actual_top10 = set(actual_order[:10])
    actual_winner = actual_order[0]
    actual_winner_probability = predicted[actual_winner].win_probability
    finish_errors = [
        abs(predicted[entrant.driver_id].expected_finish_position - entrant.finish_position)
        for entrant in covered
    ]
    conversion_errors = [
        abs(
            predicted[entrant.driver_id].net_position_delta
            - ((entrant.grid_position or entrant.finish_position) - (entrant.finish_position or entrant.grid_position or 0))
        )
        for entrant in covered
        if entrant.grid_position is not None and entrant.finish_position is not None
    ]
    stop_errors = [
        abs(predicted[entrant.driver_id].expected_stop_count - entrant.pit_stops)
        for entrant in covered
        if entrant.pit_stops is not None
    ]
    first_stop_errors = [
        abs((predicted[entrant.driver_id].average_first_pit_lap or 0.0) - entrant.average_first_stop_lap)
        for entrant in covered
        if entrant.average_first_stop_lap is not None and predicted[entrant.driver_id].average_first_pit_lap is not None
    ]
    dnf_brier_terms = [
        (predicted[entrant.driver_id].dnf_probability - (1.0 if entrant.dnf else 0.0)) ** 2
        for entrant in weekend.entrants
        if entrant.driver_id in predicted
    ]
    actual_avg_position_change = mean(
        [entrant.average_position_change or 0.0 for entrant in covered if entrant.average_position_change is not None] or [0.0]
    )
    simulated_avg_position_change = simulation.event_summary.movement_summary.avg_position_changes_per_driver
    volatility_proxy_error = abs(simulated_avg_position_change - actual_avg_position_change)
    normalized_components = [
        mean(finish_errors) / 10.0 if finish_errors else 0.0,
        mean(conversion_errors) / 10.0 if conversion_errors else 0.0,
        (mean(stop_errors) / 3.0) if stop_errors else 0.0,
        volatility_proxy_error / 10.0,
    ]
    track_behavior_error = mean(normalized_components)
    return BacktestWeekendMetrics(
        covered_driver_count=len(covered),
        winner_hit=1.0 if simulation.drivers[0].driver_id == actual_winner else 0.0,
        actual_winner_probability=round(actual_winner_probability, 4),
        podium_overlap_rate=round(len(set(predicted_top3) & actual_top3) / 3.0, 4),
        top_10_overlap_rate=round(len(set(predicted_top10) & actual_top10) / max(1, len(actual_top10)), 4),
        mean_abs_finish_error=round(mean(finish_errors), 4) if finish_errors else 0.0,
        qualifying_conversion_mae=round(mean(conversion_errors), 4) if conversion_errors else 0.0,
        stop_count_mae=round(mean(stop_errors), 4) if stop_errors else None,
        first_stop_mae=round(mean(first_stop_errors), 4) if first_stop_errors else None,
        dnf_brier=round(mean(dnf_brier_terms), 4) if dnf_brier_terms else 0.0,
        actual_avg_position_change=round(actual_avg_position_change, 4),
        simulated_avg_position_change=round(simulated_avg_position_change, 4),
        volatility_proxy_error=round(volatility_proxy_error, 4),
        track_behavior_error=round(track_behavior_error, 4),
    )


def _average_optional(values: list[float | None]) -> float | None:
    material = [value for value in values if value is not None]
    if not material:
        return None
    return round(mean(material), 4)


def aggregate_backtest_results(season: int, weekends: list[BacktestWeekendResult]) -> BacktestAggregateReport:
    aggregate = AggregateBacktestMetrics(
        weekends=len(weekends),
        winner_hit_rate=round(mean(result.metrics.winner_hit for result in weekends), 4),
        avg_actual_winner_probability=round(mean(result.metrics.actual_winner_probability for result in weekends), 4),
        avg_podium_overlap_rate=round(mean(result.metrics.podium_overlap_rate for result in weekends), 4),
        avg_top_10_overlap_rate=round(mean(result.metrics.top_10_overlap_rate for result in weekends), 4),
        avg_finish_mae=round(mean(result.metrics.mean_abs_finish_error for result in weekends), 4),
        avg_qualifying_conversion_mae=round(mean(result.metrics.qualifying_conversion_mae for result in weekends), 4),
        avg_stop_count_mae=_average_optional([result.metrics.stop_count_mae for result in weekends]),
        avg_first_stop_mae=_average_optional([result.metrics.first_stop_mae for result in weekends]),
        avg_dnf_brier=round(mean(result.metrics.dnf_brier for result in weekends), 4),
        avg_volatility_proxy_error=round(mean(result.metrics.volatility_proxy_error for result in weekends), 4),
        avg_track_behavior_error=round(mean(result.metrics.track_behavior_error for result in weekends), 4),
    )
    hints: list[CalibrationHint] = []
    if aggregate.avg_finish_mae > 2.5:
        hints.append(
            CalibrationHint(
                area="pace priors",
                message="Expected finish error remains elevated. Revisit driver/team base pace priors before deeper event tuning.",
            )
        )
    if aggregate.avg_qualifying_conversion_mae > 2.0:
        hints.append(
            CalibrationHint(
                area="track position",
                message="Grid-to-race conversion is drifting. Track-position, recovery, and overtaking suppression likely need more calibration.",
            )
        )
    if aggregate.avg_stop_count_mae is not None and aggregate.avg_stop_count_mae > 0.8:
        hints.append(
            CalibrationHint(
                area="strategy timing",
                message="Stop-count error is still high. Tune degradation, undercut value, and adaptive pit timing together.",
            )
        )
    if aggregate.avg_volatility_proxy_error > 2.0:
        hints.append(
            CalibrationHint(
                area="race volatility",
                message="Race movement is miscalibrated relative to history. Revisit overtaking sensitivity, restart leverage, and traffic penalties.",
            )
        )
    return BacktestAggregateReport(
        season=season,
        aggregate=aggregate,
        weekends=weekends,
        calibration_hints=hints,
    )
