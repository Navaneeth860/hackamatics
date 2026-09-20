import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Any
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from backend.models.patient import Patient

KNOWN_DEPARTMENTS = [
    "Cardiology", "Orthopedics", "Neurology",
    "General Surgery", "Pulmonology", "No specialist referral"
]

class TreatmentDurationPredictor:
    """
    ML model trained on synthetic simulation ground truth to predict inpatient stay duration.
    Consumes patient features (age, department, urgency, admission track) to output predicted_duration.
    """

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.model = RandomForestRegressor(n_estimators=100, random_state=random_state)
        self.is_trained = False
        self.feature_names = [
            "age", "urgency", "is_admission_track",
            "icu_required", "or_required"
        ] + [f"dept_{d}" for d in KNOWN_DEPARTMENTS]

    def _extract_features(self, patients: List[Patient]) -> Tuple[np.ndarray, np.ndarray]:
        """Extracts numerical feature matrix X and target vector y from patient list."""
        rows = []
        targets = []

        for p in patients:
            row = [
                float(p.age),
                float(p.urgency),
                1.0 if p.is_admission_track else 0.0,
                1.0 if p.icu_required else 0.0,
                1.0 if p.or_required else 0.0,
            ]
            # One-hot encode department
            for d in KNOWN_DEPARTMENTS:
                row.append(1.0 if p.department == d else 0.0)

            rows.append(row)
            targets.append(float(p.true_duration))

        return np.array(rows), np.array(targets)

    def train(self, patients: List[Patient], test_size: float = 0.2) -> Dict[str, float]:
        """
        Trains RandomForestRegressor on patient ground truth and returns MAE & R2.
        """
        X, y = self._extract_features(patients)
        
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=self.random_state
        )

        self.model.fit(X_train, y_train)
        self.is_trained = True

        y_pred = self.model.predict(X_test)
        
        mae = float(mean_absolute_error(y_test, y_pred))
        r2 = float(r2_score(y_test, y_pred))

        return {
            "mae": round(mae, 2),
            "r2": round(r2, 4),
            "train_samples": len(X_train),
            "test_samples": len(X_test)
        }

    def predict_and_attach(self, patients: List[Patient]) -> List[Patient]:
        """
        Predicts stay duration for a list of patients and populates patient.predicted_duration.
        """
        if not self.is_trained:
            # Self-train if not explicitly pre-trained
            self.train(patients)

        X, _ = self._extract_features(patients)
        predictions = self.model.predict(X)

        for p, pred in zip(patients, predictions):
            p.predicted_duration = round(max(30.0, float(pred)), 2)

        return patients


if __name__ == "__main__":
    from backend.models.patient_generator import SyntheticPatientGenerator
    gen = SyntheticPatientGenerator(seed=42)
    sample_patients = gen.generate_patients(n_patients=500)
    
    predictor = TreatmentDurationPredictor(random_state=42)
    metrics = predictor.train(sample_patients)
    print("ML Duration Predictor Trained Successfully!")
    print(f"Metrics: MAE = {metrics['mae']} mins | R2 Score = {metrics['r2']}")

