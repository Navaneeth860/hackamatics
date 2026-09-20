import math
from typing import List, Tuple
from backend.models.patient import Patient

def aging_function(wait_time: float, lambda_aging: float = 0.01) -> float:
    """
    Exponential aging function: A(W) = 1 - exp(-lambda * W)
    As waiting time W increases, A(W) approaches 1.0 monotonically.
    """
    if wait_time <= 0 or lambda_aging <= 0:
        return 0.0
    return 1.0 - math.exp(-lambda_aging * wait_time)


def aging_derivative(wait_time: float, lambda_aging: float = 0.01) -> float:
    """
    Derivative of aging function: dA/dW = lambda * exp(-lambda * W)
    For lambda > 0 and W >= 0, dA/dW is strictly positive (monotonic increasing).
    """
    if lambda_aging <= 0:
        return 0.0
    return lambda_aging * math.exp(-lambda_aging * max(0.0, wait_time))


def calculate_deterioration_risk(patient: Patient) -> float:
    """
    Deterioration risk index D_i in [0, 1].
    Combines clinical urgency and age vulnerability.
    """
    # Base risk derived from urgency (1 to 5 -> 0.2 to 1.0)
    urgency_risk = patient.urgency / 5.0
    
    # Age factor (higher vulnerability for age > 65)
    age_factor = min(1.0, max(0.0, (patient.age - 18) / 80.0))
    
    # ICU/OR multiplier
    complexity_multiplier = 1.2 if (patient.icu_required or patient.or_required) else 1.0
    
    risk = (0.7 * urgency_risk + 0.3 * age_factor) * complexity_multiplier
    return min(1.0, max(0.0, risk))


def calculate_dynamic_priority(
    patient: Patient,
    current_time: float,
    w_u: float = 0.5,
    w_a: float = 0.3,
    w_d: float = 0.2,
    lambda_aging: float = 0.01
) -> float:
    """
    Dynamic Priority Equation:
    P_i(t) = w_u * U_i + w_a * (1 - e^(-lambda * W_i)) + w_d * D_i
    
    Returns priority score (higher score = higher scheduling priority).
    """
    # 1. Normalized Urgency (1 to 5 -> 0.2 to 1.0)
    u_norm = patient.urgency / 5.0
    
    # 2. Waiting Time W_i
    wait_time = max(0.0, current_time - patient.arrival_time)
    patient.wait_time = wait_time  # Update dynamic patient wait time
    
    # 3. Aging term A(W_i)
    aging_term = aging_function(wait_time, lambda_aging)
    
    # 4. Deterioration Risk D_i
    deterioration_risk = calculate_deterioration_risk(patient)
    
    priority_score = (w_u * u_norm) + (w_a * aging_term) + (w_d * deterioration_risk)
    return priority_score


def score_patient_for_policy(patient: Patient, current_time: float, policy: str) -> float:
    """
    Scores a patient according to the requested policy:
    - 'FCFS': Priority inversely proportional to arrival_time (earlier arrival = higher priority)
    - 'URGENCY': Priority based purely on clinical urgency
    - 'DYNAMIC': Priority using dynamic priority equation (urgency + aging + deterioration)
    - 'MEDFLOW': Dynamic priority score used for resource-aware greedy heuristic
    """
    pol = policy.upper()
    if pol == "FCFS":
        # Earlier arrival_time gets higher score
        return -patient.arrival_time
    elif pol == "URGENCY":
        return float(patient.urgency)
    elif pol in ["DYNAMIC", "MEDFLOW"]:
        return calculate_dynamic_priority(patient, current_time)
    else:
        raise ValueError(f"Unknown scheduling policy: {policy}")

