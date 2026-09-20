# MEDFLOW — Comprehensive System Architecture & Engineering Specification
# MEDFLOW — Technical System Specification

> **System Designation**: MEDFLOW — Mathematical Inpatient (IP) Hospital Resource Simulation & Scheduling Framework  
> **Domain**: Operations Research, Discrete-Event Simulation, Resource-Constrained Optimization, Applied Machine Learning  
> **Target Operation**: Inpatient (IP) Hospital Departments (Regular Beds, ICU Beds, Physicians, Nurses, Operating Rooms, Ambulances)
## 1. Mathematical Priority Scoring
$$\displaystyle P_i(t) = w_u U_i + w_a (1 - e^{-\lambda W_i}) + w_d D_i$$

---
### Monotonicity Proof:
$$\frac{dA}{dW} = \lambda e^{-\lambda W} > 0 \quad (\forall \lambda > 0, W \ge 0)$$

## 1. Executive Summary & Core Objective
## 2. Multi-Resource Capacity Control
For all resource pools $r \in \{\text{regular\_beds}, \text{icu\_beds}, \text{doctors}, \text{nurses}, \text{operating\_rooms}, \text{ambulances}\}$:
$$\sum_{i \in \mathcal{A}(t)} x_{i,r}(t) \le C_r$$

MEDFLOW is a specialized operations research and discrete-event simulation framework designed to model, analyze, and optimize **inpatient hospital resource allocation under uncertain patient arrivals and severe physical/human capacity constraints**.

### The Central Research Question
*Given the exact same patient arrival stream and identical limited hospital resource capacities, how do different mathematical scheduling policies affect patient waiting time, hospital throughput, resource utilization, and operational fairness?*

### Key Operational Innovation
Standard hospital queues suffer from **Head-of-Line (HoL) Queue Blocking**: when the highest-urgency patient requires an exhausted resource (such as an ICU bed), traditional triage queues stall the entire line, leaving empty regular beds and available doctors sitting idle. 

MEDFLOW introduces a **Resource-Aware Greedy Scheduling Heuristic** that dynamically calculates priority scores, detects resource unfeasibility for the top candidate, temporarily bypasses the blocked candidate, and admits downstream feasible patients who require currently available resources. This eliminates head-of-line stalls and reduces average patient waiting times by **>3.8x under severe ICU bottlenecks**.

---

## 2. Architecture Map & End-to-End Data Flow

```text
                                  +---------------------------------------+
                                  |     Empirical Patient Flow Dataset    |
                                  |  (Mixed Dates, Demographics, Acuity)  |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |      Data Loader & Cleaning Module    |
                                  |  (Multi-Format Parsing, Normalizer)   |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |     Synthetic Patient Stream Generator|
                                  | (Seed=42, Acuity, ICU/OR/Staff Needs) |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |       ML Duration Predictor Model     |
                                  |   (RandomForest: MAE ~87m, R²=73.4%)  |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |     Discrete-Event Engine (heapq)     |
                                  | (ARRIVAL, ALLOCATE, COMPLETE, RELEASE)|
                                  +---------------------------------------+
                                                      |
                                      +---------------+---------------+
                                      |                               |
                                      v                               v
                       +-----------------------------+ +-----------------------------+
                       |  Multi-Resource Capacity    | |     4 Scheduling Policies   |
                       |  Constraints & Occupancy    | |  (FCFS, Urgency, Dynamic,   |
                       | (Beds, ICU, MDs, RNs, ORs)  | |          MEDFLOW)         |
                       +-----------------------------+ +-----------------------------+
                                      |                               |
                                      +---------------+---------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |     KPI Computation & Experiment Grid |
                                  | (Wait Times, Throughput, Utilization) |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |    FastAPI Backend & React Dashboard  |
                                  |   (REST JSON Endpoints & Recharts UI) |
                                  +---------------------------------------+
```

---

## 3. Data Foundation & Ingestion Engine

### 3.1 Dual-Schema Ingestion (`backend/utils/data_loader.py`)
The system features a schema-agnostic ingestion engine that automatically ingests and normalizes two distinct CSV formats:

1. **Legacy Patient Flow Format** (11 Columns): `Patient Id`, `Patient Admission Date`, `Patient Admission Time`, `Patient Gender`, `Patient Age`, `Department Referral`, `Patient Admission Flag`, `Patient Waittime`.
2. **Hospital Visit Format** (22 Columns): `Visit ID`, `Patient ID`, `Visit Date`, `Urgency Level`, `Urgency Score`, `Nurse-to-Patient Ratio`, `Specialist Availability`, `Facility Size (Beds)`, `Patient Outcome`, `Total Wait Time (min)`.

