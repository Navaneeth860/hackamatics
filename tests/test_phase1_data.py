import os
import unittest
import pandas as pd
from data.real.generate_mock_dataset import generate_mock_dataset
from backend.utils.data_loader import load_and_clean_dataset

DATA_PATH = "data/real/healthcare_analytics_patient_flow_data.csv"

class TestPhase1Data(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(DATA_PATH):
            generate_mock_dataset(DATA_PATH, n_rows=9216, seed=42)
        cls.df, cls.stats = load_and_clean_dataset(DATA_PATH)

    def test_dataset_ingestion_and_shape(self):
        self.assertEqual(len(self.df), 9216)
        self.assertEqual(self.stats["raw_row_count"], 9216)
        self.assertEqual(self.stats["raw_col_count"], 11)

    def test_gender_cleanup(self):
        self.assertNotIn("Femaleemale", self.df["Patient Gender"].values)
        self.assertEqual(self.stats["femaleemale_cleaned_count"], 17)
        self.assertIn("Female", self.stats["cleaned_gender_distribution"])

    def test_department_referral_normalization(self):
        self.assertEqual(self.df["Department Referral"].isnull().sum(), 0)
        self.assertIn("No specialist referral", self.df["Department Referral"].values)
        self.assertGreater(self.stats["dept_referral_missing_count"], 0)

    def test_date_parsing(self):
        self.assertIn("parsed_datetime", self.df.columns)
        self.assertEqual(self.df["parsed_datetime"].isnull().sum(), 0)
        self.assertEqual(self.stats["unparseable_dates_count"], 0)
        self.assertEqual(self.stats["distinct_days_count"], 579)

    def test_age_validity(self):
        self.assertTrue((self.df["Patient Age"] >= 0).all())
        self.assertTrue((self.df["Patient Age"] <= 120).all())
        self.assertEqual(self.stats["age_stats"]["invalid_count"], 0)

    def test_calibration_statistics_structure(self):
        expected_keys = [
            "raw_row_count", "raw_col_count", "femaleemale_cleaned_count",
            "dept_referral_missing_count", "dept_referral_missing_pct",
            "unparseable_dates_count", "distinct_days_count", "min_date",
            "max_date", "cleaned_gender_distribution", "department_distribution",
            "age_stats", "admission_flag_distribution", "waittime_stats",
            "arrival_rate_stats"
        ]
        for key in expected_keys:
            self.assertIn(key, self.stats)

if __name__ == "__main__":
    unittest.main()

