from racesim.historical.backtest import HistoricalBacktester
from racesim.historical.loaders import load_normalized_weekends
from racesim.historical.normalize import normalize_season
from racesim.historical.reporting import build_markdown_report


def test_historical_normalization_exports_weekends():
    weekends = normalize_season(2024)
    assert len(weekends) == 6
    monaco = next(weekend for weekend in weekends if weekend.grand_prix_id == "monaco-grand-prix")
    assert monaco.coverage.classification_depth == 10
    assert monaco.coverage.pit_stop_coverage is True
    leclerc = next(entrant for entrant in monaco.entrants if entrant.driver_id == "charles-leclerc")
    assert leclerc.finish_position == 1
    assert leclerc.grid_position == 1
    assert leclerc.average_first_stop_lap == 1.0


def test_historical_backtester_produces_metrics_and_report():
    normalize_season(2024)
    backtester = HistoricalBacktester()
    report = backtester.run_season(
        2024,
        event_ids=["monaco-grand-prix", "italian-grand-prix"],
        simulation_runs=60,
    )

    assert report.aggregate.weekends == 2
    assert 0.0 <= report.aggregate.winner_hit_rate <= 1.0
    assert report.aggregate.avg_finish_mae >= 0.0
    assert report.aggregate.avg_track_behavior_error >= 0.0
    assert report.weekends[0].simulation.scenario.simulation_engine == "lap-by-lap"
    assert report.weekends[0].actual_weekend.source_refs

    markdown = build_markdown_report(report)
    assert "# 2024 Historical Backtest Report" in markdown
    assert "Monaco Grand Prix" in markdown or "Italian Grand Prix" in markdown


def test_normalized_loader_reads_exported_weekends():
    normalize_season(2024, ["british-grand-prix"])
    weekends = load_normalized_weekends(2024, ["british-grand-prix"])
    assert len(weekends) == 1
    british = weekends[0]
    assert british.grand_prix_name == "British Grand Prix"
    assert british.weather_markers
