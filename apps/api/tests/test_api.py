import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["simulation_engine"] == "lap-by-lap"


def test_simulation_endpoint():
    response = client.post(
        "/api/simulate",
        json={
            "grand_prix_id": "belgian-grand-prix",
            "weather_preset_id": "mixed-front",
            "simulation_runs": 50,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["grand_prix_id"] == "belgian-grand-prix"
    assert payload["scenario"]["simulation_engine"] == "lap-by-lap"
    assert len(payload["drivers"]) == 22
    assert "confidence_note" in payload["scenario"]
    assert "impact_summary" in payload["event_summary"]
    assert "expected_points" in payload["drivers"][0]
    assert "diagnostics" in payload["drivers"][0]
    assert "expected_stop_count" in payload["drivers"][0]
    assert "avg_pit_stops_per_driver" in payload["event_summary"]


def test_invalid_grand_prix_returns_404():
    response = client.post(
        "/api/strategy-suggestions",
        json={
            "grand_prix_id": "unknown-gp",
            "weather_preset_id": "dry-baseline",
        },
    )
    assert response.status_code == 404
