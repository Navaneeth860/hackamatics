import unittest
from backend.api.main import (
    get_system_status,
    get_ml_metrics,
    run_simulation,
    run_full_experiments,
    SimulationRequest,
    ExperimentRequest
)
from backend.models.patient_generator import SyntheticPatientGenerator
from backend.simulation.engine import SimulationEngine

DATA_PATH = "data/real/healthcare_analytics_patient_flow_data.csv"

class TestPhase6APIAndStress(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)

    def test_api_status_endpoint(self):
        data = get_system_status()
        self.assertEqual(data["status"], "ONLINE")
        self.assertIn("dataset_stats", data)
        self.assertIn("baseline_capacities", data)

    def test_api_ml_metrics_endpoint(self):
        data = get_ml_metrics()
        self.assertIn("metrics", data)
        self.assertIn("mae", data["metrics"])

    def test_api_simulate_endpoint(self):
        req = SimulationRequest(
            n_patients=50,
            scenario="Normal",
            policy="MEDFLOW",
            use_ml_duration=True
        )
        data = run_simulation(req)
        self.assertEqual(data["policy"], "MEDFLOW")
        self.assertIn("kpis", data)
        self.assertIn("patient_sample", data)

    def test_stress_zero_icu_capacity(self):
        patients = self.generator.generate_patients(n_patients=50)
        capacities = {
            "regular_beds": 20,
            "icu_beds": 0,           # ZERO ICU Beds
            "doctors": 10,
            "nurses": 10,
            "operating_rooms": 2,
            "ambulances": 2
        }
        engine = SimulationEngine(patients, resource_capacities=capacities, policy="MEDFLOW")
        kpis = engine.run()
        
        # Engine handles zero ICU capacity cleanly without crashing
        self.assertGreaterEqual(kpis["completed_patients"], 0)

    def test_stress_simultaneous_arrivals(self):
        patients = self.generator.generate_patients(n_patients=100)
        # Force all arrival timestamps to t=0
        for p in patients:
            p.arrival_time = 0.0

        capacities = {"regular_beds": 10, "icu_beds": 2, "doctors": 5, "nurses": 8, "operating_rooms": 1, "ambulances": 1}
        engine = SimulationEngine(patients, resource_capacities=capacities, policy="MEDFLOW")
        kpis = engine.run()

        self.assertEqual(kpis["completed_patients"], 100)
        engine.resource_pool.check_invariants()

    def test_stress_high_surge_multiplier(self):
        # 50.0x arrival frequency surge
        surge_patients = self.generator.generate_patients(n_patients=200, arrival_rate_multiplier=50.0)
        engine = SimulationEngine(surge_patients, policy="MEDFLOW")
        kpis = engine.run()

        self.assertEqual(kpis["completed_patients"], 200)

if __name__ == "__main__":
    unittest.main()

