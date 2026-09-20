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
* **Regular Beds**: 120
* **ICU Beds**: 20
* **Doctors**: 35
* **Nurses**: 80
* **Operating Rooms**: 6
* **Ambulances**: 6

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
        Interactive React Dashboard Suite
```

---

## 6. Interactive Visual Dashboard & Graph Features

MEDFLOW features a responsive React + TypeScript frontend suite equipped with a **Collapsible Navigation Sidebar** and **5 Custom SVG Interactive Graphs**:

### 6.1 Left Sidebar Navigation (`App.tsx`)
- **Collapsible Hamburger (`☰`) Toggle**: Smoothly transitions the sidebar between expanded mode (`220px`) and icon-only mode (`64px`), collapsing/expanding the three primary pages: `Operations Overview`, `Patient Queue & Detail`, and `Simulation Lab`.

### 6.2 Page 1: Operations Dashboard
- **Hospital Status Header**: 6 real-time resource utilization cards showing locked vs capacity ratios and utilization progress bars.
- **Graph 1 — Strategy Comparison Bar Chart**: Vertical SVG bar chart comparing Average Wait Time across policies (**FCFS** `#ef4444`, **Urgency Only** `#f97316`, **Dynamic** `#3b82f6`, **MedFlow** `#10b981`), featuring explicit $Y$-axis (`Avg Wait (mins)`) and $X$-axis (`Scheduling Policy`) labels and policy metric cards.
- **Graph 2 — ML Stay Duration Predictor Scatter Plot**: SVG scatter plot with a dashed reference diagonal line ($y = x$) mapping real patient sample stay durations (`true_duration`) vs ML predicted stay durations (`predicted_duration`).
- **Live Triage Patient Stream Table**: Real-time triage stream table displaying Patient ID, Urgency Tier, Department, Predicted vs Actual Wait Time, and Admission Status.

### 6.3 Page 2: Patient & Resource Management
- **Urgency Distribution Summary Cards**: Summary tiles reflecting patient counts across Tier 5 (Critical), Tier 4 (Severe), Tier 2/3 (Medium), and Tier 1 (Low).
- **Search & Filter Controls**: Search bar (ID, Department, Gender) + quick filter buttons (`All`, `Critical & High`, `ICU/OR Lock`).
- **Live Priority Queue Table (Top 10 Ranks)**: Ranked priority queue table capped at **10 ranks** with status badges and required staff indicators.
- **Patient Detail & Priority Breakdown Panel**: Component-level score breakdown ($w_u U_i, w_a A(W_i), w_d D_i$) with progress bars, priority rationale, and dataset wait-time breakdown.
- **Graph 3 — Queue Length Over Time Multi-Line Chart**: Multi-line SVG temporal chart plotting queue trends (`Total`, `Critical`, `High`, `Medium`, `Low`) across simulation hours, with explicit $X$/$Y$ axes, tick marks, and color-coded legend.
- **Graph 4 — Patients Waiting by Urgency Donut Chart**: Uncluttered SVG Donut Chart displaying urgency breakdown percentages alongside total patient count (`27 Total`) and legend list.

### 6.4 Page 3: Simulation & Strategy Lab
- **Scenario Quick-Select Cards**: Interactive scenario buttons (`Normal Baseline`, `Emergency Surge`, `Staff Shortage`, `ICU Constraint`, `Resource Failure`) that immediately apply capacity vectors and run simulations.
- **Configure Hospital Resources Panel (Left Column)**: Single-line stacked vertical list with cyan SVG vector icons for Doctors, Nurses, Regular Beds, ICU Beds, Operating Rooms, Ambulances (no emojis), sliders, and right-aligned numeric count displays.
- **Graph 5 — Strategy Comparison Results (Top Right Corner)**:
  - Metric Selector Tabs (`Avg Wait`, `P95 Wait`, `Throughput`, `LWBS %`).
  - Vertical SVG Bar Chart with explicit $X$/$Y$ axes labels, max height utilization (zero white space), and optimal strategy highlight badges (`Optimal Strategy`, `MedFlow vs FCFS Improvement`).
- **Detailed Strategy Metrics Matrix Table (Full-Width Bottom)**: Full matrix table detailing Average Wait, P95 Wait, Max Wait, Throughput, and LWBS counts/percentages across all 4 policies.

---

## 7. Dataset Description
* **Filename**: `healthcare_analytics_patient_flow_data.csv`
* **Rows**: 9,216 patient records
* **Columns**: 11 attributes
* **Date Range**: January 2023 – December 2024 (579 distinct days)
* **Ingestion & Data Cleaning**:
  * **Mixed Date Formats**: Multi-format parsing (`YYYY-MM-DD`, `MM/DD/YYYY`, `DD-MM-YYYY`).
  * **Gender Normalization**: Repaired corrupted records containing `Femaleemale` $\rightarrow$ `Female`.
  * **Department Referral**: ~58.6% missing values preserved as a legitimate category: `No specialist referral`.

---

## 8. Real vs. Synthetic Data Specification

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

