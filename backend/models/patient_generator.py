import os
import random
import numpy as np
import pandas as pd
from typing import List
from backend.models.patient import Patient
from backend.utils.data_loader import load_and_clean_dataset

class SyntheticPatientGenerator:
    """
    Generates realistic inpatient (IP) patient streams for discrete-event simulation.
    Combines empirical dataset distributions (age, gender, department, arrival timestamps)
    with explicit operational simulation assumptions (urgency, ICU, OR, staffing, duration).
    """

    def __init__(self, data_path: str = "data/real/working_with_age_gender.csv", seed: int = 42):
        if not os.path.exists(data_path):
            data_path = "data/real/healthcare_analytics_patient_flow_data.csv"
        self.seed = seed
        self.set_seed(seed)
        self.df_clean, self.stats = load_and_clean_dataset(data_path)
        
        # Sort dataset by parsed datetime for realistic stream order
        self.df_clean = self.df_clean.sort_values("parsed_datetime").reset_index(drop=True)

        # Dataset empirical distributions
        self.ages = self.df_clean["Patient Age"].values
        self.genders = self.df_clean["Patient Gender"].values
        
        dept_counts = self.df_clean["Department Referral"].value_counts(normalize=True)
        self.dept_categories = dept_counts.index.tolist()
        self.dept_probs = dept_counts.values

        # Empirical admission probability
        if "Patient Admission Flag" in self.df_clean.columns:
            self.p_admission = self.df_clean["Patient Admission Flag"].mean()
        else:
            self.p_admission = 0.52

    def set_seed(self, seed: int):
        self.seed = seed
        random.seed(seed)
        np.random.seed(seed)

    def generate_patients(self, n_patients: int = 500, arrival_rate_multiplier: float = 1.0) -> List[Patient]:
        """
        Generates n_patients with reproducible synthetic characteristics.
        """
        self.set_seed(self.seed)
        patients: List[Patient] = []

        # Determine baseline arrival timestamps
        if len(self.df_clean) >= n_patients:
            sample_df = self.df_clean.iloc[:n_patients].copy()
        else:
            # Resample if requested count exceeds dataset size
            extra_idx = np.random.choice(len(self.df_clean), size=n_patients - len(self.df_clean))
            sample_df = pd.concat([self.df_clean, self.df_clean.iloc[extra_idx]]).reset_index(drop=True)

        start_time = sample_df["parsed_datetime"].iloc[0]

        current_arrival = 0.0
        for i in range(n_patients):
            row = sample_df.iloc[i]
            p_id = f"PAT-{i+1:05d}"
            
            # 1. Dataset-Derived Attributes
            dt = row["parsed_datetime"]
            if i == 0:
                current_arrival = 0.0
            else:
                prev_dt = sample_df["parsed_datetime"].iloc[i-1]
                delta_mins = (dt - prev_dt).total_seconds() / 60.0
                if delta_mins <= 0 or delta_mins > 120.0:
                    step = float(random.expovariate(1.0 / 12.0))
                else:
                    step = max(1.0, delta_mins)
                current_arrival += step / float(arrival_rate_multiplier)
            
            arrival_time = current_arrival
            dt_str = str(dt)

            age = int(row["Patient Age"])
            gender = str(row["Patient Gender"])
            dept = str(row["Department Referral"])
            
            # Admission track (inpatient vs emergency/outpatient track)
            is_admission = bool(random.random() < self.p_admission)

            # 2. Simulation Assumptions (Synthetic Fields)
            # Urgency (1 to 5) biased by age and department
            base_urgency_probs = [0.30, 0.35, 0.20, 0.10, 0.05]
            if dept in ["Cardiology", "Neurology"]:
                base_urgency_probs = [0.10, 0.20, 0.35, 0.25, 0.10]
            if age > 70:
                base_urgency_probs = [0.10, 0.25, 0.35, 0.20, 0.10]
                
            urgency = int(np.random.choice([1, 2, 3, 4, 5], p=base_urgency_probs))

            # ICU requirement (strongly dependent on urgency)
            if urgency >= 5:
                icu_prob = 0.70
            elif urgency == 4:
                icu_prob = 0.40
            elif urgency == 3:
                icu_prob = 0.15
            else:
                icu_prob = 0.02
            icu_required = bool(random.random() < icu_prob)

            # OR requirement (dependent on department and admission track)
            if dept in ["Orthopedics", "General Surgery"] and is_admission:
                or_prob = 0.55
            elif dept in ["Cardiology", "Neurology"] and urgency >= 4:
                or_prob = 0.30
            else:
                or_prob = 0.08
            or_required = bool(random.random() < or_prob)

            # Resource staffing requirements (doctors and nurses)
            if icu_required:
                doctor_req = random.choice([2, 3])
                nurse_req = random.choice([3, 4])
            elif or_required:
                doctor_req = random.choice([2, 3])
                nurse_req = random.choice([2, 3])
            else:
                doctor_req = 1 if urgency <= 3 else 2
                nurse_req = random.choice([1, 2])

            # Ambulance requirement
            ambulance_prob = 0.35 if urgency >= 4 else 0.08
            ambulance_required = bool(random.random() < ambulance_prob)

            # Ground-truth treatment duration (minutes)
            # Base duration derived from urgency and complexity + lognormal noise
            base_mins = 120.0 + (urgency * 60.0)
            if icu_required:
                base_mins += 360.0  # +6 hours for ICU care
            if or_required:
                base_mins += 180.0  # +3 hours for surgical care
                
            noise = float(np.random.lognormal(mean=0.0, sigma=0.3))
            true_duration = round(max(30.0, base_mins * noise), 2)

            patient = Patient(
                patient_id=p_id,
                arrival_time=round(arrival_time, 2),
                arrival_datetime_str=dt_str,
                age=age,
                gender=gender,
                department=dept,
                is_admission_track=is_admission,
                urgency=urgency,
                icu_required=icu_required,
                or_required=or_required,
                doctor_required=doctor_req,
                nurse_required=nurse_req,
                ambulance_required=ambulance_required,
                true_duration=true_duration,
                predicted_duration=None
            )
            patients.append(patient)

        return patients


if __name__ == "__main__":
    generator = SyntheticPatientGenerator(seed=42)
    sample_patients = generator.generate_patients(n_patients=100)
    print(f"Generated {len(sample_patients)} synthetic patients.")
    print("Sample Patient 1:")
    print(sample_patients[0].to_dict())

