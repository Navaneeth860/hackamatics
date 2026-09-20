import unittest
from backend.models.patient import Patient
from backend.models.patient_generator import SyntheticPatientGenerator

DATA_PATH = "data/real/healthcare_analytics_patient_flow_data.csv"

class TestPhase2PatientGenerator(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)

    def test_generation_patient_count(self):
        patients = self.generator.generate_patients(n_patients=100)
        self.assertEqual(len(patients), 100)
        
        patients_500 = self.generator.generate_patients(n_patients=500)
        self.assertEqual(len(patients_500), 500)

    def test_reproducibility_with_seed(self):
        gen1 = SyntheticPatientGenerator(data_path=DATA_PATH, seed=123)
        p_list1 = gen1.generate_patients(n_patients=50)

        gen2 = SyntheticPatientGenerator(data_path=DATA_PATH, seed=123)
        p_list2 = gen2.generate_patients(n_patients=50)

        for p1, p2 in zip(p_list1, p_list2):
            self.assertEqual(p1.patient_id, p2.patient_id)
            self.assertEqual(p1.arrival_time, p2.arrival_time)
            self.assertEqual(p1.urgency, p2.urgency)
            self.assertEqual(p1.icu_required, p2.icu_required)
            self.assertEqual(p1.true_duration, p2.true_duration)

    def test_resource_validity_and_durations(self):
        patients = self.generator.generate_patients(n_patients=200)
        for p in patients:
            self.assertGreaterEqual(p.urgency, 1)
            self.assertLessEqual(p.urgency, 5)
            self.assertGreaterEqual(p.doctor_required, 1)
            self.assertGreaterEqual(p.nurse_required, 1)
            self.assertGreater(p.true_duration, 0.0)
            self.assertIsInstance(p.is_admission_track, bool)
            self.assertIsInstance(p.icu_required, bool)
            self.assertIsInstance(p.or_required, bool)
            self.assertIsInstance(p.ambulance_required, bool)

    def test_icu_urgency_relationship(self):
        patients = self.generator.generate_patients(n_patients=500)
        icu_patients = [p for p in patients if p.icu_required]
        non_icu_patients = [p for p in patients if not p.icu_required]

        if icu_patients and non_icu_patients:
            mean_icu_urgency = sum(p.urgency for p in icu_patients) / len(icu_patients)
            mean_non_icu_urgency = sum(p.urgency for p in non_icu_patients) / len(non_icu_patients)
            self.assertGreater(mean_icu_urgency, mean_non_icu_urgency)

    def test_surge_multiplier_effects(self):
        gen_normal = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)
        p_normal = gen_normal.generate_patients(n_patients=100, arrival_rate_multiplier=1.0)

        gen_surge = SyntheticPatientGenerator(data_path=DATA_PATH, seed=42)
        p_surge = gen_surge.generate_patients(n_patients=100, arrival_rate_multiplier=1.5)

        # Arrival timestamps under surge (1.5x) should be earlier (compressed) than normal
        for pn, ps in zip(p_normal, p_surge):
            if pn.arrival_time > 0:
                self.assertLessEqual(ps.arrival_time, pn.arrival_time)

if __name__ == "__main__":
    unittest.main()

