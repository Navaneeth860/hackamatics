import unittest
import math
from backend.models.patient import Patient
from backend.scheduling.priority import (
    aging_function,
    aging_derivative,
    calculate_dynamic_priority,
    score_patient_for_policy
)
from backend.scheduling.allocator import ResourcePool, select_next_patient

class TestPhase3Scheduling(unittest.TestCase):

    def test_aging_function_and_monotonicity(self):
        lambda_val = 0.01
        
        # Test A(0) == 0
        self.assertAlmostEqual(aging_function(0.0, lambda_val), 0.0)
        
        # Test monotonicity: dA/dW > 0 for all W >= 0
        for w in [0.0, 10.0, 60.0, 120.0, 500.0, 1000.0]:
            a_val = aging_function(w, lambda_val)
            d_val = aging_derivative(w, lambda_val)
            self.assertGreater(d_val, 0.0, f"Derivative at W={w} must be strictly positive")
            self.assertGreaterEqual(a_val, 0.0)
            self.assertLessEqual(a_val, 1.0)
            
        # Monotonic increase check across wait times
        self.assertLess(aging_function(10, lambda_val), aging_function(30, lambda_val))
        self.assertLess(aging_function(30, lambda_val), aging_function(100, lambda_val))

    def test_resource_pool_invariants(self):
        pool = ResourcePool(capacities={"regular_beds": 5, "icu_beds": 1, "doctors": 3, "nurses": 4, "operating_rooms": 1, "ambulances": 1})
        self.assertEqual(pool.available("icu_beds"), 1)
        
        # Create test patient requiring ICU bed
        p_icu = Patient(
            patient_id="P-01", arrival_time=0.0, arrival_datetime_str="2023-01-01 08:00:00",
            age=60, gender="Female", department="Cardiology", is_admission_track=True,
            urgency=5, icu_required=True, or_required=False, doctor_required=2, nurse_required=3,
            ambulance_required=False, true_duration=120.0
        )
        
        self.assertTrue(pool.can_allocate(p_icu))
        pool.allocate(p_icu)
        
        # Verify occupancy updated and invariants hold
        self.assertEqual(pool.available("icu_beds"), 0)
        self.assertEqual(pool.available("doctors"), 1)
        self.assertEqual(pool.available("nurses"), 1)
        pool.check_invariants()
        
        # Second ICU patient should fail feasibility check
        p_icu2 = Patient(
            patient_id="P-02", arrival_time=5.0, arrival_datetime_str="2023-01-01 08:05:00",
            age=65, gender="Male", department="Neurology", is_admission_track=True,
            urgency=5, icu_required=True, or_required=False, doctor_required=1, nurse_required=2,
            ambulance_required=False, true_duration=180.0
        )
        self.assertFalse(pool.can_allocate(p_icu2))
        
        # Release first patient
        pool.release(p_icu)
        self.assertEqual(pool.available("icu_beds"), 1)
        self.assertEqual(pool.available("doctors"), 3)
        self.assertTrue(pool.can_allocate(p_icu2))

    def test_medflow_greedy_heuristic_skipping_blocked_patient(self):
        # Pool with 0 ICU beds available, 10 regular beds available
        pool = ResourcePool(capacities={"regular_beds": 10, "icu_beds": 0, "doctors": 10, "nurses": 10, "operating_rooms": 2, "ambulances": 2})

        # High priority patient requiring ICU (currently blocked)
        p_high_icu = Patient(
            patient_id="P-HIGH", arrival_time=0.0, arrival_datetime_str="2023-01-01 08:00:00",
            age=75, gender="Male", department="Cardiology", is_admission_track=True,
            urgency=5, icu_required=True, or_required=False, doctor_required=2, nurse_required=3,
            ambulance_required=False, true_duration=240.0
        )

        # Medium priority patient requiring regular bed (feasible)
        p_med_reg = Patient(
            patient_id="P-MED", arrival_time=1.0, arrival_datetime_str="2023-01-01 08:01:00",
            age=45, gender="Female", department="Orthopedics", is_admission_track=True,
            urgency=3, icu_required=False, or_required=False, doctor_required=1, nurse_required=2,
            ambulance_required=False, true_duration=120.0
        )

        queue = [p_high_icu, p_med_reg]
        current_time = 10.0

        # Strict head-of-line policy (DYNAMIC) should return None due to head-of-line blocking by P-HIGH
        selected_dyn, reason_dyn = select_next_patient(queue, current_time, pool, "DYNAMIC")
        self.assertIsNone(selected_dyn)
        self.assertIn("ICU", reason_dyn)

        # MEDFLOW resource-aware heuristic should skip blocked P-HIGH and select feasible P-MED!
        selected_medflow, reason_medflow = select_next_patient(queue, current_time, pool, "MEDFLOW")
        self.assertIsNotNone(selected_medflow)
        self.assertEqual(selected_medflow.patient_id, "P-MED")
        self.assertIsNone(reason_medflow)

if __name__ == "__main__":
    unittest.main()

