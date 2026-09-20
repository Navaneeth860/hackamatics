from dataclasses import dataclass, field
from typing import Dict, Optional

@dataclass
class Patient:
    # Basic Identification
    patient_id: str
    
    # Dataset-Derived Characteristics
    arrival_time: float               # Simulation time in minutes from t=0
    arrival_datetime_str: str          # Real dataset timestamp string
    age: int
    gender: str
    department: str
    is_admission_track: bool           # True if inpatient admission required
    
    # Synthetic Clinical & Resource Requirements
    urgency: int                       # 1 (Low) to 5 (Critical Emergency)
    icu_required: bool                 # True if ICU bed required
    or_required: bool                  # True if Operating Room required
    doctor_required: int               # Number of doctors required (e.g. 1-3)
    nurse_required: int                # Number of nurses required (e.g. 1-4)
    ambulance_required: bool           # True if ambulance transport required
    
    # Duration Ground Truth & ML Prediction
    true_duration: float               # Ground-truth treatment/stay duration in minutes
    predicted_duration: Optional[float] = None  # Populated by ML model or duration proxy
    
    # Simulation Dynamic Lifecycle Fields
    queue_enter_time: Optional[float] = None
    service_start_time: Optional[float] = None
    completion_time: Optional[float] = None
    wait_time: float = 0.0
    resources_used: Dict[str, int] = field(default_factory=dict)
    status: str = "WAITING"             # WAITING, ADMITTED, DISCHARGED

    def to_dict(self) -> dict:
        return {
            "patient_id": self.patient_id,
            "arrival_time": round(self.arrival_time, 2),
            "arrival_datetime_str": self.arrival_datetime_str,
            "age": self.age,
            "gender": self.gender,
            "department": self.department,
            "is_admission_track": self.is_admission_track,
            "urgency": self.urgency,
            "icu_required": self.icu_required,
            "or_required": self.or_required,
            "doctor_required": self.doctor_required,
            "nurse_required": self.nurse_required,
            "ambulance_required": self.ambulance_required,
            "true_duration": round(self.true_duration, 2),
            "predicted_duration": round(self.predicted_duration, 2) if self.predicted_duration is not None else None,
            "queue_enter_time": round(self.queue_enter_time, 2) if self.queue_enter_time is not None else None,
            "service_start_time": round(self.service_start_time, 2) if self.service_start_time is not None else None,
            "completion_time": round(self.completion_time, 2) if self.completion_time is not None else None,
            "wait_time": round(self.wait_time, 2),
            "resources_used": self.resources_used,
            "status": self.status
        }

