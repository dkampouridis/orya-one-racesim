from __future__ import annotations

import json
from pathlib import Path

from racesim.historical.models import (
    BacktestAggregateReport,
    HistoricalRawWeekendExtract,
    HistoricalSeedBundle,
    HistoricalWeekend,
)
from racesim.paths import historical_catalog_root, historical_normalized_root, historical_raw_root, historical_reports_root


def _load_json(path: Path):
    return json.loads(path.read_text())


def load_historical_seed_bundle(season: int) -> HistoricalSeedBundle:
    path = historical_catalog_root() / f"{season}_seed_bundle.json"
    return HistoricalSeedBundle.model_validate(_load_json(path))


def load_raw_weekend_extracts(season: int, event_ids: list[str] | None = None) -> list[HistoricalRawWeekendExtract]:
    root = historical_raw_root() / "formula1"
    files = sorted(root.glob(f"{season}-*.json"))
    if event_ids:
        allowed = set(event_ids)
        files = [path for path in files if path.stem.split("-", 1)[1] in allowed]
    return [HistoricalRawWeekendExtract.model_validate(_load_json(path)) for path in files]


def load_normalized_weekends(season: int, event_ids: list[str] | None = None) -> list[HistoricalWeekend]:
    root = historical_normalized_root()
    files = sorted(root.glob(f"{season}-*.json"))
    if event_ids:
        allowed = set(event_ids)
        files = [path for path in files if path.stem.split("-", 1)[1] in allowed]
    return [HistoricalWeekend.model_validate(_load_json(path)) for path in files]


def write_normalized_weekend(weekend: HistoricalWeekend) -> Path:
    path = historical_normalized_root() / f"{weekend.season}-{weekend.grand_prix_id}.json"
    path.write_text(json.dumps(weekend.model_dump(mode="json"), indent=2) + "\n")
    return path


def write_backtest_report(report: BacktestAggregateReport, suffix: str = "latest") -> Path:
    path = historical_reports_root() / f"{report.season}-backtest-{suffix}.json"
    path.write_text(json.dumps(report.model_dump(mode="json"), indent=2) + "\n")
    return path