---

## 9. Scheduling Policies Compared

1. **FCFS (First-Come, First-Served)**: Allocates resources strictly by arrival timestamp.
2. **Urgency-Only**: Priority determined purely by clinical urgency $U_i$.
3. **Dynamic Priority**: Combines urgency, exponential waiting time aging, and deterioration risk.
4. **MEDFLOW (Resource-Aware Greedy Heuristic)**: Sorts queue by dynamic priority; if highest priority patient is blocked by missing resources (e.g. ICU full), temporarily skips to the next highest priority patient whose required resources are currently available.

---

## 10. Discrete-Event Simulation
Built using a high-performance Python `heapq` event loop processing 5 core event types:
1. `ARRIVAL`: Patient enters IP queue.
2. `ALLOCATE`: Scheduler checks feasibility and locks required resources.
3. `TREATMENT_COMPLETE`: Patient treatment finishes.
4. `RESOURCE_RELEASE`: Allocated resources return to available capacity pool.
5. `DISCHARGE`: Patient exits the system; queue reallocation triggered.

---

## 11. Machine Learning Component
* **Model**: `RandomForestRegressor(n_estimators=100, random_state=42)`
* **Input Features**: `age`, `urgency`, `is_admission_track`, `icu_required`, `or_required`, one-hot encoded `department`
* **Target**: Synthetic ground-truth stay duration (`true_duration`)
* **Evaluation Metrics**:
  * **MAE**: **18.7 minutes**
  * **$R^2$ Score**: **0.81** (81% variance explained)
* **Integration**: Populates `predicted_duration` for arriving patients, consumed by the discrete-event simulator engine.

---

## 12. Operational KPIs Measured
* **Waiting Metrics**: Average Wait Time, P95 Wait Time, Maximum Wait Time.
* **Throughput**: Total Patients Completed, Completion Rate (patients/hr).
* **Resource Utilization**: Bed Occupancy %, ICU Occupancy %, Physician Utilization %.
* **Fairness**: Wait time broken down by Urgency Tier, Starvation Ratio (P95 / Mean Wait).

---

## 13. API Specification & Endpoints

| Endpoint | Method | Request Payload / Params | Description |
| :--- | :--- | :--- | :--- |
| `/api/status` | `GET` | None | Returns server health, dataset statistics, and baseline capacities. |
| `/api/ml-metrics` | `GET` | None | Returns MAE, $R^2$, feature importances, and model metadata. |
| `/api/simulate` | `POST` | `SimulationRequest` JSON | Executes simulation run for scenario, policy, and patient count. |
| `/api/custom-simulate` | `POST` | `CustomSimulateRequest` JSON | Executes generalized simulation for arbitrary capacity vectors + arrival multipliers. |
| `/api/same-seed-compare`| `POST` | `SameSeedCompareRequest` JSON | Evaluates all 4 policies on one identical seeded patient stream ($N=300$, $\text{seed}=42$). |
| `/api/priority-breakdown/{id}` | `GET` | `current_time` (query param) | Exposes individual weighted priority components ($w_u U_i, w_a A(W_i), w_d D_i$) & rationale. |
| `/api/experiments` | `POST` | `ExperimentRequest` JSON | Executes 5 Scenarios $\times$ 4 Policies controlled experiment matrix. |

---

## 14. Repository Structure
```text
MEDFLOW/
├── data/
│   ├── real/          # Empirical dataset & data loading scripts
│   └── synthetic/     # Generated patient streams
├── backend/
│   ├── models/        # Patient data classes & synthetic generator
│   ├── scheduling/    # Priority functions & MEDFLOW allocator
│   ├── simulation/    # Discrete-event engine (heapq)
│   ├── ml/            # Duration prediction models
│   ├── api/           # FastAPI web endpoints
│   └── utils/         # Data loading & cleaning utilities
├── frontend/          # React + TypeScript visual dashboard
│   ├── src/
│   │   ├── App.tsx    # Multi-page dashboard with SVG graph suite
│   │   └── main.tsx   # React entrypoint
│   └── package.json
├── tests/             # Unit & integration test suite (27 tests)
├── requirements.txt   # Python dependency specifications
└── README.md
```

---

## 15. Quickstart & Execution

```bash
# 1. Set up Python virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Unix/macOS:
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run Unit Test Suite (27/27 Tests)
python -m unittest discover tests

# 4. Launch FastAPI Backend Server (http://127.0.0.1:8000)
python -m uvicorn backend.api.main:app --reload --port 8000

# 5. Launch React Dashboard Frontend (http://localhost:5173)
cd frontend
npm install
npx tsc --noEmit     # TypeScript typecheck
npm run build        # Production Vite build
npm run dev          # Launch dev server
```

---

## 16. Disclaimer
This software is designed strictly for operations research and educational simulation purposes. It is not intended for direct clinical decision-making or live patient diagnostic workflows.

---

## 17. Credits
Developed for the 24-Hour Hackathon on Hospital Operational Analytics & Optimization.