### 3.2 Cleaning & Normalization Invariants
* **Mixed-Date Parsing**: Robust multi-format parser handles `YYYY-MM-DD HH:MM:SS`, `MM/DD/YYYY`, `DD-MM-YYYY`, and ISO strings, converting all arrival timestamps to relative simulation minutes ($t=0$).
* **Corrupted String Repair**: Repaired corrupted entries (e.g. `Femaleemale` $\rightarrow$ `Female`).
* **Missing Referral Categorization**: Preserved missing specialist referrals as a legitimate operational category: `No specialist referral`.
* **Empirical Outcome Mapping**: Maps `Patient Outcome == 'Admitted'` to inpatient admission track (`is_admission_track = True`).

---

## 4. Patient Model & Synthetic Acuity Generator

### 4.1 Patient Data Schema (`backend/models/patient.py`)
Each patient in the system is represented by a strictly typed dataclass containing 21 attributes:

* **Identification & Demographics**: `patient_id`, `age`, `gender`, `department`, `is_admission_track`.
* **Timestamps**: `arrival_time` (sim minutes), `arrival_datetime_str`.
* **Clinical & Staffing Requirements**:
  * `urgency` (1 = Low to 5 = Critical Emergency)
  * `icu_required` (Boolean flag)
  * `or_required` (Boolean flag for Operating Room)
  * `doctor_required` (Integer count, 1–3 physicians)
  * `nurse_required` (Integer count, 1–4 nurses)
  * `ambulance_required` (Boolean transport flag)
* **Durations**: `true_duration` (Ground truth in minutes), `predicted_duration` (ML output).
* **Dynamic Lifecycle**: `queue_enter_time`, `service_start_time`, `completion_time`, `wait_time`, `resources_used`, `status` (`WAITING`, `ADMITTED`, `DISCHARGED`).

### 4.2 Synthetic Generator Rules (`backend/models/patient_generator.py`)
* **Urgency Allocation**: Biased toward higher acuity for Cardiology/Neurology referrals and elderly patients ($>70\text{ years}$).
* **ICU Allocation**: Urgency tier 5 has a 70% ICU probability; Urgency tier 4 has 40%; Urgency $\le 2$ has 2%.
* **OR Allocation**: Orthopedics and General Surgery admission-track patients have a 55% OR requirement.
* **Staffing Vectors**: ICU/OR patients lock 2–3 doctors and 3–4 nurses simultaneously; regular patients lock 1 doctor and 1–2 nurses.
* **Stay Duration (`true_duration`)**:
  
  $$\text{true\_duration} = \max\left(30.0, \left(120\text{m} + 60\text{m} \times U_i + 360\text{m} \cdot \mathbf{1}_{\text{ICU}} + 180\text{m} \cdot \mathbf{1}_{\text{OR}}\right) \times \text{Lognormal}(0, 0.3)\right)$$
  
* **Reproducibility**: Parameterized random seed (`seed=42`) guarantees 100% deterministic patient stream generation across experiments.

---

## 5. Mathematical Core & Scheduling Formulations

### 5.1 Dynamic Priority Equation (`backend/scheduling/priority.py`)
To score waiting patients dynamically at time $t$, MEDFLOW implements an aging-augmented priority formulation:

$$P_i(t) = w_u U_i + w_a A(W_i) + w_d D_i$$

Where:
* $U_i = \frac{\text{Urgency}_i}{5.0} \in [0.2, 1.0]$: Normalized clinical urgency.
* $W_i = \max(0, t - \text{arrival\_time}_i)$: Waiting time in queue (minutes).
* $A(W_i) = 1 - e^{-\lambda W_i} \in [0, 1)$: Non-linear exponential aging function.
* $D_i \in [0, 1]$: Clinical deterioration risk index:
  
  $$D_i = \min\left(1.0, \left(0.7 \cdot \frac{U_i}{5.0} + 0.3 \cdot \frac{\text{Age}_i - 18}{80}\right) \times \text{ComplexityMultiplier}\right)$$
  
* $w_u = 0.5, w_a = 0.3, w_d = 0.2$: Priority term weights ($w_u + w_a + w_d = 1.0$).
* $\lambda = 0.01$: Exponential aging rate coefficient.

#### Mathematical Monotonicity Proof
$$\frac{dA}{dW} = \lambda e^{-\lambda W}$$
For all $\lambda > 0$ and $W \ge 0$, $\frac{dA}{dW} > 0$.  
*Consequence*: Patient priority strictly increases with waiting time, ensuring that lower-urgency patients eventually gain sufficient priority to prevent infinite starvation.

