import copy
from typing import Dict, List, Any
from backend.models.patient_generator import SyntheticPatientGenerator
from backend.ml.duration_model import TreatmentDurationPredictor
from backend.simulation.engine import SimulationEngine

class ExperimentRunner:
    """
    Executes controlled mathematical experiments across scheduling policies and operational scenarios.
    Strictly enforces experimental control: Identical patient streams, seeds, and durations across policy runs.
    """

    def __init__(self, data_path: str = "data/real/healthcare_analytics_patient_flow_data.csv", seed: int = 42):
        self.data_path = data_path
        self.seed = seed
        self.generator = SyntheticPatientGenerator(data_path=data_path, seed=seed)
        self.predictor = TreatmentDurationPredictor(random_state=seed)

    def define_scenarios(self) -> Dict[str, Dict[str, Any]]:
        """Defines operational hospital scenarios for policy comparison."""
        return {
            "Normal": {
                "description": "Baseline operational capacity under steady-state patient demand",
                "arrival_rate_multiplier": 8.0,
                "capacities": {
                    "regular_beds": 35,
                    "icu_beds": 6,
                    "doctors": 12,
                    "nurses": 20,
                    "operating_rooms": 3,
                    "ambulances": 4
                }
            },
            "Patient Surge": {
                "description": "Emergency surge: 15.0x arrival rate multiplier creating severe bed & staff competition",
                "arrival_rate_multiplier": 15.0,
                "capacities": {
                    "regular_beds": 35,
                    "icu_beds": 6,
                    "doctors": 12,
                    "nurses": 20,
                    "operating_rooms": 3,
                    "ambulances": 4
                }
            },
            "ICU Shortage": {
                "description": "Critical ICU bottleneck: ICU bed capacity reduced from 6 beds down to 2 beds",
                "arrival_rate_multiplier": 8.0,
                "capacities": {
                    "regular_beds": 35,
                    "icu_beds": 2,           # ICU Bottleneck
                    "doctors": 12,
                    "nurses": 20,
                    "operating_rooms": 3,
                    "ambulances": 4
                }
            }
        }

    def run_experiments(
        self,
        n_patients: int = 500,
        policies: List[str] = ["FCFS", "URGENCY", "DYNAMIC", "MEDFLOW"],
        use_ml_duration: bool = True
    ) -> Dict[str, Any]:
        """
        Executes grid of 3 Scenarios x 4 Policies on identical resampled patient streams.
        """
        scenarios = self.define_scenarios()
        results: Dict[str, Dict[str, Any]] = {}

        # 1. Train ML model on baseline stream
        base_patients = self.generator.generate_patients(n_patients=n_patients, arrival_rate_multiplier=1.0)
        ml_metrics = self.predictor.train(base_patients)

        for scenario_name, scenario_cfg in scenarios.items():
            results[scenario_name] = {}
            mult = scenario_cfg["arrival_rate_multiplier"]
            caps = scenario_cfg["capacities"]

            # Generate identical patient stream for this scenario (same seed)
            scenario_patients = self.generator.generate_patients(
                n_patients=n_patients,
                arrival_rate_multiplier=mult
            )
            
            if use_ml_duration:
                scenario_patients = self.predictor.predict_and_attach(scenario_patients)

            for policy in policies:
                # Isolate patient stream per policy run
                stream_copy = copy.deepcopy(scenario_patients)
                engine = SimulationEngine(
                    patients=stream_copy,
                    resource_capacities=caps,
                    policy=policy,
                    use_predicted_duration=use_ml_duration
                )
                kpis = engine.run()
                results[scenario_name][policy] = kpis

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
    print(f"ML Metrics: {exp_output['ml_metrics']}")
    print("\nScenario Results Summary:")
    for sc_name, pol_dict in exp_output["results"].items():
        print(f"\n--- {sc_name} ---")
        for pol, kpis in pol_dict.items():
            w = kpis["waiting_metrics"]
            print(f"  {pol:8s} | Avg Wait: {w['avg_wait_mins']:6.2f}m | P95 Wait: {w['p95_wait_mins']:6.2f}m | Max Wait: {w['max_wait_mins']:6.2f}m | Starv Ratio: {kpis['fairness_metrics']['starvation_ratio']}")
