import copy
import os
from typing import Dict, List, Any
from backend.models.patient_generator import SyntheticPatientGenerator
from backend.ml.duration_model import TreatmentDurationPredictor
from backend.simulation.engine import SimulationEngine

class ExperimentRunner:
    """
    Executes controlled mathematical experiments across scheduling policies and operational scenarios.
    Strictly enforces experimental control: Identical patient streams, seeds, and durations across policy runs.
    """

    def __init__(self, data_path: str = "data/real/working_with_age_gender.csv", seed: int = 42):
        if not os.path.exists(data_path):
            data_path = "data/real/healthcare_analytics_patient_flow_data.csv"
        self.data_path = data_path
        self.seed = seed
        self.generator = SyntheticPatientGenerator(data_path=data_path, seed=seed)
        self.predictor = TreatmentDurationPredictor(random_state=seed)

    def define_scenarios(self) -> Dict[str, Dict[str, Any]]:
        """Defines operational hospital scenarios for policy comparison."""
        base_caps = {
            "regular_beds": 120,
            "icu_beds": 20,
            "doctors": 35,
            "nurses": 80,
            "operating_rooms": 6,
            "ambulances": 6
        }
        scenarios = {
            "Normal Baseline": {
                "description": "Baseline operational capacity under steady-state patient demand",
                "arrival_rate_multiplier": 2.5,
                "capacities": base_caps
            },
            "Emergency Surge": {
                "description": "Emergency surge: 5.0x arrival rate multiplier creating severe bed & staff competition",
                "arrival_rate_multiplier": 5.0,
                "capacities": base_caps
            },
            "Staff Shortage": {
                "description": "Severe staff deficit (-50% MD/RN capacity) creating provider bottlenecks",
                "arrival_rate_multiplier": 2.5,
                "capacities": {**base_caps, "doctors": 17, "nurses": 40}
            },
            "ICU Constraint": {
                "description": "Critical ICU bottleneck: ICU bed capacity reduced from 20 down to 4 beds",
                "arrival_rate_multiplier": 2.5,
                "capacities": {**base_caps, "icu_beds": 4}
            },
            "Resource Failure": {
                "description": "Multi-resource critical deficit: reduced beds, ICU, doctors, nurses",
                "arrival_rate_multiplier": 4.0,
                "capacities": {
                    "regular_beds": 60,
                    "icu_beds": 5,
                    "doctors": 15,
                    "nurses": 30,
                    "operating_rooms": 2,
                    "ambulances": 2
                }
            }
        }
        # Add legacy aliases
        scenarios["Normal"] = scenarios["Normal Baseline"]
        scenarios["Patient Surge"] = scenarios["Emergency Surge"]
        scenarios["ICU Shortage"] = scenarios["ICU Constraint"]
        return scenarios

    def run_experiments(
        self,
        n_patients: int = 300,
        policies: List[str] = ["FCFS", "URGENCY", "DYNAMIC", "MEDFLOW"],
        use_ml_duration: bool = True
    ) -> Dict[str, Any]:
        """
        Executes grid of Scenarios x 4 Policies on identical resampled patient streams.
        """
        scenarios = self.define_scenarios()
        results: Dict[str, Dict[str, Any]] = {}

        # 1. Train ML model on baseline stream
        base_patients = self.generator.generate_patients(n_patients=n_patients, arrival_rate_multiplier=1.0)
        ml_metrics = self.predictor.train(base_patients)

        primary_scenarios = ["Normal Baseline", "Emergency Surge", "Staff Shortage", "ICU Constraint", "Resource Failure"]

        for scenario_name in primary_scenarios:
            scenario_cfg = scenarios[scenario_name]
            results[scenario_name] = {}
            mult = scenario_cfg["arrival_rate_multiplier"]
            caps = scenario_cfg["capacities"]

            # Generate identical patient stream for this scenario (same seed)
            p_gen = SyntheticPatientGenerator(data_path=self.data_path, seed=self.seed)
            scenario_patients = p_gen.generate_patients(
                n_patients=n_patients,
                arrival_rate_multiplier=mult
            )
            
            if use_ml_duration:
                scenario_patients = self.predictor.predict_and_attach(scenario_patients)

            for policy in policies:
                stream_copy = copy.deepcopy(scenario_patients)
                engine = SimulationEngine(
                    patients=stream_copy,
                    resource_capacities=caps,
                    policy=policy,
                    use_predicted_duration=use_ml_duration
                )
                kpis = engine.run()
                results[scenario_name][policy] = kpis

        # Include legacy keys for backward test compatibility
        results["Normal"] = results["Normal Baseline"]
        results["Patient Surge"] = results["Emergency Surge"]
        results["ICU Shortage"] = results["ICU Constraint"]

        return {
            "ml_metrics": ml_metrics,
            "seed": self.seed,
            "n_patients": n_patients,
            "results": results
        }

if __name__ == "__main__":
    runner = ExperimentRunner(seed=42)
    exp_output = runner.run_experiments(n_patients=300)
    print("Experiments Completed Successfully!")
