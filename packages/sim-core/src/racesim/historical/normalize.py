from __future__ import annotations

from collections import defaultdict

from racesim.historical.loaders import load_historical_seed_bundle, load_raw_weekend_extracts, write_normalized_weekend
from racesim.historical.models import (
    HistoricalCoverage,
    HistoricalEntrantResult,
    HistoricalPitStopEvent,
    HistoricalRawWeekendExtract,
    HistoricalSeedBundle,
    HistoricalWeekend,
)


class HistoricalNormalizationError(ValueError):
    pass


def _driver_index(seed_bundle: HistoricalSeedBundle) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for driver in seed_bundle.drivers:
        index[driver.id] = {
            "id": driver.id,
            "code": driver.name.split(" ")[-1][:3].upper(),
            "name": driver.name,
            "team_id": driver.team_id,
            "car_number": driver.car_number,
        }
    manual_codes = {
        "VER": "max-verstappen",
        "PER": "sergio-perez",
        "LEC": "charles-leclerc",
        "SAI": "carlos-sainz",
        "HAM": "lewis-hamilton",
        "RUS": "george-russell",
        "NOR": "lando-norris",
        "PIA": "oscar-piastri",
        "ALO": "fernando-alonso",
        "STR": "lance-stroll",
        "GAS": "pierre-gasly",
        "OCO": "esteban-ocon",
        "ALB": "alexander-albon",
        "COL": "franco-colapinto",
        "RIC": "daniel-ricciardo",
        "TSU": "yuki-tsunoda",
        "HUL": "nico-hulkenberg",
        "MAG": "kevin-magnussen",
        "BOT": "valtteri-bottas",
        "ZHO": "zhou-guanyu",
        "SAR": "logan-sargeant",
        "BEA": "oliver-bearman",
    }
    lookup: dict[str, dict] = {}
    for code, driver_id in manual_codes.items():
        driver = next((item for item in seed_bundle.drivers if item.id == driver_id), None)
        if not driver:
            continue
        lookup[code] = {
            "driver_id": driver.id,
            "driver_name": driver.name,
            "team_id": driver.team_id,
            "car_number": driver.car_number,
        }
        lookup[driver.name.lower()] = lookup[code]
    return lookup


def _team_name_index(seed_bundle: HistoricalSeedBundle) -> dict[str, str]:
    aliases = {
        "red bull racing honda rbpt": "red-bull-racing",
        "red bull racing": "red-bull-racing",
        "ferrari": "ferrari",
        "mercedes": "mercedes",
        "mclaren mercedes": "mclaren",
        "mclaren": "mclaren",
        "aston martin aramco mercedes": "aston-martin",
        "aston martin aramco": "aston-martin",
        "aston martin": "aston-martin",
        "alpine renault": "alpine",
        "alpine": "alpine",
        "williams mercedes": "williams",
        "williams": "williams",
        "visa cash app rb honda rbpt": "racing-bulls",
        "rb honda rbpt": "racing-bulls",
        "racing bulls": "racing-bulls",
        "haas ferrari": "haas",
        "haas": "haas",
        "kick sauber ferrari": "sauber",
        "stake f1 team kick sauber ferrari": "sauber",
        "sauber": "sauber",
    }
    known = {team.id: team.id for team in seed_bundle.teams}
    aliases.update(known)
    return aliases


