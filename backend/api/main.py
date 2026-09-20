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
from backend.scheduling.priority import aging_function, calculate_deterioration_risk

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

# Global Cached Generator & Runner pointing to the working dataset
DATA_PATH = "data/real/working_with_age_gender.csv"
if not os.path.exists(DATA_PATH):
    DATA_PATH = "data/real/healthcare_analytics_patient_flow_data.csv"

generator = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)
predictor = TreatmentDurationPredictor(random_state=42)
runner = ExperimentRunner(data_path=DATA_PATH, seed=42)

# Default baseline capacities
BASELINE_CAPACITIES = {
    "regular_beds": 120,
    "icu_beds": 20,
    "doctors": 35,
    "nurses": 80,
    "operating_rooms": 6,
    "ambulances": 6
}

# Request Models
class SimulationRequest(BaseModel):
    n_patients: int = Field(default=300, ge=10, le=2000)
    scenario: str = Field(default="Normal Baseline")       # Normal Baseline, Emergency Surge, etc.
    policy: str = Field(default="MEDFLOW")                # FCFS, URGENCY, DYNAMIC, MEDFLOW
    use_ml_duration: bool = True
    custom_capacities: Optional[Dict[str, int]] = None
    arrival_rate_multiplier: Optional[float] = None

class SameSeedCompareRequest(BaseModel):
    n_patients: int = Field(default=300, ge=10, le=2000)
    scenario: str = Field(default="Normal Baseline")
    capacities: Optional[Dict[str, int]] = None
    arrival_rate_multiplier: Optional[float] = None
    seed: int = 42

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
            "baseline_capacities": BASELINE_CAPACITIES
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Global Cached State
last_simulated_patients: Dict[str, Any] = {}

@app.get("/api/ml-metrics")
def get_ml_metrics():
    """Returns training evaluation metrics for the ML duration predictor."""
    patients = generator.generate_patients(n_patients=500)
    metrics = predictor.train(patients)
    
    # Extract dynamic feature importances from trained RandomForestRegressor model
    importances = predictor.model.feature_importances_
    feat_imp = [
        {"feature": name, "importance": round(float(imp), 4)}
        for name, imp in sorted(zip(predictor.feature_names, importances), key=lambda x: x[1], reverse=True)
    ]
    
    return {
        "model": "RandomForestRegressor(n_estimators=100)",
        "features": predictor.feature_names,
        "target": "true_duration (ground-truth stay mins)",
        "metrics": metrics,
        "feature_importances": feat_imp,
        "disclaimer": "Trained on synthetic ground truth because public dataset omits inpatient duration labels."
    }

@app.post("/api/simulate")
def run_simulation(req: SimulationRequest):
    """Executes a single simulation run for specified parameters."""
    global last_simulated_patients
    scenarios = runner.define_scenarios()
    
    if req.scenario in scenarios:
        sc_cfg = scenarios[req.scenario]
        mult = req.arrival_rate_multiplier or sc_cfg["arrival_rate_multiplier"]
        caps = req.custom_capacities or sc_cfg["capacities"]
    else:
        mult = req.arrival_rate_multiplier or 2.5
        caps = req.custom_capacities or BASELINE_CAPACITIES

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
    
    # Cache all patients and sort cleanly by sequential Patient ID
    all_patients = sorted(
        engine.discharged_patients + engine.active_patients + engine.waiting_queue,
        key=lambda p: int(p.patient_id.split("-")[1]) if "-" in p.patient_id else 0
    )
    last_simulated_patients = {p.patient_id: p for p in all_patients}
    patient_queue_sample = [p.to_dict() for p in all_patients[:100]]

    return {
        "scenario": req.scenario,
        "policy": req.policy,
        "kpis": kpis,
        "patient_sample": patient_queue_sample
    }

@app.post("/api/custom-simulate")
def run_custom_simulation(req: SimulationRequest):
    """Alias endpoint for custom parameter simulation runs."""
    return run_simulation(req)

@app.post("/api/same-seed-compare")
def same_seed_compare(req: SameSeedCompareRequest):
    """Runs all 4 policies on identical patient arrivals (same seed) for direct benchmark comparison."""
    scenarios = runner.define_scenarios()
    if req.scenario in scenarios:
        sc_cfg = scenarios[req.scenario]
        mult = req.arrival_rate_multiplier or sc_cfg["arrival_rate_multiplier"]
        caps = req.capacities or sc_cfg["capacities"]
    else:
        mult = req.arrival_rate_multiplier or 2.5
        caps = req.capacities or BASELINE_CAPACITIES

    policies = ["FCFS", "URGENCY", "DYNAMIC", "MEDFLOW"]
    comparison = {}

    for pol in policies:
        p_gen = SyntheticPatientGenerator(data_path=DATA_PATH, seed=req.seed)
        patients = p_gen.generate_patients(n_patients=req.n_patients, arrival_rate_multiplier=mult)
        patients = predictor.predict_and_attach(patients)
        
        eng = SimulationEngine(
            patients=patients,
            resource_capacities=caps,
            policy=pol,
            use_predicted_duration=True
        )
        kpis = eng.run()
        comparison[pol] = kpis

    return {
        "scenario": req.scenario,
        "seed": req.seed,
        "comparison": comparison
    }

@app.get("/api/priority-breakdown/{patient_id}")
def get_priority_breakdown(patient_id: str, current_time: float = 60.0):
    """Calculates granular 3-component dynamic priority breakdown for a specific patient."""
    target_patient = last_simulated_patients.get(patient_id)
    
    if not target_patient:
        patients = generator.generate_patients(n_patients=100)
        for p in patients:
            if p.patient_id == patient_id:
                target_patient = p
                break
        if not target_patient:
            target_patient = patients[0]
            target_patient.patient_id = patient_id

    u_norm = target_patient.urgency / 5.0
    wu_Ui = round(0.5 * u_norm, 3)
    
    wait_time = max(0.0, current_time - target_patient.arrival_time)
    aging_val = aging_function(wait_time, 0.01)
    wa_AWi = round(0.3 * aging_val, 3)
    
    det_risk = calculate_deterioration_risk(target_patient)
    wd_Di = round(0.2 * det_risk, 3)
    
    total_priority = round(wu_Ui + wa_AWi + wd_Di, 3)
    
    if target_patient.urgency >= 4:
        reason = f"High clinical urgency (Tier {target_patient.urgency}) requiring immediate intervention."
    elif wait_time > 45.0:
        reason = f"Extended waiting time ({wait_time:.1f} mins) triggering exponential aging boost."
    elif det_risk > 0.6:
        reason = f"High deterioration risk profile based on age ({target_patient.age}) and clinical complexity."
    else:
        reason = f"Balanced dynamic priority (Tier {target_patient.urgency}, wait {wait_time:.1f}m)."

    return {
        "patient_id": target_patient.patient_id,
        "current_time": current_time,
        "wait_time_mins": round(wait_time, 1),
        "urgency_tier": target_patient.urgency,
        "wu_Ui": wu_Ui,
        "wa_AWi": wa_AWi,
        "wd_Di": wd_Di,
        "total_priority": total_priority,
        "reason_for_priority": reason,
        "patient_details": target_patient.to_dict()
    }

@app.post("/api/experiments")
def run_full_experiments(req: ExperimentRequest):
    """Executes controlled scenario experiments across scenarios and policies."""
    exp_output = runner.run_experiments(n_patients=req.n_patients)
    return exp_output

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
