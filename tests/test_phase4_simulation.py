import unittest
from backend.models.patient_generator import SyntheticPatientGenerator
from backend.simulation.engine import SimulationEngine

DATA_PATH = "data/real/healthcare_analytics_patient_flow_data.csv"

class TestPhase4Simulation(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)
        cls.patients_100 = cls.generator.generate_patients(n_patients=100)
        cls.patients_500 = cls.generator.generate_patients(n_patients=500)

    def test_simulation_run_100_patients_all_policies(self):
        policies = ["FCFS", "URGENCY", "DYNAMIC", "MEDFLOW"]
        
        for pol in policies:
            # Constrained capacities to force resource competition
            capacities = {
                "regular_beds": 20,
                "icu_beds": 4,
                "doctors": 8,
                "nurses": 15,
                "operating_rooms": 2,
                "ambulances": 2
            }
            engine = SimulationEngine(self.patients_100, resource_capacities=capacities, policy=pol)
            kpis = engine.run()

            self.assertEqual(kpis["policy"], pol)
            self.assertEqual(kpis["total_patients"], 100)
            self.assertGreater(kpis["completed_patients"], 0)
            self.assertGreaterEqual(kpis["waiting_metrics"]["avg_wait_mins"], 0.0)
            self.assertGreaterEqual(kpis["waiting_metrics"]["p95_wait_mins"], 0.0)
            
            # Utilization checks
            for r_name, util in kpis["resource_utilization_pct"].items():
                self.assertGreaterEqual(util, 0.0)
                self.assertLessEqual(util, 100.0)

    def test_simulation_run_500_patients_medflow(self):
        capacities = {
            "regular_beds": 50,
            "icu_beds": 8,
            "doctors": 15,
            "nurses": 30,
            "operating_rooms": 3,
            "ambulances": 3
        }
        engine = SimulationEngine(self.patients_500, resource_capacities=capacities, policy="MEDFLOW")
        kpis = engine.run()

        self.assertEqual(kpis["total_patients"], 500)
        self.assertEqual(kpis["completed_patients"], 500)
        self.assertGreater(kpis["total_simulation_time_mins"], 0.0)

    def test_deadlock_and_invariants(self):
        # Constrained capacities (must be >= max single-patient requirements: 3 doctors, 4 nurses)
        capacities = {
            "regular_beds": 10,
            "icu_beds": 2,
            "doctors": 3,
            "nurses": 4,
            "operating_rooms": 1,
            "ambulances": 1
        }
        engine = SimulationEngine(self.patients_100, resource_capacities=capacities, policy="MEDFLOW")
        kpis = engine.run()

        # Engine must terminate cleanly with all patients eventually processed & completed
        self.assertEqual(kpis["total_patients"], 100)
        self.assertEqual(kpis["completed_patients"], 100)
        engine.resource_pool.check_invariants()

    def test_kpi_structure_and_fairness(self):
        engine = SimulationEngine(self.patients_100, policy="DYNAMIC")
        kpis = engine.run()

        expected_keys = [
            "policy", "total_patients", "completed_patients", "completion_rate_pct",
            "total_simulation_time_mins", "waiting_metrics", "fairness_metrics",
            "resource_utilization_pct", "resource_capacities"
        ]
        for key in expected_keys:
            self.assertIn(key, kpis)

        fairness = kpis["fairness_metrics"]
        self.assertIn("starvation_ratio", fairness)
        self.assertIn("avg_wait_by_urgency_mins", fairness)

if __name__ == "__main__":
    unittest.main()
