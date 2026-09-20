from typing import Dict, List, Optional
from backend.models.patient import Patient
from backend.scheduling.priority import score_patient_for_policy

class ResourcePool:
    """
    Manages hospital resource capacities and occupancy state.
    Strictly enforces Capacity Constraint Invariants: Used_r(t) <= Capacity_r.
    """

    def __init__(self, capacities: Optional[Dict[str, int]] = None):
        # Default baseline hospital capacities (Section 8 parameters)
        default_capacities = {
            "regular_beds": 40,
            "icu_beds": 8,
            "doctors": 12,
            "nurses": 20,
            "operating_rooms": 2,
            "ambulances": 4
        }
        
        self.capacities: Dict[str, int] = capacities if capacities is not None else default_capacities
        self.occupancy: Dict[str, int] = {r: 0 for r in self.capacities}

    def reset(self):
        """Resets resource occupancy to 0."""
        for r in self.occupancy:
            self.occupancy[r] = 0

    def check_invariants(self):
        """Validates invariant: Occupancy <= Capacity for all resource types."""
        for r, cap in self.capacities.items():
            used = self.occupancy.get(r, 0)
            if used < 0:
                raise ValueError(f"Resource invariant violated: {r} occupancy is negative ({used})")
            if used > cap:
                raise ValueError(f"Resource invariant violated: {r} occupancy ({used}) exceeds capacity ({cap})")

    def available(self, resource_name: str) -> int:
        """Returns currently available units for resource_name."""
        cap = self.capacities.get(resource_name, 0)
        used = self.occupancy.get(resource_name, 0)
        return max(0, cap - used)

    def can_allocate(self, patient: Patient) -> bool:
        """
        Feasibility check: Checks if all resources required by patient are currently available.
        """
        # Bed requirement
        if patient.icu_required:
            if self.available("icu_beds") < 1:
                return False
        elif patient.is_admission_track:
            if self.available("regular_beds") < 1:
                return False

        # Staffing requirement
        if self.available("doctors") < patient.doctor_required:
            return False
        if self.available("nurses") < patient.nurse_required:
            return False

        # Facility requirement
        if patient.or_required and self.available("operating_rooms") < 1:
            return False

        # Transport requirement
        if patient.ambulance_required and self.available("ambulances") < 1:
            return False

        return True

    def allocate(self, patient: Patient) -> Dict[str, int]:
        """
        Allocates required resources to patient and updates occupancy.
        Raises RuntimeError if allocation is not feasible.
        """
        if not self.can_allocate(patient):
            raise RuntimeError(f"Cannot allocate resources for patient {patient.patient_id}: Feasibility check failed.")

        allocated: Dict[str, int] = {}

        if patient.icu_required:
            self.occupancy["icu_beds"] += 1
            allocated["icu_beds"] = 1
        elif patient.is_admission_track:
            self.occupancy["regular_beds"] += 1
            allocated["regular_beds"] = 1

        self.occupancy["doctors"] += patient.doctor_required
        allocated["doctors"] = patient.doctor_required

        self.occupancy["nurses"] += patient.nurse_required
        allocated["nurses"] = patient.nurse_required

        if patient.or_required:
            self.occupancy["operating_rooms"] += 1
            allocated["operating_rooms"] = 1

        if patient.ambulance_required:
            self.occupancy["ambulances"] += 1
            allocated["ambulances"] = 1

        patient.resources_used = allocated
        patient.status = "ADMITTED"
        
        # Verify invariants
        self.check_invariants()
        return allocated

    def release(self, patient: Patient):
        """
        Releases resources occupied by patient upon treatment completion / discharge.
        """
        allocated = patient.resources_used
        if not allocated:
            return

        for resource_name, qty in allocated.items():
            if resource_name in self.occupancy:
                self.occupancy[resource_name] = max(0, self.occupancy[resource_name] - qty)

        patient.resources_used = {}
        patient.status = "DISCHARGED"
        
        # Verify invariants
        self.check_invariants()


def select_next_patient(
    queue: List[Patient],
    current_time: float,
    resource_pool: ResourcePool,
    policy: str
) -> Tuple[Optional[Patient], Optional[str]]:
    """
    Selects the next patient from the waiting queue according to the specified policy.
    
    Returns: (selected_patient, bottleneck_reason)
    """
    if not queue:
        return None, None

    pol = policy.upper()

    if pol == "MEDFLOW":
        # MEDFLOW Resource-Aware Greedy Heuristic:
        # Sort queue by dynamic priority score descending.
        # Find the highest priority patient that is resource-feasible.
        # If top priority patient is infeasible, skip and select next feasible patient!
        sorted_queue = sorted(
            queue,
            key=lambda p: score_patient_for_policy(p, current_time, "DYNAMIC"),
            reverse=True
        )

        bottleneck_reason = None
        for patient in sorted_queue:
            if resource_pool.can_allocate(patient):
                return patient, None
            elif bottleneck_reason is None:
                # Capture why the top priority patient was blocked
                if patient.icu_required and resource_pool.available("icu_beds") < 1:
                    bottleneck_reason = "ICU Beds Unavailable"
                elif patient.is_admission_track and resource_pool.available("regular_beds") < 1:
                    bottleneck_reason = "Regular Beds Unavailable"
                elif resource_pool.available("doctors") < patient.doctor_required:
                    bottleneck_reason = "Doctors Unavailable"
                elif resource_pool.available("nurses") < patient.nurse_required:
                    bottleneck_reason = "Nurses Unavailable"
                elif patient.or_required and resource_pool.available("operating_rooms") < 1:
                    bottleneck_reason = "Operating Rooms Unavailable"

        return None, bottleneck_reason

    else:
        # Strict head-of-queue policies (FCFS, Urgency, Dynamic Priority):
        # Sort queue according to policy scoring function.
        # Check ONLY the highest priority patient. If blocked, do not skip.
        sorted_queue = sorted(
            queue,
            key=lambda p: score_patient_for_policy(p, current_time, pol),
            reverse=True
        )

        top_patient = sorted_queue[0]
        if resource_pool.can_allocate(top_patient):
            return top_patient, None
        else:
            # Head-of-line blocking
            reason = "Resource Capacity Constrained (Head-of-Line Blocked)"
            if top_patient.icu_required and resource_pool.available("icu_beds") < 1:
                reason = "ICU Beds Unavailable"
            elif top_patient.is_admission_track and resource_pool.available("regular_beds") < 1:
                reason = "Regular Beds Unavailable"
            return None, reason

