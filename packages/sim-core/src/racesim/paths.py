from pathlib import Path


def repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "data").exists() and (parent / "apps").exists():
            return parent
    raise FileNotFoundError("Could not locate repository root containing data/ and apps/")


def data_root() -> Path:
    return repo_root() / "data"


def historical_root() -> Path:
    return data_root() / "historical"


def historical_raw_root() -> Path:
    return historical_root() / "raw"


def historical_normalized_root() -> Path:
    return historical_root() / "normalized"


def historical_catalog_root() -> Path:
    return historical_root() / "catalog"


def historical_reports_root() -> Path:
    return historical_root() / "reports"
