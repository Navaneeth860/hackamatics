import os
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.utils.data_loader import load_and_clean_dataset
from backend.models.patient_generator import SyntheticPatientGenerator
from backend.ml.duration_model import TreatmentDurationPredictor
from backend.simulation.engine import SimulationEngine
from backend.simulation.experiments import ExperimentRunner

app = FastAPI(
    title="MEDFLOW API",
    description="Mathematical Inpatient Hospital Resource Simulation & Scheduling Framework",
    version="1.0.0"
)

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Cached Generator & Runner
DATA_PATH = "data/real/healthcare_analytics_patient_flow_data.csv"
generator = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)
predictor = TreatmentDurationPredictor(random_state=42)
runner = ExperimentRunner(data_path=DATA_PATH, seed=42)

# Request Models
class SimulationRequest(BaseModel):
    n_patients: int = Field(default=300, ge=10, le=2000)
    scenario: str = Field(default="Normal")       # Normal, Patient Surge, ICU Shortage
    policy: str = Field(default="MEDFLOW")        # FCFS, URGENCY, DYNAMIC, MEDFLOW
    use_ml_duration: bool = True
    custom_capacities: Optional[Dict[str, int]] = None
    arrival_rate_multiplier: Optional[float] = None

class ExperimentRequest(BaseModel):
    n_patients: int = Field(default=300, ge=10, le=1000)
    seed: int = 42

@app.get("/api/status")
def get_system_status():
    """Returns dataset stats and baseline hospital capacity specifications."""
    try:
        _, stats = load_and_clean_dataset(DATA_PATH)
        return {
            "status": "ONLINE",
            "project": "MEDFLOW Inpatient Operations Simulator",
            "dataset_stats": stats,
            "baseline_capacities": {
                "regular_beds": 200,
                "icu_beds": 35,
                "doctors": 60,
                "nurses": 150,
                "operating_rooms": 10,
                "ambulances": 10
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml-metrics")
def get_ml_metrics():
    """Returns training evaluation metrics for the ML duration predictor."""
    patients = generator.generate_patients(n_patients=500)
    metrics = predictor.train(patients)
    return {
        "model": "RandomForestRegressor(n_estimators=100)",
        "features": ["age", "urgency", "is_admission_track", "icu_required", "or_required", "department"],
        "target": "true_duration (ground-truth stay mins)",
        "metrics": metrics,
        "disclaimer": "Trained on synthetic ground truth because public dataset omits inpatient duration labels."
    }

@app.post("/api/simulate")
def run_simulation(req: SimulationRequest):
    """Executes a single simulation run for specified parameters."""
    scenarios = runner.define_scenarios()
    
    if req.scenario in scenarios:
        sc_cfg = scenarios[req.scenario]
        mult = req.arrival_rate_multiplier or sc_cfg["arrival_rate_multiplier"]
        caps = req.custom_capacities or sc_cfg["capacities"]
    else:
        mult = req.arrival_rate_multiplier or 1.0
        caps = req.custom_capacities or {
            "regular_beds": 200, "icu_beds": 35, "doctors": 60,
            "nurses": 150, "operating_rooms": 10, "ambulances": 10
        }

    patients = generator.generate_patients(n_patients=req.n_patients, arrival_rate_multiplier=mult)
    if req.use_ml_duration:
        patients = predictor.predict_and_attach(patients)

    engine = SimulationEngine(
        patients=patients,
        resource_capacities=caps,
        policy=req.policy,
        use_predicted_duration=req.use_ml_duration
    )
    kpis = engine.run()
    
    # Extract queue sample (first 30 patients)
    all_patients = engine.discharged_patients + engine.active_patients + engine.waiting_queue
    patient_queue_sample = [p.to_dict() for p in all_patients[:30]]

    return {
        "scenario": req.scenario,
        "policy": req.policy,
        "kpis": kpis,
        "patient_sample": patient_queue_sample
    }

@app.post("/api/experiments")
def run_full_experiments(req: ExperimentRequest):
    """Executes controlled scenario experiments across 3 scenarios and 4 policies."""
    exp_output = runner.run_experiments(n_patients=req.n_patients)
    return exp_output

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

