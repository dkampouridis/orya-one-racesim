from __future__ import annotations

import argparse
from pathlib import Path

from racesim.historical.backtest import HistoricalBacktester
from racesim.historical.loaders import write_backtest_report
from racesim.historical.normalize import normalize_season
from racesim.historical.reporting import build_markdown_report
from racesim.paths import historical_reports_root


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Historical FIA / Formula 1 ingestion and backtesting workflow")
    subparsers = parser.add_subparsers(dest="command", required=True)

    normalize = subparsers.add_parser("normalize", help="Validate raw official extracts and export normalized weekends")
    normalize.add_argument("--season", type=int, required=True)
    normalize.add_argument("--events", nargs="*", default=None)

    backtest = subparsers.add_parser("backtest", help="Run the simulator against normalized historical weekends")
    backtest.add_argument("--season", type=int, required=True)
    backtest.add_argument("--events", nargs="*", default=None)
    backtest.add_argument("--runs", type=int, default=250)
    backtest.add_argument("--suffix", type=str, default="latest")

    report = subparsers.add_parser("report", help="Generate a markdown backtest report")
    report.add_argument("--season", type=int, required=True)
    report.add_argument("--events", nargs="*", default=None)
    report.add_argument("--runs", type=int, default=250)
    report.add_argument("--suffix", type=str, default="latest")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if args.command == "normalize":
        weekends = normalize_season(args.season, args.events)
        print(f"normalized {len(weekends)} historical weekends for {args.season}")
        return

    backtester = HistoricalBacktester()
    report = backtester.run_season(args.season, args.events, simulation_runs=args.runs)
    json_path = write_backtest_report(report, suffix=args.suffix)
    print(f"wrote JSON backtest report to {json_path}")
    if args.command == "report":
        markdown_path = historical_reports_root() / f"{args.season}-backtest-{args.suffix}.md"
        markdown_path.write_text(build_markdown_report(report))
        print(f"wrote Markdown backtest report to {markdown_path}")


if __name__ == "__main__":
    main()