def normalize_weekend(raw: HistoricalRawWeekendExtract, seed_bundle: HistoricalSeedBundle) -> HistoricalWeekend:
    driver_lookup = _driver_index(seed_bundle)
    team_lookup = _team_name_index(seed_bundle)
    teams_by_id = {team.id: team for team in seed_bundle.teams}
    classification_by_driver: dict[str, HistoricalEntrantResult] = {}
    grid_by_driver: dict[str, int] = {}
    pit_events: list[HistoricalPitStopEvent] = []
    pit_counts: defaultdict[str, int] = defaultdict(int)
    first_stop_laps: defaultdict[str, list[int]] = defaultdict(list)

    for row in raw.grid_rows:
        driver_meta = driver_lookup.get(row.driver_code) or driver_lookup.get(row.driver_name.lower())
        if not driver_meta:
            raise HistoricalNormalizationError(f"Grid row driver '{row.driver_name}' could not be mapped.")
        grid_by_driver[driver_meta["driver_id"]] = row.position

    for stop in raw.pit_stop_rows:
        driver_meta = driver_lookup.get(stop.driver_code) or driver_lookup.get(stop.driver_name.lower())
        if not driver_meta:
            raise HistoricalNormalizationError(f"Pit stop driver '{stop.driver_name}' could not be mapped.")
        team_id = team_lookup.get(stop.team_name.lower(), driver_meta["team_id"])
        pit_events.append(
            HistoricalPitStopEvent(
                driver_id=driver_meta["driver_id"],
                driver_name=driver_meta["driver_name"],
                team_id=team_id,
                lap=stop.lap,
                stop_number=stop.stop_number,
                duration_seconds=stop.duration_seconds,
                compound_out=stop.compound_out,
                compound_in=stop.compound_in,
            )
        )
        pit_counts[driver_meta["driver_id"]] += 1
        first_stop_laps[driver_meta["driver_id"]].append(stop.lap)

    for row in raw.classification_rows:
        driver_meta = driver_lookup.get(row.driver_code) or driver_lookup.get(row.driver_name.lower())
        if not driver_meta:
            raise HistoricalNormalizationError(f"Classification driver '{row.driver_name}' could not be mapped.")
        team_id = team_lookup.get(row.team_name.lower(), driver_meta["team_id"])
        team_name = teams_by_id[team_id].name if team_id in teams_by_id else row.team_name
        finish_position = row.position if row.position and not row.dnf else None
        grid_position = grid_by_driver.get(driver_meta["driver_id"])
        actual_position_change = None
        if grid_position is not None and finish_position is not None:
            actual_position_change = abs(grid_position - finish_position)
        classification_by_driver[driver_meta["driver_id"]] = HistoricalEntrantResult(
            driver_id=driver_meta["driver_id"],
            driver_name=driver_meta["driver_name"],
            team_id=team_id,
            team_name=team_name,
            driver_code=row.driver_code,
            car_number=row.car_number or driver_meta["car_number"],
            qualifying_position=grid_position,
            grid_position=grid_position,
            finish_position=finish_position,
            points=row.points or 0.0,
            laps_completed=row.laps_completed,
            status=row.status,
            classified=not row.dnf,
            dnf=row.dnf,
            pit_stops=pit_counts.get(driver_meta["driver_id"]) or None,
            average_first_stop_lap=(
                round(sum(first_stop_laps[driver_meta["driver_id"]]) / len(first_stop_laps[driver_meta["driver_id"]]), 2)
                if first_stop_laps.get(driver_meta["driver_id"])
                else None
            ),
            average_position_change=actual_position_change,
        )

    entrants = sorted(
        classification_by_driver.values(),
        key=lambda item: (item.finish_position is None, item.finish_position or 999),
    )
    coverage = HistoricalCoverage(
        classification_depth=len(raw.classification_rows),
        grid_depth=len(raw.grid_rows),
        pit_stop_coverage=bool(raw.pit_stop_rows),
        neutralization_coverage=bool(raw.neutralizations),
        weather_coverage=bool(raw.weather_markers),
    )
    return HistoricalWeekend(
        season=raw.season,
        round=raw.round,
        grand_prix_id=raw.grand_prix_id,
        grand_prix_name=raw.grand_prix_name,
        circuit_id=raw.circuit_id,
        circuit_name=raw.circuit_name,
        country=raw.country,
        source_refs=raw.source_refs,
        coverage=coverage,
        entrants=entrants,
        pit_stop_events=pit_events,
        neutralizations=raw.neutralizations,
        weather_markers=raw.weather_markers,
        notes=raw.notes,
    )


def normalize_season(season: int, event_ids: list[str] | None = None) -> list[HistoricalWeekend]:
    seed_bundle = load_historical_seed_bundle(season)
    weekends = [normalize_weekend(raw, seed_bundle) for raw in load_raw_weekend_extracts(season, event_ids)]
    for weekend in weekends:
        write_normalized_weekend(weekend)
    return weekends
