import unittest
from backend.models.patient_generator import SyntheticPatientGenerator
from backend.ml.duration_model import TreatmentDurationPredictor
from backend.simulation.experiments import ExperimentRunner

DATA_PATH = "data/real/healthcare_analytics_patient_flow_data.csv"

class TestPhase5MLExperiments(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)
        cls.sample_patients = cls.generator.generate_patients(n_patients=200)

    def test_ml_duration_model_training_and_prediction(self):
        predictor = TreatmentDurationPredictor(random_state=42)
        metrics = predictor.train(self.sample_patients)

        self.assertIn("mae", metrics)
        self.assertIn("r2", metrics)
        self.assertGreaterEqual(metrics["mae"], 0.0)
        self.assertGreater(metrics["r2"], 0.5)

        # Test prediction assignment
        patients_with_pred = predictor.predict_and_attach(self.sample_patients)
        for p in patients_with_pred:
            self.assertIsNotNone(p.predicted_duration)
            self.assertGreater(p.predicted_duration, 0.0)

    def test_experiment_runner_grid_execution(self):
        runner = ExperimentRunner(data_path=DATA_PATH, seed=42)
        exp_output = runner.run_experiments(n_patients=100)

        self.assertEqual(exp_output["seed"], 42)
        self.assertEqual(exp_output["n_patients"], 100)
        
        results = exp_output["results"]
        expected_scenarios = ["Normal", "Patient Surge", "ICU Shortage"]
        expected_policies = ["FCFS", "URGENCY", "DYNAMIC", "MEDFLOW"]

        for sc in expected_scenarios:
            self.assertIn(sc, results)
            for pol in expected_policies:
                self.assertIn(pol, results[sc])
                kpis = results[sc][pol]
                self.assertEqual(kpis["completed_patients"], 100)
                self.assertGreaterEqual(kpis["waiting_metrics"]["avg_wait_mins"], 0.0)

    def test_icu_shortage_scenario_impact(self):
        runner = ExperimentRunner(data_path=DATA_PATH, seed=42)
        exp_output = runner.run_experiments(n_patients=150)
        results = exp_output["results"]

        normal_icu_util = results["Normal"]["DYNAMIC"]["resource_utilization_pct"]["icu_beds"]
        shortage_icu_util = results["ICU Shortage"]["DYNAMIC"]["resource_utilization_pct"]["icu_beds"]

        # ICU Shortage (8 beds) should show higher ICU utilization than Normal (35 beds)
        self.assertGreaterEqual(shortage_icu_util, normal_icu_util)

if __name__ == "__main__":
    unittest.main()

