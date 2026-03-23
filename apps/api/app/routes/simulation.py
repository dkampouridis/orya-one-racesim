from fastapi import APIRouter

from racesim.api.contracts import SimulationRequest, SimulationResponse, StrategySuggestion, StrategySuggestionRequest
from racesim.sim.engine import SimulationService

router = APIRouter()
service = SimulationService()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "orya-one-racesim-api",
        "simulation_engine": "lap-by-lap",
    }


@router.get("/defaults")
def defaults():
    return service.defaults()


@router.post("/strategy-suggestions", response_model=list[StrategySuggestion])
def strategy_suggestions(request: StrategySuggestionRequest):
    return service.strategy_suggestions(request)


@router.post("/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest):
    return service.simulate(request)
