# MEDFLOW — Inpatient Hospital Resource Simulation & Scheduling Framework

> **A mathematical simulation and resource-constrained scheduling framework for studying inpatient hospital operations under uncertain patient arrivals and limited resources.**

---

## 1. Problem Statement
Inpatient (IP) hospital departments face severe operational bottlenecks when high-acuity patient arrivals exceed finite physical and human resources (regular beds, ICU beds, physicians, nurses, operating rooms). Standard queue management algorithms like First-Come, First-Served (FCFS) fail to prioritize severe cases, while simple urgency-only queues can cause starvation for lower-acuity patients. 

MEDFLOW models inpatient resource dynamics under uncertainty and evaluates mathematical scheduling heuristics to balance waiting times, throughput, resource utilization, and fairness.

---

## 2. Why Inpatient Resource Allocation?
Unlike Outpatient Department (OPD) visits—which are transient, scheduled, and low-complexity—inpatient care requires continuous multi-resource locking (bed + doctor + nurse + potential ICU/OR) over extended, non-deterministic durations. Constrained inpatient resources create severe cascading delays across emergency and specialty departments.

---

## 3. Core Operational Question
*Given the same patient arrival stream and identical limited hospital resource capacities, how do different mathematical scheduling policies affect patient waiting time, hospital throughput, resource utilization, and operational fairness?*

---

## 4. Mathematical Formulation

### 4.1 Dynamic Priority Function
To dynamically score waiting patients, MEDFLOW implements a bounded aging-augmented priority equation:

$$
P_i(t) = w_u U_i + w_a (1 - e^{-\lambda W_i}) + w_d D_i
$$

Where:
* $U_i \in [1, 5]$: Patient clinical urgency score
* $W_i \ge 0$: Current waiting time in queue (minutes)
* $D_i \in [0, 1]$: Deterioration risk index
* $w_u, w_a, w_d$: Configurable priority weights ($w_u + w_a + w_d = 1.0$)
* $\lambda > 0$: Non-linear aging rate coefficient

**Aging Function Derivative (Monotonicity):**
$$
A(W) = 1 - e^{-\lambda W} \implies \frac{dA}{dW} = \lambda e^{-\lambda W} > 0
$$
Since $\frac{dA}{dW} > 0$ for all $\lambda > 0, W \ge 0$, patient priority strictly increases with waiting time, reducing long-tail starvation pressure.

### 4.2 Resource Capacity Constraints
For each hospital resource type $r \in \{\text{RegularBeds}, \text{ICUBeds}, \text{Doctors}, \text{Nurses}, \text{OperatingRooms}, \text{Ambulances}\}$:

$$
\sum_{i \in \mathcal{A}(t)} x_{i,r}(t) \le C_r, \quad \forall t
$$

**Multi-Specialty Hospital Baseline Capacities ($C_r$):**
* **Regular Beds**: 200
* **ICU Beds**: 35
* **Doctors**: 60
* **Nurses**: 150
* **Operating Rooms**: 10
* **Ambulances**: 10

The system strictly enforces $U_r(t) \le C_r$ at all times $t$.

---

## 5. System Architecture
```text
Patient Arrival Stream (Real Dataset + Synthetic Acuity)
                         │
                         ▼
        Discrete-Event Simulator (heapq)
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
Scheduling Policies             Resource Capacity Check
 (FCFS, Urgency,                (Beds, ICU, Doctors,
  Dynamic, MEDFLOW)              Nurses, OR, Ambulances)
         │                               │
         └───────────────┬───────────────┘
                         ▼
             Patient Treatment & Stay
                         │
                         ▼
             Discharge & Resource Release
                         │
                         ▼
               KPI Analysis & React UI
```

---

## 6. Dataset Description
* **Filename**: `healthcare_analytics_patient_flow_data.csv`
* **Rows**: 9,216 patient records
* **Columns**: 11 attributes
* **Date Range**: January 2023 – December 2024 (579 distinct days)
* **Ingestion & Data Cleaning**:
  * **Mixed Date Formats**: Multi-format parsing (`YYYY-MM-DD`, `MM/DD/YYYY`, `DD-MM-YYYY`).
  * **Gender Normalization**: Repaired 17 corrupted records containing `Femaleemale` $\rightarrow$ `Female`.
  * **Department Referral**: ~58.6% missing values preserved as a legitimate category: `No specialist referral`.
  * **Waittime**: Uniform range (10–60 mins) used for dataset calibration rather than ground-truth clinical durations.

---

## 7. Real vs. Synthetic Data Specification

> [!IMPORTANT]
> The public dataset provides empirical arrival counts and demographic distributions (Age, Gender, Referral Department). Clinical acuity, ICU requirement, doctor/nurse counts, and length of stay are **synthetically generated** according to explicit simulation rules because public patient-flow datasets omit inpatient operational parameters.

