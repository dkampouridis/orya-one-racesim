from __future__ import annotations

from racesim.historical.models import BacktestAggregateReport


def build_markdown_report(report: BacktestAggregateReport) -> str:
    lines = [
        f"# {report.season} Historical Backtest Report",
        "",
        "## Aggregate",
        "",
        f"- Weekends: `{report.aggregate.weekends}`",
        f"- Winner hit rate: `{report.aggregate.winner_hit_rate:.2%}`",
        f"- Actual winner average probability: `{report.aggregate.avg_actual_winner_probability:.2%}`",
        f"- Podium overlap: `{report.aggregate.avg_podium_overlap_rate:.2%}`",
        f"- Top-10 overlap: `{report.aggregate.avg_top_10_overlap_rate:.2%}`",
        f"- Finish MAE: `{report.aggregate.avg_finish_mae:.2f}`",
        f"- Qualifying conversion MAE: `{report.aggregate.avg_qualifying_conversion_mae:.2f}`",
    ]
    if report.aggregate.avg_stop_count_mae is not None:
        lines.append(f"- Stop-count MAE: `{report.aggregate.avg_stop_count_mae:.2f}`")
    if report.aggregate.avg_first_stop_mae is not None:
        lines.append(f"- First-stop MAE: `{report.aggregate.avg_first_stop_mae:.2f}`")
    lines.extend(
        [
            f"- DNF Brier: `{report.aggregate.avg_dnf_brier:.4f}`",
            f"- Volatility proxy error: `{report.aggregate.avg_volatility_proxy_error:.2f}`",
            f"- Track-behavior error: `{report.aggregate.avg_track_behavior_error:.2f}`",
            "",
            "## Calibration hints",
            "",
        ]
    )
    if report.calibration_hints:
        lines.extend(f"- **{hint.area}**: {hint.message}" for hint in report.calibration_hints)
    else:
        lines.append("- No major heuristics triggered.")
    lines.extend(["", "## Weekend detail", ""])
    for weekend in report.weekends:
        lines.extend(
            [
                f"### {weekend.actual_weekend.grand_prix_name}",
                "",
                f"- Winner hit: `{weekend.metrics.winner_hit:.0f}`",
                f"- Actual winner probability: `{weekend.metrics.actual_winner_probability:.2%}`",
                f"- Podium overlap: `{weekend.metrics.podium_overlap_rate:.2%}`",
                f"- Finish MAE: `{weekend.metrics.mean_abs_finish_error:.2f}`",
                f"- Qualifying conversion MAE: `{weekend.metrics.qualifying_conversion_mae:.2f}`",
                f"- Simulated avg position change: `{weekend.metrics.simulated_avg_position_change:.2f}`",
                f"- Actual avg position change: `{weekend.metrics.actual_avg_position_change:.2f}`",
                "",
            ]
        )
    return "\n".join(lines) + "\n"
