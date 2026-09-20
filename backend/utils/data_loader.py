import os
import pandas as pd
import numpy as np
from datetime import datetime

def parse_mixed_dates(date_series, time_series=None, merged_series=None):
    """
    Robustly parses dates across mixed formats.
    Handles YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, ISO strings, etc.
    """
    parsed_dates = []
    
    # First try using pd.to_datetime with format='mixed'
    if merged_series is not None and not merged_series.isnull().all():
        try:
            return pd.to_datetime(merged_series, format='mixed', errors='coerce')
        except Exception:
            pass

    # Fallback to element-wise robust parsing
    for i in range(len(date_series)):
        d_val = date_series.iloc[i]
        t_val = time_series.iloc[i] if time_series is not None else "00:00:00"
        
        combined_str = f"{d_val} {t_val}".strip()
        
        parsed_dt = pd.to_datetime(combined_str, format='mixed', errors='coerce')
        if pd.isnull(parsed_dt):
            parsed_dt = pd.to_datetime(d_val, format='mixed', errors='coerce')
            
        parsed_dates.append(parsed_dt)
        
    return pd.Series(parsed_dates, index=date_series.index)


def load_and_clean_dataset(file_path="data/real/working_with_age_gender.csv"):
    """
    Loads, cleans, normalizes, and calculates calibration statistics for the dataset.
    """
    if not os.path.exists(file_path):
        file_path = "data/real/healthcare_analytics_patient_flow_data.csv"
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset file not found at path: {file_path}")

    df = pd.read_csv(file_path)

    # Normalize column names between legacy (11-col) and working dataset (24-col)
    if "Age" in df.columns and "Patient Age" not in df.columns:
        df["Patient Age"] = df["Age"]
    if "Gender" in df.columns and "Patient Gender" not in df.columns:
        df["Patient Gender"] = df["Gender"]
    if "Patient ID" in df.columns and "Patient Id" not in df.columns:
        df["Patient Id"] = df["Patient ID"]
    if "Department Referral" not in df.columns:
        df["Department Referral"] = "General Emergency"
    if "Patient Admission Flag" not in df.columns:
        if "Patient Outcome" in df.columns:
            df["Patient Admission Flag"] = (df["Patient Outcome"] == "Admitted").astype(int)
        else:
            df["Patient Admission Flag"] = 1
    if "Total Wait Time (min)" in df.columns and "Patient Waittime" not in df.columns:
        df["Patient Waittime"] = df["Total Wait Time (min)"]

    date_col = "Visit Date" if "Visit Date" in df.columns else ("Patient Admission Date" if "Patient Admission Date" in df.columns else df.columns[0])

    # Raw calibration stats prior to cleaning
    raw_rows, raw_cols = df.shape
    raw_gender_counts = df["Patient Gender"].value_counts(dropna=False).to_dict() if "Patient Gender" in df.columns else {}

    # 1. Gender Normalization: replace 'Femaleemale' with 'Female'
    if "Patient Gender" in df.columns:
        femaleemale_count = (df["Patient Gender"] == "Femaleemale").sum()
        df["Patient Gender"] = df["Patient Gender"].replace({"Femaleemale": "Female"})
    else:
        femaleemale_count = 0

    # 2. Department Referral Normalization: missing referral -> 'No specialist referral'
    if "Department Referral" in df.columns:
        dept_missing_count = df["Department Referral"].isnull().sum()
        dept_missing_pct = (dept_missing_count / len(df)) * 100.0
        df["Department Referral"] = df["Department Referral"].fillna("No specialist referral")
    else:
        dept_missing_count = 0
        dept_missing_pct = 0.0

    # 3. Robust Mixed-Date Parsing
    df["parsed_datetime"] = parse_mixed_dates(
        df[date_col],
        df.get("Patient Admission Time"),
        df.get("Merged")
    )

    unparseable_dates = df["parsed_datetime"].isnull().sum()
    df["admission_date"] = df["parsed_datetime"].dt.date
    df["admission_hour"] = df["parsed_datetime"].dt.hour

    distinct_days_count = df["admission_date"].nunique()
    min_date = df["parsed_datetime"].min()
    max_date = df["parsed_datetime"].max()

    # 4. Age validity
    if "Patient Age" in df.columns:
        valid_ages = df["Patient Age"].between(0, 120)
        invalid_age_count = (~valid_ages).sum()
        age_mean = float(df["Patient Age"].mean())
        age_min = float(df["Patient Age"].min())
        age_max = float(df["Patient Age"].max())
        age_std = float(df["Patient Age"].std())
    else:
        invalid_age_count = 0
        age_mean, age_min, age_max, age_std = 0.0, 0.0, 0.0, 0.0

    # 5. Admission Flag distribution
    if "Patient Admission Flag" in df.columns:
        admission_counts = df["Patient Admission Flag"].value_counts().to_dict()
    else:
        admission_counts = {}

    # 6. Waittime summary
    if "Patient Waittime" in df.columns:
        waittime_mean = float(df["Patient Waittime"].mean())
        waittime_min = float(df["Patient Waittime"].min())
        waittime_max = float(df["Patient Waittime"].max())
    else:
        waittime_mean, waittime_min, waittime_max = 0.0, 0.0, 0.0

    # 7. Arrival rate stats
    daily_arrivals = df.groupby("admission_date").size()
    mean_daily_arrivals = float(daily_arrivals.mean())
    std_daily_arrivals = float(daily_arrivals.std()) if len(daily_arrivals) > 1 else 0.0

    # Cleaned gender counts
    cleaned_gender_counts = df["Patient Gender"].value_counts(dropna=False).to_dict()
    dept_counts = df["Department Referral"].value_counts().to_dict()

    calibration_stats = {
        "raw_row_count": raw_rows,
        "raw_col_count": raw_cols,
        "femaleemale_cleaned_count": int(femaleemale_count),
        "dept_referral_missing_count": int(dept_missing_count),
        "dept_referral_missing_pct": float(round(dept_missing_pct, 2)),
        "unparseable_dates_count": int(unparseable_dates),
        "distinct_days_count": int(distinct_days_count),
        "min_date": str(min_date),
        "max_date": str(max_date),
        "cleaned_gender_distribution": cleaned_gender_counts,
        "department_distribution": dept_counts,
        "age_stats": {
            "mean": round(age_mean, 2),
            "min": age_min,
            "max": age_max,
            "std": round(age_std, 2),
            "invalid_count": int(invalid_age_count)
        },
        "admission_flag_distribution": admission_counts,
        "waittime_stats": {
            "mean": round(waittime_mean, 2),
            "min": waittime_min,
            "max": waittime_max
        },
        "arrival_rate_stats": {
            "mean_daily_arrivals": round(mean_daily_arrivals, 2),
            "std_daily_arrivals": round(std_daily_arrivals, 2)
        }
    }

    return df, calibration_stats


if __name__ == "__main__":
    df_clean, stats = load_and_clean_dataset()
    print("Dataset Loaded and Cleaned Successfully!")
    print("Calibration Statistics:")
    for k, v in stats.items():
        print(f"  {k}: {v}")