| Field | Origin | Description |
| :--- | :--- | :--- |
| `patient_id` | Real / Synthetic | Unique identifier |
| `arrival_time` | Real Dataset | Timestamp derived from admission date/time |
| `age`, `gender` | Real Dataset | Empirical demographic features |
| `department` | Real Dataset | Referral specialty or `No specialist referral` |
| `urgency` | Synthetic | Acuity tier (1 = Low, 5 = Critical Emergency) |
| `icu_required` | Synthetic | Boolean flag derived from acuity level |
| `or_required` | Synthetic | Boolean flag (higher for Orthopedics/Surgery) |
| `doctor_required` | Synthetic | Integer count (1–3 physicians) |
| `nurse_required` | Synthetic | Integer count (1–4 nurses) |
| `true_duration` | Synthetic | Ground-truth treatment duration (hours/mins) |
| `predicted_duration`| ML Model | Predicted stay duration output by ML model |

### 7.1 Synthetic Generator Simulation Assumptions
1. **Urgency (1–5)**: Higher probability for Cardiology/Neurology and patients age > 70.
2. **ICU Requirement**: Urgency tier 5 has 70% ICU probability; Urgency tier 4 has 40%; Urgency $\le 2$ has 2%.
3. **OR Requirement**: Orthopedics and General Surgery admission-track patients have 55% OR probability; low urgency has 8%.
4. **Staffing Requirements**: ICU/OR patients require 2–3 doctors and 3–4 nurses; regular patients require 1 doctor and 1–2 nurses.
5. **Treatment Duration (`true_duration`)**: Base duration = $120\text{m} + 60\text{m} \times U_i$, plus 360m for ICU and 180m for OR, modulated by log-normal noise $\text{Lognormal}(0, 0.3)$ to ensure positive non-deterministic stay lengths.
6. **Reproducibility**: Parameterized random seed (`seed=42`) guarantees identical patient streams across simulation runs.


---

## 8. Scheduling Policies Compared

1. **FCFS (First-Come, First-Served)**: Allocates resources strictly by arrival timestamp.
2. **Urgency-Only**: Priority determined purely by clinical urgency $U_i$.
3. **Dynamic Priority**: Combines urgency, exponential waiting time aging, and deterioration risk.
4. **MEDFLOW (Resource-Aware Greedy Heuristic)**: Sorts queue by dynamic priority; if highest priority patient is blocked by missing resources (e.g. ICU full), temporarily skips to the next highest priority patient whose required resources are currently available.

---

## 9. Discrete-Event Simulation
Built using a high-performance Python `heapq` event loop processing 5 core event types:
1. `ARRIVAL`: Patient enters IP queue.
2. `ALLOCATE`: Scheduler checks feasibility and locks required resources.
3. `TREATMENT_COMPLETE`: Patient treatment finishes.
4. `RESOURCE_RELEASE`: Allocated resources return to available capacity pool.
5. `DISCHARGE`: Patient exits the system; queue reallocation triggered.

---

## 10. Machine Learning Component
* **Model**: `RandomForestRegressor` / `GradientBoostingRegressor`
* **Input Features**: Age, Department, Urgency, Admission Track
* **Target**: Synthetic ground-truth treatment duration (`true_duration`)
## 10. Machine Learning Component
* **Model**: `RandomForestRegressor(n_estimators=100, random_state=42)`
* **Input Features**: `age`, `urgency`, `is_admission_track`, `icu_required`, `or_required`, one-hot encoded `department`
* **Target**: Synthetic ground-truth stay duration (`true_duration`)
* **Evaluation Metrics**:
  * **MAE**: **99.87 minutes**
  * **$R^2$ Score**: **0.6214** (62.1% variance explained on synthetic ground truth)
* **Integration**: The trained model populates `predicted_duration` for all arriving patients, which is consumed downstream by the discrete-event simulator engine.

> [!NOTE]
> The ML model is trained on synthetic simulation ground truth because public patient-flow datasets omit treatment-duration or clinical-acuity labels required for this operational task.

---

## 11. Operational KPIs Measured
* **Waiting Metrics**: Average Wait Time, P95 Wait Time, Maximum Wait Time.
* **Throughput**: Total Patients Completed, Completion Rate.
* **Resource Utilization**: Bed Occupancy %, ICU Occupancy %, Physician Utilization %.
* **Fairness**: Wait time broken down by Urgency Tier, Starvation Ratio (P95 / Mean Wait).

---

## 12. Mathematical Scenario Experiments

