import heapq
import copy
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from backend.models.patient import Patient
from backend.scheduling.allocator import ResourcePool, select_next_patient

# Discrete-Event Types
EVENT_ARRIVAL = "ARRIVAL"
EVENT_ALLOCATE = "ALLOCATE"
EVENT_TREATMENT_COMPLETE = "TREATMENT_COMPLETE"
EVENT_DISCHARGE = "DISCHARGE"


class SimulationEngine:
    """
    Discrete-Event Inpatient Hospital Simulator using a high-performance heapq event loop.
    Simulates inpatient patient streams under strict multi-resource constraints.
    """

    def __init__(
        self,
        patients: List[Patient],
        resource_capacities: Optional[Dict[str, int]] = None,
        policy: str = "MEDFLOW",
        use_predicted_duration: bool = False
    ):
        # Deep copy patient list so each simulation run operates on an isolated stream
        self.raw_patients = copy.deepcopy(patients)
        self.resource_pool = ResourcePool(capacities=resource_capacities)
        self.policy = policy.upper()
        self.use_predicted_duration = use_predicted_duration

        # Engine state
        self.current_time: float = 0.0
        self.event_counter: int = 0
        self.event_queue: List[Tuple[float, int, str, Optional[Patient]]] = []

        self.waiting_queue: List[Patient] = []
        self.active_patients: List[Patient] = []
        self.discharged_patients: List[Patient] = []

        # Operational metrics tracking
        self.resource_time_samples: List[Dict[str, Any]] = []

    def _push_event(self, time: float, event_type: str, patient: Optional[Patient] = None):
        """Pushes a new discrete event onto the priority heap."""
        self.event_counter += 1
        heapq.heappush(self.event_queue, (time, self.event_counter, event_type, patient))

    def run(self, max_simulation_time: Optional[float] = None) -> Dict[str, Any]:
        """
        Executes the discrete-event simulation loop until all events complete or max_time is reached.
        """
        # Reset state
        self.current_time = 0.0
        self.event_queue = []
        self.waiting_queue = []
        self.active_patients = []
        self.discharged_patients = []
        self.resource_pool.reset()
        self.resource_time_samples = []

        # Schedule initial ARRIVAL events for all patients
        for patient in self.raw_patients:
            patient.status = "WAITING"
            patient.wait_time = 0.0
            self._push_event(patient.arrival_time, EVENT_ARRIVAL, patient)

        # Discrete-Event Loop
        while self.event_queue:
            time, _, event_type, patient = heapq.heappop(self.event_queue)
            
            if max_simulation_time is not None and time > max_simulation_time:
                break

            self.current_time = time

            # Sample resource occupancy periodically
            self.resource_time_samples.append({
                "time": self.current_time,
                "occupancy": dict(self.resource_pool.occupancy)
            })

            if event_type == EVENT_ARRIVAL:
                self._handle_arrival(patient)
            elif event_type == EVENT_ALLOCATE:
                self._handle_allocate()
            elif event_type == EVENT_TREATMENT_COMPLETE:
                self._handle_treatment_complete(patient)
            elif event_type == EVENT_DISCHARGE:
                self._handle_discharge(patient)

        # Final state sampling & KPI computation
        kpis = self.calculate_kpis()
        return kpis

    def _handle_arrival(self, patient: Patient):
        """Handles patient arrival event."""
        patient.queue_enter_time = self.current_time
        patient.status = "WAITING"
        self.waiting_queue.append(patient)
        
        # Trigger resource allocation attempt
        self._push_event(self.current_time, EVENT_ALLOCATE, None)

    def _handle_allocate(self):
        """Attempts to allocate resources to waiting patients according to scheduling policy."""
        while self.waiting_queue:
            next_patient, bottleneck_reason = select_next_patient(
                self.waiting_queue,
                self.current_time,
                self.resource_pool,
                self.policy
            )

            if next_patient is None:
                # No feasible allocation possible under policy
                break

            # Allocate resources to selected patient
            self.waiting_queue.remove(next_patient)
            self.resource_pool.allocate(next_patient)

            next_patient.service_start_time = self.current_time
            next_patient.wait_time = max(0.0, self.current_time - next_patient.arrival_time)
            
            # Determine treatment stay duration
            if self.use_predicted_duration and next_patient.predicted_duration is not None:
                duration = max(1.0, float(next_patient.predicted_duration))
            else:
                duration = max(1.0, float(next_patient.true_duration))

            next_patient.completion_time = self.current_time + duration
            self.active_patients.append(next_patient)

            # Schedule completion event
            self._push_event(next_patient.completion_time, EVENT_TREATMENT_COMPLETE, next_patient)

    def _handle_treatment_complete(self, patient: Patient):
        """Handles treatment completion event."""
        if patient in self.active_patients:
            self.active_patients.remove(patient)
        self._push_event(self.current_time, EVENT_DISCHARGE, patient)

    def _handle_discharge(self, patient: Patient):
        """Releases patient resources and triggers queue reallocation."""
        self.resource_pool.release(patient)
        self.discharged_patients.append(patient)

        # Trigger reallocation for remaining waiting patients
        self._push_event(self.current_time, EVENT_ALLOCATE, None)

    def calculate_kpis(self) -> Dict[str, Any]:
        """
        Calculates comprehensive operational KPIs:
        - Waiting metrics (Avg, P95, Max)
        - Throughput metrics
        - Resource Utilization %
        - Fairness / Starvation metrics
        """
        total_patients = len(self.raw_patients)
        completed_patients = len(self.discharged_patients)
        
        # Combine wait times from completed + currently waiting/active patients
        all_processed_patients = self.discharged_patients + self.active_patients + self.waiting_queue
        
        waits = [p.wait_time for p in all_processed_patients]
        if not waits:
            waits = [0.0]

        avg_wait = float(np.mean(waits))
        p95_wait = float(np.percentile(waits, 95))
        max_wait = float(np.max(waits))
        min_wait = float(np.min(waits))

        # Starvation Ratio (P95 / Mean Wait)
        starvation_ratio = round(p95_wait / avg_wait, 2) if avg_wait > 0 else 1.0

        # Wait time by urgency tier (1 to 5)
        urgency_waits: Dict[int, List[float]] = {u: [] for u in range(1, 6)}
        for p in all_processed_patients:
            if p.urgency in urgency_waits:
                urgency_waits[p.urgency].append(p.wait_time)

        avg_wait_by_urgency = {
            f"urgency_{u}": round(float(np.mean(urgency_waits[u])), 2) if urgency_waits[u] else 0.0
            for u in range(1, 6)
        }

        # Resource Utilization Calculation over simulation duration
        sim_duration = max(1.0, self.current_time)
        avg_occupancy: Dict[str, float] = {r: 0.0 for r in self.resource_pool.capacities}

        if len(self.resource_time_samples) > 1:
            for i in range(len(self.resource_time_samples) - 1):
                t_start = self.resource_time_samples[i]["time"]
                t_end = self.resource_time_samples[i+1]["time"]
                dt = max(0.0, t_end - t_start)
                occ = self.resource_time_samples[i]["occupancy"]
                for r in avg_occupancy:
                    avg_occupancy[r] += occ.get(r, 0) * dt
            for r in avg_occupancy:
                avg_occupancy[r] /= sim_duration

        utilization_pct = {
            r: round(min(100.0, (avg_occupancy[r] / float(self.resource_pool.capacities[r])) * 100.0), 2)
            if self.resource_pool.capacities[r] > 0 else 0.0
            for r in self.resource_pool.capacities
        }

        return {
            "policy": self.policy,
            "total_patients": total_patients,
            "completed_patients": completed_patients,
            "completion_rate_pct": round((completed_patients / total_patients) * 100.0, 2),
            "total_simulation_time_mins": round(sim_duration, 2),
            "waiting_metrics": {
                "avg_wait_mins": round(avg_wait, 2),
                "p95_wait_mins": round(p95_wait, 2),
                "max_wait_mins": round(max_wait, 2),
                "min_wait_mins": round(min_wait, 2)
            },
            "fairness_metrics": {
                "starvation_ratio": starvation_ratio,
                "avg_wait_by_urgency_mins": avg_wait_by_urgency
            },
            "resource_utilization_pct": utilization_pct,
            "resource_capacities": dict(self.resource_pool.capacities)
        }