### 5.2 Multi-Resource Capacity Constraint Model (`backend/scheduling/allocator.py`)
Hospital capacity is represented as a vector $C = [C_{\text{beds}}, C_{\text{icu}}, C_{\text{docs}}, C_{\text{nurses}}, C_{\text{or}}, C_{\text{amb}}]$.  
At any time $t$, occupied resources $U(t)$ must strictly satisfy:

$$\sum_{i \in \mathcal{A}(t)} x_{i,r}(t) \le C_r, \quad \forall r \in \{\text{RegularBeds}, \text{ICUBeds}, \text{Doctors}, \text{Nurses}, \text{OperatingRooms}, \text{Ambulances}\}$$

Where $\mathcal{A}(t)$ is the set of active inpatients receiving treatment at time $t$, and $x_{i,r}(t)$ is the resource vector required by patient $i$.

### 5.3 Policy Selection Mechanics

1. **FCFS (First-Come, First-Served)**: Sorts queue strictly by arrival timestamp ($-\text{arrival\_time}_i$). Checks head of queue; if infeasible, queue halts (Head-of-Line blocking).
2. **Urgency-Only**: Sorts queue strictly by clinical urgency score ($U_i$). Checks head of queue; if infeasible, queue halts.
3. **Dynamic Priority**: Sorts queue by dynamic priority $P_i(t)$. Checks head of queue; if infeasible, queue halts.
4. **MEDFLOW (Resource-Aware Greedy Heuristic)**:
   * Sorts queue by dynamic priority $P_i(t)$ descending.
   * Iterates candidate patients in priority order.
   * Performs vector feasibility check: $x_{i,r} \le C_r - U_r(t)$ for all required resources.
   * **If candidate is feasible $\rightarrow$ admits candidate immediately.**
   * **If candidate is infeasible (e.g. ICU full) $\rightarrow$ temporarily bypasses candidate and inspects the next highest priority patient whose required resources are available.**

---

## 6. Discrete-Event Simulator Engine (`backend/simulation/engine.py`)

Built using a high-performance Python `heapq` priority queue. Events are ordered by tuple `(timestamp, tiebreaker_counter, event_type, patient)`.

### 6.1 Core Event Types & Lifecycle
1. `ARRIVAL`: Assigns `queue_enter_time`, pushes patient to `waiting_queue`, triggers immediate `ALLOCATE` event.
2. `ALLOCATE`: Invokes policy allocator. For each selected feasible patient:
   * Removes patient from `waiting_queue`.
   * Locks resources in `ResourcePool.allocate(patient)`.
   * Sets `service_start_time = current_time` and `wait_time = current_time - arrival_time`.
   * Computes stay length: `duration = predicted_duration if use_ml else true_duration`.
   * Pushes `TREATMENT_COMPLETE` event at `completion_time = service_start + duration`.
   * Loops until no further allocation is feasible.
3. `TREATMENT_COMPLETE`: Removes patient from active list, schedules immediate `DISCHARGE` event.
4. `RESOURCE_RELEASE`: Executes `ResourcePool.release(patient)` to return locked beds/staff to the pool.
5. `DISCHARGE`: Exits patient to `discharged_patients` list, schedules immediate `ALLOCATE` event to trigger queue reallocation for freed resources.

### 6.2 Operational KPI Metrics Output
* **Waiting Metrics**: Average Wait Time, P95 Wait Time, Maximum Wait Time, Minimum Wait Time.
* **Throughput**: Total Patients Completed, Completion Rate %.
* **Resource Utilization %**: Time-weighted average occupancy divided by resource capacity over total simulation duration:
  
  $$\text{Utilization}_r = \frac{\frac{1}{T} \int_{0}^{T} U_r(t) \, dt}{C_r} \times 100\%$$
  
* **Fairness / Starvation Proxy**:
  * Wait time broken down by Urgency Tier (1 to 5).
  * **Starvation Ratio**: $\frac{\text{P95 Wait}}{\text{Average Wait}}$ (Higher values indicate heavy tail starvation for low-urgency patients).

---

## 7. Machine Learning Component (`backend/ml/duration_model.py`)

* **Model Architecture**: `RandomForestRegressor(n_estimators=100, random_state=42)`
* **Input Features**: `age`, `urgency`, `is_admission_track`, `icu_required`, `or_required`, one-hot encoded `department`.
* **Target Variable**: Synthetic ground-truth stay duration (`true_duration`).
* **Empirical Performance Achieved**:
  * **$R^2$ Score**: **0.7343 (73.4% variance explained)**
  * **MAE (Mean Absolute Error)**: **86.97 minutes (~1.45 hours)**