Controlled experiments executed on **identical patient streams ($N=300$, $\text{seed}=42$)** across 3 hospital operational scenarios and 4 scheduling policies:

### Experimental Results Summary (Waiting Time in Minutes)

| Scenario | Policy | Avg Wait | P95 Wait | Max Wait | Starvation Ratio | Primary Bottleneck Observation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Normal** | FCFS | 6,694m | 13,711m | 14,549m | 2.05 | Head-of-line arrival order blocking |
| | Urgency | 10,194m | 16,631m | 17,406m | 1.63 | Low-urgency queue starvation |
| | Dynamic | 10,686m | 17,768m | 19,106m | 1.66 | Aging mitigates low-urgency starvation |
| | **MEDFLOW** | **4,629m** | **13,560m** | 18,261m | 2.93 | **Resource-aware greedy heuristic bypasses blocked ICU patients** |
| **Patient Surge** | FCFS | 7,751m | 15,716m | 16,596m | 2.03 | Arrival frequency surge amplifies queues |
| | Urgency | 11,231m | 17,215m | 17,423m | 1.53 | High acuity prioritized; low acuity delayed |
| | Dynamic | 11,862m | 18,255m | 19,086m | 1.54 | Aging dynamic priority balancing |
| | **MEDFLOW** | **4,924m** | **15,163m** | 18,407m | 3.08 | **Lowest overall average wait time under surge** |
| **ICU Shortage** | FCFS | 9,221m | 19,531m | 20,950m | 2.12 | ICU head-of-line blocking |
| | Urgency | 17,544m | 25,526m | 26,298m | 1.45 | Severe queue blocking behind full ICU beds |
| | Dynamic | 18,337m | 26,703m | 28,041m | 1.46 | Severe queue blocking behind full ICU beds |
| | **MEDFLOW** | **4,528m** | **15,335m** | 23,334m | 3.39 | **>3.8x faster average wait vs Dynamic Priority under ICU bottleneck** |

---

## 13. Repository Structure
```text
MEDFLOW/
├── data/
│   ├── real/          # Empirical dataset & mock generator
│   └── synthetic/     # Generated patient streams
├── backend/
│   ├── models/        # Patient data classes & synthetic generator
│   ├── scheduling/    # Priority functions & MEDFLOW allocator
│   ├── simulation/    # Discrete-event engine (heapq)
│   ├── ml/            # Duration prediction models
│   ├── api/           # FastAPI web endpoints
│   └── utils/         # Data loading & cleaning utilities
├── frontend/          # React + TypeScript dashboard (Phase 6)
├── tests/             # Pytest unit & integration test suite
├── docs/              # Architectural & mathematical documentation
├── requirements.txt   # Python dependency specifications
├── .gitignore
└── README.md
```

---

## 14. Dependencies & Package Specs
* `pandas` ($\ge 2.0.0$): Data manipulation and dataset ingestion.
* `numpy` ($\ge 1.24.0$): Numerical array operations and random distributions.
* `scikit-learn` ($\ge 1.2.0$): Machine learning duration predictor.
* `fastapi` ($\ge 0.100.0$): REST API backend.
* `uvicorn` ($\ge 0.22.0$): ASGI web server.
* `pydantic` ($\ge 2.0.0$): Data validation schemas.
* `pytest` ($\ge 7.0.0$): Automated unit testing framework.

---

## 15. External Resources & Cloned Repositories
* **External Repositories Cloned**: None. All algorithms, data structures, discrete-event simulation engine, and API logic are built custom from scratch.
* **Pretrained Models / Assets**: None.

---

## 16. Installation & Quickstart

```bash
# 1. Clone workspace / navigate to directory
cd MEDFLOW

# 2. Set up Python virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Unix/macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
```

---

## 17. Running Backend, Frontend & Test Suite

```bash
# 1. Run Complete Unit & Stress Test Suite (27/27 Tests)
python -m unittest discover tests

# 2. Launch FastAPI Backend Server (runs on http://127.0.0.1:8000)
python -m uvicorn backend.api.main:app --reload --port 8000

# 3. Launch React Dashboard Frontend (runs on http://localhost:5173)
cd frontend
npm install
npm run dev
```

---

## 18. Limitations & Scope
* MEDFLOW is a research simulation prototype for hospital operations modeling.
* The system evaluates operational trade-offs of scheduling heuristics rather than proving global mathematical optimality.
* Synthetic clinical acuity fields are assigned via heuristic distributions for simulation modeling.

---

## 19. Disclaimer
This software is designed strictly for operations research and educational simulation purposes. It is not intended for direct clinical decision-making or live patient diagnostic workflows.

---

## 20. Credits
Developed for the 24-Hour Hackathon on Hospital Operational Analytics & Optimization.

