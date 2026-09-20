import os
import random
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def generate_mock_dataset(output_path="data/real/healthcare_analytics_patient_flow_data.csv", n_rows=9216, seed=42):
    np.random.seed(seed)
    random.seed(seed)

    # 579 distinct days spanning Jan 2023 to Dec 2024
    start_date = datetime(2023, 1, 1)
    end_date = datetime(2024, 12, 31)
    total_days = (end_date - start_date).days + 1
    
    # Select exactly 579 distinct days randomly
    selected_days_offsets = sorted(np.random.choice(total_days, size=579, replace=False))
    selected_days = [start_date + timedelta(days=int(offset)) for offset in selected_days_offsets]

    # Distribute 9,216 patient arrivals across the selected 579 days
    day_indices = np.random.choice(len(selected_days), size=n_rows)
    
    patient_ids = [f"PAT-{i+1:05d}" for i in range(n_rows)]
    
    dates_raw = []
    times_raw = []
    merged_raw = []
    
    # Mixed date formats for parsing test
    date_formats = ["%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y"]

    for i in range(n_rows):
        dt = selected_days[day_indices[i]]
        # Random hour/minute/second
        h = random.randint(0, 23)
        m = random.randint(0, 59)
        s = random.randint(0, 59)
        
        fmt = date_formats[i % len(date_formats)]
        date_str = dt.strftime(fmt)
        time_str = f"{h:02d}:{m:02d}:{s:02d}"
        
        dates_raw.append(date_str)
        times_raw.append(time_str)
        merged_raw.append(f"{dt.strftime('%Y-%m-%d')} {time_str}")

    # Genders with exactly 17 'Femaleemale'
    genders = np.random.choice(["Female", "Male"], size=n_rows, p=[0.52, 0.48])
    female_indices = np.where(genders == "Female")[0]
    corrupted_indices = np.random.choice(female_indices, size=17, replace=False)
    genders = genders.astype(object)
    genders[corrupted_indices] = "Femaleemale"

    # Age (18 to 90)
    ages = np.random.randint(18, 91, size=n_rows)

    # Race
    races = np.random.choice(["Caucasian", "African American", "Asian", "Hispanic", "Other"], size=n_rows)

    # Department Referral (~58.6% missing)
    departments = ["Cardiology", "Orthopedics", "Neurology", "General Surgery", "Pulmonology"]
    dept_referrals = []
    for _ in range(n_rows):
        if random.random() < 0.586:
            dept_referrals.append(np.nan)
        else:
            dept_referrals.append(random.choice(departments))

    # Admission Flag (0 or 1, roughly balanced)
    admission_flags = np.random.choice([0, 1], size=n_rows, p=[0.48, 0.52])

    # Satisfaction Score (~72.7% missing)
    satisfaction_scores = []
    for _ in range(n_rows):
        if random.random() < 0.727:
            satisfaction_scores.append(np.nan)
        else:
            satisfaction_scores.append(random.randint(1, 5))

    # Waittime (uniform 10 to 60)
    waittimes = np.random.uniform(10.0, 60.0, size=n_rows).round(1)

    df = pd.DataFrame({
        "Patient Id": patient_ids,
        "Patient Admission Date": dates_raw,
        "Patient Admission Time": times_raw,
        "Merged": merged_raw,
        "Patient Gender": genders,
        "Patient Age": ages,
        "Patient Race": races,
        "Department Referral": dept_referrals,
        "Patient Admission Flag": admission_flags,
        "Patient Satisfaction Score": satisfaction_scores,
        "Patient Waittime": waittimes
    })

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Mock dataset successfully generated at '{output_path}' with {len(df)} rows.")

if __name__ == "__main__":
    generate_mock_dataset()