* **Role in Pipeline**: Generates `predicted_duration` for arriving patients, which is consumed by the simulator engine when `use_predicted_duration=True` is enabled.

---

## 8. Controlled Experiments & Scenario Matrix (`backend/simulation/experiments.py`)

To ensure scientific validity, all policy comparisons are executed on **100% identical resampled patient streams ($N=300/500$, $\text{seed}=42$)**.

### Operational Scenarios
1. **Scenario 1 — Normal**: Baseline steady-state capacity (`Beds=35, ICU=6, Doctors=12, Nurses=20, OR=3, Ambulances=4`, Arrival Multiplier = 8.0x).
2. **Scenario 2 — Patient Surge**: Emergency surge (`Arrival Multiplier = 15.0x`, baseline capacity).
3. **Scenario 3 — ICU Shortage**: Critical ICU bottleneck (`ICU Beds = 2`, baseline capacity).

### Empirical Scenario Results Summary (Waiting Time in Minutes)

| Scenario | Policy | Avg Wait | P95 Wait | Max Wait | Starvation Ratio | Key Operational Finding |
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

## 9. Full Application Stack & Execution Layer

### 9.1 FastAPI REST Backend (`backend/api/main.py`)
* `GET  /api/status`: System online status, dataset calibration stats, baseline capacities.
* `GET  /api/ml-metrics`: Returns RandomForest evaluation metrics (MAE, $R^2$).
* `POST /api/simulate`: Executes single simulation run for requested scenario, policy, and patient count.
* `POST /api/experiments`: Executes complete 3 Scenarios $\times$ 4 Policies controlled experiment grid.

### 9.2 React + TypeScript Dashboard (`frontend/src/App.tsx`)
* **IP Hospital Status Cards**: Displays live occupancy vs capacity bars for Beds, ICU, Doctors, Nurses, ORs, and Ambulances.
* **Control Panel**: Dropdown selectors for Scenario, Policy, and Patient Count slider.
* **KPI Metrics Cards**: Highlights Average Wait, P95 Wait, Max Wait, and Starvation Ratio.
* **Controlled Experiments Matrix**: Interactive comparison grid across all policy/scenario permutations.
* **Inpatient Queue Table**: Live triage queue display (Urgency badges, Department, Wait Time, Status).
* **ML Predictor Panel**: Displays $R^2$ score and MAE metrics.

---

## 10. Verification & Stress Test Suite (`tests/`)

The repository contains **27 unit & integration tests** across 6 test modules:

1. `test_phase1_data.py`: Verifies mixed-date parsing, gender cleanup, referral normalization, and calibration stats.
2. `test_phase2_generator.py`: Verifies patient generation, reproducibility with seed 42, positive durations, and ICU/urgency correlation.
3. `test_phase3_scheduling.py`: Verifies monotonicity derivative $\frac{dA}{dW} > 0$, resource capacity invariants, and MEDFLOW candidate skipping.
4. `test_phase4_simulation.py`: Verifies `heapq` discrete-event execution, 100/500 patient runs, zero negative resources, and KPI calculations.
5. `test_phase5_ml_experiments.py`: Verifies RandomForest training, prediction attachment, experiment grid, and ICU shortage impact.
6. `test_phase6_api_stress.py`: Verifies FastAPI REST endpoints, Zero ICU capacity boundary handling (zero-division safeguards), simultaneous arrivals at $t=0$, and 50.0x arrival surge.

---

## 11. How to Run the Complete Stack

```bash
# 1. Run Complete Test Suite (27/27 Tests Pass)
python -m unittest discover tests

# 2. Launch FastAPI Backend Server (http://127.0.0.1:8000)
python -m uvicorn backend.api.main:app --reload --port 8000

# 3. Launch React Dashboard Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

---

## 12. Architectural Disclaimer & Scope
* MEDFLOW is an operations research and mathematical simulation prototype built for hospital operational modeling.
* It evaluates operational trade-offs across scheduling heuristics under capacity constraints rather than claiming global mathematical optimality.
* No external repositories were cloned for this codebase; all algorithms, discrete-event simulation loops, data loaders, APIs, and React interfaces are built custom from scratch.

## 3. Heuristic Skip Algorithm (MEDFLOW Greedy)
1. Sort waiting queue by $P_i(t)$ descending.
2. If head-of-line candidate $p_1$ cannot lock all required resources $x_{p_1, r}$, evaluate $p_2, p_3, \dots$
3. Allocate resources to first feasible candidate $p_k$ where $\forall r: \text{Available}_r \ge x_{p_k, r}$.
4. Prevents head-of-line resource blocking under bottlenecked conditions (e.g. ICU bed exhaustion).
