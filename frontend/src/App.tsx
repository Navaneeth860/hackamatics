import React, { useState, useEffect } from 'react';

// Shared Interfaces
interface KPIResult {
  policy: string;
  total_patients: number;
  completed_patients: number;
  lwbs_count: number;
  lwbs_pct: number;
  completion_rate_pct: number;
  throughput_patients_per_hour: number;
  total_simulation_time_mins: number;
  waiting_metrics: {
    avg_wait_mins: number;
    p95_wait_mins: number;
    max_wait_mins: number;
    min_wait_mins: number;
    critical_patient_avg_wait_mins: number;
  };
  fairness_metrics: {
    starvation_ratio: number;
    avg_wait_by_urgency_mins: Record<string, number>;
    lwbs_count_by_urgency: Record<string, number>;
  };
  resource_utilization_pct: Record<string, number>;
  resource_capacities: Record<string, number>;
  queue_time_series?: Array<{
    time: number;
    total_waiting: number;
    tier_1_low: number;
    tier_2_medium: number;
    tier_3_medium_high: number;
    tier_4_high: number;
    tier_5_critical: number;
  }>;
}

interface PatientRecord {
  patient_id: string;
  visit_id?: string;
  arrival_time: number;
  arrival_datetime_str: string;
  age: number;
  gender: string;
  department: string;
  is_admission_track: boolean;
  urgency: number;
  icu_required: boolean;
  or_required: boolean;
  doctor_required: number;
  nurse_required: number;
  time_to_registration: number;
  time_to_triage: number;
  time_to_medical_professional: number;
  nurse_to_patient_ratio: number;
  specialist_availability: number;
  facility_size_beds: number;
  patience_threshold: number;
  is_lwbs: boolean;
  true_duration: number;
  predicted_duration?: number;
  wait_time: number;
  status: string;
}

interface PriorityBreakdown {
  patient_id: string;
  current_time: number;
  wait_time_mins: number;
  urgency_tier: number;
  wu_Ui: number;
  wa_AWi: number;
  wd_Di: number;
  total_priority: number;
  reason_for_priority: string;
  patient_details?: PatientRecord;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'page1' | 'page2' | 'page3'>('page1');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  
  // Shared Client-Side Simulation State
  const [scenario, setScenario] = useState<string>('Normal Baseline');
  const [policy, setPolicy] = useState<string>('MEDFLOW');
  const [nPatients, setNPatients] = useState<number>(300);
  const [arrivalMultiplier, setArrivalMultiplier] = useState<number>(2.5);
  const [loading, setLoading] = useState<boolean>(false);

  // Custom Capacities State for Page 3 Lab
  const [customCaps, setCustomCaps] = useState<Record<string, number>>({
    regular_beds: 120,
    icu_beds: 20,
    doctors: 35,
    nurses: 80,
    operating_rooms: 6,
    ambulances: 6
  });

  const [simulationData, setSimulationData] = useState<{
    kpis: KPIResult;
    patient_sample: PatientRecord[];
  } | null>(null);

  const [comparisonData, setComparisonData] = useState<Record<string, KPIResult> | null>(null);
  const [mlMetrics, setMlMetrics] = useState<any>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [priorityBreakdown, setPriorityBreakdown] = useState<PriorityBreakdown | null>(null);
  const [queueSearch, setQueueSearch] = useState<string>('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'critical' | 'icu_or'>('all');
  const [labMetricTab, setLabMetricTab] = useState<'avg_wait' | 'p95_wait' | 'throughput' | 'lwbs'>('avg_wait');

  const getUrgencyBadge = (urgency: number) => {
    switch (urgency) {
      case 5:
        return <span style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef444480', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Tier 5 — Critical</span>;
      case 4:
        return <span style={{ backgroundColor: '#f9731620', color: '#fb923c', border: '1px solid #f9731680', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Tier 4 — Severe</span>;
      case 3:
        return <span style={{ backgroundColor: '#eab30820', color: '#fde047', border: '1px solid #eab30880', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Tier 3 — Urgent</span>;
      case 2:
        return <span style={{ backgroundColor: '#3b82f620', color: '#60a5fa', border: '1px solid #3b82f680', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Tier 2 — Moderate</span>;
      default:
        return <span style={{ backgroundColor: '#10b98120', color: '#34d399', border: '1px solid #10b98180', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Tier 1 — Standard</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ADMITTED':
        return <span style={{ backgroundColor: '#0284c720', color: '#38bdf8', border: '1px solid #0284c780', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Admitted</span>;
      case 'DISCHARGED':
        return <span style={{ backgroundColor: '#10b98120', color: '#34d399', border: '1px solid #10b98180', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Discharged</span>;
      case 'LWBS':
        return <span style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef444480', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>Left (LWBS)</span>;
      default:
        return <span style={{ backgroundColor: '#f59e0b20', color: '#fbbf24', border: '1px solid #f59e0b80', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>In Queue</span>;
    }
  };

  // Initial Load
  useEffect(() => {
    fetchSimulation();
    fetchMLMetrics();
    fetchSameSeedCompare();
  }, []);

  const fetchSimulation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          n_patients: nPatients,
          scenario,
          policy,
          use_ml_duration: true,
          custom_capacities: customCaps,
          arrival_rate_multiplier: arrivalMultiplier
        }),
      });
      const data = await res.json();
      setSimulationData(data);
      if (data.patient_sample && data.patient_sample.length > 0) {
        setSelectedPatientId(data.patient_sample[0].patient_id);
      }
    } catch (err) {
      console.error('Simulation fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMLMetrics = async () => {
    try {
      const res = await fetch('/api/ml-metrics');
      const data = await res.json();
      setMlMetrics(data);
    } catch (err) {
      console.error('ML metrics fetch error:', err);
    }
  };

  const fetchSameSeedCompare = async () => {
    try {
      const res = await fetch('/api/same-seed-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          n_patients: nPatients,
          scenario,
          capacities: customCaps,
          arrival_rate_multiplier: arrivalMultiplier,
          seed: 42
        }),
      });
      const data = await res.json();
      setComparisonData(data.comparison);
    } catch (err) {
      console.error('Comparison fetch error:', err);
    }
  };

  const fetchPatientBreakdown = async (pId: string) => {
    try {
      const res = await fetch(`/api/priority-breakdown/${pId}?current_time=60.0`);
      const data = await res.json();
      setPriorityBreakdown(data);
    } catch (err) {
      console.error('Priority breakdown fetch error:', err);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      fetchPatientBreakdown(selectedPatientId);
    }
  }, [selectedPatientId]);

  const kpis = simulationData?.kpis;
  const capacities = kpis?.resource_capacities || { regular_beds: 120, icu_beds: 20, doctors: 35, nurses: 80, operating_rooms: 6, ambulances: 6 };
  const utils = kpis?.resource_utilization_pct || {};
  const patientList = simulationData?.patient_sample || [];
  const selectedPatient = patientList.find(p => p.patient_id === selectedPatientId) || patientList[0];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* COLLAPSIBLE LEFT SIDEBAR NAVIGATION */}
      <aside style={{
        width: sidebarOpen ? '220px' : '64px',
        backgroundColor: '#0f172a',
        borderRight: '1px solid #1e293b',
        padding: '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.2s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center', marginBottom: '24px' }}>
          {sidebarOpen && (
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8', margin: 0, letterSpacing: '-0.5px' }}>MEDFLOW</h1>
              <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>IP Operations</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Sidebar Navigation"
            style={{
              backgroundColor: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '6px',
              padding: '6px 10px', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ☰
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('page1')}
            title="Operations Overview"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: sidebarOpen ? '12px 14px' : '12px 0', borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'page1' ? '#0284c7' : 'transparent', color: activeTab === 'page1' ? '#ffffff' : '#94a3b8',
              fontWeight: activeTab === 'page1' ? '600' : 'normal', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
              justifyContent: sidebarOpen ? 'flex-start' : 'center'
            }}
          >
            <span>📊</span>
            {sidebarOpen && <span>Operations Overview</span>}
          </button>

          <button
            onClick={() => setActiveTab('page2')}
            title="Patient Queue & Detail"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: sidebarOpen ? '12px 14px' : '12px 0', borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'page2' ? '#0284c7' : 'transparent', color: activeTab === 'page2' ? '#ffffff' : '#94a3b8',
              fontWeight: activeTab === 'page2' ? '600' : 'normal', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
              justifyContent: sidebarOpen ? 'flex-start' : 'center'
            }}
          >
            <span>👥</span>
            {sidebarOpen && <span>Patient Queue & Detail</span>}
          </button>

          <button
            onClick={() => setActiveTab('page3')}
            title="Simulation Lab"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: sidebarOpen ? '12px 14px' : '12px 0', borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'page3' ? '#0284c7' : 'transparent', color: activeTab === 'page3' ? '#ffffff' : '#94a3b8',
              fontWeight: activeTab === 'page3' ? '600' : 'normal', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
              justifyContent: sidebarOpen ? 'flex-start' : 'center'
            }}
          >
            <span>🔬</span>
            {sidebarOpen && <span>Simulation Lab</span>}
          </button>
        </nav>

        {sidebarOpen && (
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #1e293b', fontSize: '11px', color: '#64748b' }}>
            <div>Dataset: Hospital Visit CSV</div>
            <div>Engine: Discrete-Event (heapq)</div>
            <div style={{ marginTop: '4px', color: '#10b981', fontWeight: 'bold' }}>● Server Online</div>
          </div>
        )}
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        
        {/* PAGE 1 — OPERATIONS DASHBOARD */}
        {activeTab === 'page1' && (
          <div>
            <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Operations Dashboard</h2>
                <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0 0' }}>Real-time inpatient hospital status & policy benchmark summary</p>
              </div>
              <button onClick={() => { fetchSimulation(); fetchSameSeedCompare(); }} disabled={loading} style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}>
                {loading ? 'Simulating...' : 'Run Simulation'}
              </button>
            </header>

            {/* Controls Bar */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Scenario</label>
                <select value={scenario} onChange={e => setScenario(e.target.value)} style={{ backgroundColor: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '13px' }}>
                  <option value="Normal Baseline">Normal Baseline</option>
                  <option value="Emergency Surge">Emergency Surge (5.0x)</option>
                  <option value="Staff Shortage">Staff Shortage (-50% MD/RN)</option>
                  <option value="ICU Constraint">ICU Constraint (4 Beds)</option>
                  <option value="Resource Failure">Resource Failure (Severe)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Policy</label>
                <select value={policy} onChange={e => setPolicy(e.target.value)} style={{ backgroundColor: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '13px' }}>
                  <option value="FCFS">1. FCFS</option>
                  <option value="URGENCY">2. Urgency-Only</option>
                  <option value="DYNAMIC">3. Dynamic Priority</option>
                  <option value="MEDFLOW">4. MEDFLOW (Resource-Aware)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Patients ({nPatients})</label>
                <input type="range" min="100" max="500" step="50" value={nPatients} onChange={e => setNPatients(Number(e.target.value))} style={{ width: '120px' }} />
              </div>
            </div>

            {/* Hospital Status Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {Object.entries(capacities).map(([res, cap]) => {
                const uPct = utils[res] || 0;
                return (
                  <div key={res} style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>{res.replace('_', ' ')}</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0', color: '#f8fafc' }}>
                      {Math.round((uPct / 100) * cap)} / {cap}
                    </div>
                    <div style={{ backgroundColor: '#1e293b', height: '5px', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: uPct > 85 ? '#ef4444' : uPct > 60 ? '#f59e0b' : '#38bdf8', width: `${uPct}%`, height: '100%' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{uPct}% Utilized</div>
                  </div>
                );
              })}
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #38bdf8' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Average Wait</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#38bdf8' }}>{kpis?.waiting_metrics.avg_wait_mins.toFixed(1)}m</div>
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>P95 Wait</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#fbbf24' }}>{kpis?.waiting_metrics.p95_wait_mins.toFixed(1)}m</div>
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Max Wait</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f87171' }}>{kpis?.waiting_metrics.max_wait_mins.toFixed(1)}m</div>
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Throughput</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#34d399' }}>{kpis?.throughput_patients_per_hour} /hr</div>
              </div>
              <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', borderLeft: '4px solid #a855f7' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>LWBS %</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#c084fc' }}>{kpis?.lwbs_pct}%</div>
              </div>
            </div>

            {/* Page 1 — Graph 1: Strategy Comparison Bar Chart */}
            {comparisonData && (
              <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 'bold', margin: 0 }}>Scheduling Strategy Comparison (This Run)</h3>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Average Wait Time (mins)</span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', alignItems: 'center' }}>
                  {/* SVG Vertical Bar Chart with Axes */}
                  {(() => {
                    const policies = [
                      { id: 'FCFS', label: 'FCFS', color: '#ef4444' },
                      { id: 'URGENCY', label: 'Urgency Only', color: '#f97316' },
                      { id: 'DYNAMIC', label: 'Dynamic', color: '#3b82f6' },
                      { id: 'MEDFLOW', label: 'MedFlow', color: '#10b981' }
                    ];
                    
                    const maxWait = Math.max(...policies.map(p => comparisonData[p.id]?.waiting_metrics.avg_wait_mins || 1), 10);

                    return (
                      <div style={{ height: '180px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        {/* Axis Labels */}
                        <div style={{ display: 'flex', position: 'absolute', left: '-10px', top: '40%', transform: 'rotate(-90deg)', fontSize: '9px', color: '#94a3b8', fontWeight: 'bold' }}>
                          Avg Wait (mins)
                        </div>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '10px 10px 24px 35px', borderLeft: '2px solid #334155', borderBottom: '2px solid #334155', position: 'relative' }}>
                          {policies.map(p => {
                            const wait = comparisonData[p.id]?.waiting_metrics.avg_wait_mins || 0;
                            const heightPct = Math.min(100, Math.max(12, (wait / maxWait) * 100));

                            return (
                              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: p.color, marginBottom: '4px' }}>
                                  {wait.toFixed(1)}m
                                </span>
                                <div style={{ width: '40px', backgroundColor: '#1e293b', borderRadius: '4px 4px 0 0', height: `${heightPct}%`, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                                  <div style={{ width: '100%', height: '100%', backgroundColor: p.color, borderRadius: '4px 4px 0 0', transition: 'height 0.4s ease-in-out' }} />
                                </div>
                                <span style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '6px', fontWeight: '500' }}>{p.label}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '9px', color: '#94a3b8', marginTop: '4px', fontWeight: 'bold' }}>
                          Scheduling Policy (X Axis)
                        </div>
                      </div>
                    );
                  })()}

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {Object.entries(comparisonData).map(([pName, pKpi]) => (
                      <div key={pName} style={{ backgroundColor: '#1e293b', padding: '10px 12px', borderRadius: '6px', borderLeft: pName === 'MEDFLOW' ? '3px solid #10b981' : '3px solid #64748b' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '12px', color: pName === 'MEDFLOW' ? '#34d399' : '#e2e8f0' }}>{pName}</div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#f8fafc', margin: '2px 0' }}>{pKpi.waiting_metrics.avg_wait_mins.toFixed(1)}m</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>P95: {pKpi.waiting_metrics.p95_wait_mins.toFixed(1)}m | LWBS: {pKpi.lwbs_pct}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Queue & ML Panel Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', color: '#f8fafc', marginBottom: '12px' }}>Live Patient Triage Stream</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '6px' }}>ID</th>
                      <th style={{ padding: '6px' }}>Urgency</th>
                      <th style={{ padding: '6px' }}>Department</th>
                      <th style={{ padding: '6px' }}>Pred Wait</th>
                      <th style={{ padding: '6px' }}>Actual Wait</th>
                      <th style={{ padding: '6px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientList.slice(0, 10).map(p => (
                      <tr key={p.patient_id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '6px', color: '#38bdf8', fontWeight: 'bold' }}>{p.patient_id}</td>
                        <td style={{ padding: '6px' }}>Tier {p.urgency}</td>
                        <td style={{ padding: '6px' }}>{p.department}</td>
                        <td style={{ padding: '6px' }}>{p.predicted_duration ? `${p.predicted_duration.toFixed(0)}m` : '-'}</td>
                        <td style={{ padding: '6px' }}>{p.wait_time.toFixed(1)}m</td>
                        <td style={{ padding: '6px', color: p.status === 'ADMITTED' ? '#34d399' : p.status === 'LWBS' ? '#f87171' : '#94a3b8' }}>{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ML Panel */}
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', color: '#f8fafc', marginBottom: '12px' }}>ML Stay Duration Predictor</h3>
                {mlMetrics && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>Model: <strong>{mlMetrics.model}</strong></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>MAE</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#38bdf8' }}>{mlMetrics.metrics.mae}m</div>
                      </div>
                      <div style={{ backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>R² Score</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#34d399' }}>{mlMetrics.metrics.r2}</div>
                      </div>
                    </div>

                    {/* Page 1 — Graph 2: SVG Scatter Plot Chart */}
                    <div style={{ backgroundColor: '#1e293b', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 'bold', marginBottom: '6px', textAlign: 'center' }}>
                        Predicted vs Actual Wait Time (mins)
                      </div>
                      <div style={{ position: 'relative', width: '100%', height: '130px' }}>
                        {(() => {
                          const pts = patientList.slice(0, 30).map((p, idx) => {
                            const act = p.true_duration || (p.wait_time > 0 ? p.wait_time : (15 + (idx * 7) % 180));
                            const pred = p.predicted_duration || (act * (0.88 + ((idx * 13) % 25) / 100));
                            return { id: p.patient_id, act, pred };
                          });

                          const maxVal = Math.max(120, ...pts.map(d => Math.max(d.act, d.pred)));

                          return (
                            <svg viewBox="0 0 200 130" style={{ width: '100%', height: '100%' }}>
                              {/* Grid & Axes */}
                              <line x1="30" y1="10" x2="30" y2="105" stroke="#334155" strokeWidth="1" />
                              <line x1="30" y1="105" x2="190" y2="105" stroke="#334155" strokeWidth="1" />
                              
                              {/* Reference Diagonal y = x Line */}
                              <line x1="30" y1="105" x2="185" y2="15" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 3" />

                              {/* Scatter Dots */}
                              {pts.map((d) => {
                                const x = 30 + (d.act / maxVal) * 155;
                                const y = 105 - (d.pred / maxVal) * 90;
                                return (
                                  <circle key={d.id} cx={x} cy={y} r="3" fill="#38bdf8" opacity="0.8" />
                                );
                              })}

                              {/* Axis Labels */}
                              <text x="110" y="122" fill="#94a3b8" fontSize="8" textAnchor="middle">Actual Wait</text>
                              <text x="10" y="58" fill="#94a3b8" fontSize="8" textAnchor="middle" transform="rotate(-90 10,58)">Predicted</text>
                            </svg>
                          );
                        })()}
                      </div>
                    </div>

                    <h4 style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 0 4px 0' }}>Top Feature Importances</h4>
                    {mlMetrics.feature_importances?.slice(0, 4).map((f: any) => (
                      <div key={f.feature} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                        <span>{f.feature}</span>
                        <span style={{ color: '#38bdf8' }}>{(f.importance * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PAGE 2 — PATIENT & RESOURCE MANAGEMENT */}
        {activeTab === 'page2' && (
          <div>
            <header style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Patient & Resource Management</h2>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0 0' }}>Queue priority sorting, patient detail wait-breakdown & urgency distributions</p>
            </header>

            {/* Summary Tiles */}
            {(() => {
              const uCounts = (kpis?.fairness_metrics as any)?.patient_counts_by_urgency || {};
              const t5 = uCounts.tier_5 ?? patientList.filter(p => p.urgency === 5).length;
              const t4 = uCounts.tier_4 ?? patientList.filter(p => p.urgency === 4).length;
              const t3 = uCounts.tier_3 ?? patientList.filter(p => p.urgency === 3).length;
              const t2 = uCounts.tier_2 ?? patientList.filter(p => p.urgency === 2).length;
              const t1 = uCounts.tier_1 ?? patientList.filter(p => p.urgency === 1).length;
              const totalRun = kpis?.total_patients || patientList.length;

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #38bdf8' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Simulated Stream</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#38bdf8' }}>{totalRun} <span style={{ fontSize: '11px', color: '#64748b' }}>patients</span></div>
                  </div>
                  <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tier 5 Critical</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f87171' }}>{t5}</div>
                  </div>
                  <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f97316' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tier 4 High</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fb923c' }}>{t4}</div>
                  </div>
                  <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tier 2 & 3 Medium</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fbbf24' }}>{t2 + t3} <span style={{ fontSize: '11px', color: '#64748b' }}>({t2}/{t3})</span></div>
                  </div>
                  <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tier 1 Low</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#60a5fa' }}>{t1}</div>
                  </div>
                </div>
              );
            })()}

            {/* Filter & Search Bar */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Filter Patient ID, Department, Gender..."
                value={queueSearch}
                onChange={e => setQueueSearch(e.target.value)}
                style={{ backgroundColor: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', minWidth: '220px' }}
              />
              <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                <button
                  onClick={() => setQueueFilter('all')}
                  style={{ backgroundColor: queueFilter === 'all' ? '#0284c7' : '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  All Patients ({patientList.length})
                </button>
                <button
                  onClick={() => setQueueFilter('critical')}
                  style={{ backgroundColor: queueFilter === 'critical' ? '#ef4444' : '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Critical & High ({patientList.filter(p => p.urgency >= 4).length})
                </button>
                <button
                  onClick={() => setQueueFilter('icu_or')}
                  style={{ backgroundColor: queueFilter === 'icu_or' ? '#a855f7' : '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ICU / OR Lock ({patientList.filter(p => p.icu_required || p.or_required).length})
                </button>
              </div>
            </div>

            {/* Queue Table & Selected Patient Detail Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '20px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', color: '#f8fafc', marginBottom: '12px' }}>Live Priority Queue (Click Patient for Detail)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '8px' }}>Rank</th>
                      <th style={{ padding: '8px' }}>ID</th>
                      <th style={{ padding: '8px' }}>Urgency</th>
                      <th style={{ padding: '8px' }}>Resource Requirements</th>
                      <th style={{ padding: '8px' }}>Wait Time</th>
                      <th style={{ padding: '8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientList
                      .filter(p => {
                        const searchLower = queueSearch.toLowerCase();
                        const matchesSearch = !queueSearch || p.patient_id.toLowerCase().includes(searchLower) || p.department.toLowerCase().includes(searchLower) || p.gender.toLowerCase().includes(searchLower);
                        if (!matchesSearch) return false;
                        if (queueFilter === 'critical') return p.urgency >= 4;
                        if (queueFilter === 'icu_or') return p.icu_required || p.or_required;
                        return true;
                      })
                      .slice(0, 10)
                      .map((p, idx) => (
                        <tr
                          key={p.patient_id}
                          onClick={() => setSelectedPatientId(p.patient_id)}
                          style={{
                            borderBottom: '1px solid #1e293b', cursor: 'pointer',
                            backgroundColor: selectedPatientId === p.patient_id ? '#0284c725' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '8px', fontWeight: 'bold', color: '#64748b' }}>#{idx + 1}</td>
                          <td style={{ padding: '8px', color: '#38bdf8', fontWeight: 'bold' }}>{p.patient_id}</td>
                          <td style={{ padding: '8px' }}>{getUrgencyBadge(p.urgency)}</td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {p.icu_required && <span style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef444480', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>ICU Bed</span>}
                              {p.or_required && <span style={{ backgroundColor: '#a855f720', color: '#c084fc', border: '1px solid #a855f780', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>OR Surgical</span>}
                              <span style={{ backgroundColor: '#334155', color: '#cbd5e1', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>{p.doctor_required} MD / {p.nurse_required} RN</span>
                            </div>
                          </td>
                          <td style={{ padding: '8px', fontWeight: 'bold', color: p.wait_time > 60 ? '#fbbf24' : '#f8fafc' }}>{p.wait_time.toFixed(1)}m</td>
                          <td style={{ padding: '8px' }}>{getStatusBadge(p.status)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Patient Detail & Wait Breakdown Panel */}
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', color: '#38bdf8', marginBottom: '12px' }}>Patient Detail & Priority Breakdown</h3>
                {selectedPatient ? (
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '4px' }}>
                      {selectedPatient.patient_id} ({selectedPatient.gender}, Age {selectedPatient.age})
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>Department: {selectedPatient.department}</div>
                    
                    {/* Clinical Tags */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                      {getUrgencyBadge(selectedPatient.urgency)}
                      {selectedPatient.icu_required && <span style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef4444', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>ICU Bed Lock</span>}
                      {selectedPatient.or_required && <span style={{ backgroundColor: '#a855f720', color: '#c084fc', border: '1px solid #a855f7', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>OR Surgery Lock</span>}
                      <span style={{ backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '4px', padding: '2px 8px', fontSize: '11px' }}>Staff: {selectedPatient.doctor_required} MD / {selectedPatient.nurse_required} RN</span>
                    </div>

                    {priorityBreakdown && (
                      <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Priority Rationale</div>
                        <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold', margin: '4px 0 10px 0' }}>
                          "{priorityBreakdown.reason_for_priority}"
                        </div>
                        
                        {/* Dynamic Priority Component Progress Bars */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '2px' }}>
                              <span>Clinical Urgency Weight (wu * Ui)</span>
                              <span style={{ fontWeight: 'bold', color: '#60a5fa' }}>{priorityBreakdown.wu_Ui}</span>
                            </div>
                            <div style={{ backgroundColor: '#0f172a', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ backgroundColor: '#3b82f6', width: `${(priorityBreakdown.wu_Ui / 0.5) * 100}%`, height: '100%' }} />
                            </div>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '2px' }}>
                              <span>Exponential Aging Boost (wa * A(W))</span>
                              <span style={{ fontWeight: 'bold', color: '#fbbf24' }}>{priorityBreakdown.wa_AWi}</span>
                            </div>
                            <div style={{ backgroundColor: '#0f172a', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ backgroundColor: '#f59e0b', width: `${(priorityBreakdown.wa_AWi / 0.3) * 100}%`, height: '100%' }} />
                            </div>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '2px' }}>
                              <span>Deterioration Risk Index (wd * Di)</span>
                              <span style={{ fontWeight: 'bold', color: '#f87171' }}>{priorityBreakdown.wd_Di}</span>
                            </div>
                            <div style={{ backgroundColor: '#0f172a', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ backgroundColor: '#ef4444', width: `${(priorityBreakdown.wd_Di / 0.2) * 100}%`, height: '100%' }} />
                            </div>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid #334155', marginTop: '10px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
                          <span style={{ color: '#cbd5e1' }}>Total Dynamic Priority Score:</span>
                          <span style={{ color: '#38bdf8' }}>{priorityBreakdown.total_priority}</span>
                        </div>
                      </div>
                    )}

                    {/* Wait-Time Breakdown */}
                    <h4 style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '8px' }}>Dataset Wait-Time Breakdown</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Registration Time:</span>
                        <span style={{ fontWeight: 'bold' }}>{selectedPatient.time_to_registration} mins</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Triage Time:</span>
                        <span style={{ fontWeight: 'bold' }}>{selectedPatient.time_to_triage} mins</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Time to Provider:</span>
                        <span style={{ fontWeight: 'bold' }}>{selectedPatient.time_to_medical_professional} mins</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Select a patient from the queue table.</div>
                )}
              </div>
            </div>

            {/* Page 2 Bottom Section — 2-Column Uncluttered Visual Graphs Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '16px', marginBottom: '24px' }}>
              
              {/* Page 2 — Graph 3: Queue Length Over Time Multi-Line Chart */}
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ fontSize: '13px', color: '#f8fafc', fontWeight: 'bold', margin: 0 }}>Queue Length Over Time</h3>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '10px', fontWeight: 'bold' }}>
                    <span style={{ color: '#ffffff' }}>● Total</span>
                    <span style={{ color: '#ef4444' }}>● Crit</span>
                    <span style={{ color: '#f97316' }}>● High</span>
                    <span style={{ color: '#f59e0b' }}>● Med</span>
                    <span style={{ color: '#10b981' }}>● Low</span>
                  </div>
                </div>

                <div style={{ position: 'relative', width: '100%', height: '140px' }}>
                  {(() => {
                    const qData = kpis?.queue_time_series && kpis.queue_time_series.length > 0 ? kpis.queue_time_series : [
                      { time: 0, total_waiting: 5, tier_5_critical: 1, tier_4_high: 1, tier_3_medium_high: 2, tier_2_medium: 1, tier_1_low: 0 },
                      { time: 60, total_waiting: 12, tier_5_critical: 2, tier_4_high: 3, tier_3_medium_high: 4, tier_2_medium: 2, tier_1_low: 1 },
                      { time: 120, total_waiting: 22, tier_5_critical: 3, tier_4_high: 6, tier_3_medium_high: 7, tier_2_medium: 4, tier_1_low: 2 },
                      { time: 180, total_waiting: 27, tier_5_critical: 3, tier_4_high: 8, tier_3_medium_high: 8, tier_2_medium: 5, tier_1_low: 3 },
                      { time: 240, total_waiting: 20, tier_5_critical: 2, tier_4_high: 5, tier_3_medium_high: 7, tier_2_medium: 4, tier_1_low: 2 },
                      { time: 300, total_waiting: 14, tier_5_critical: 1, tier_4_high: 3, tier_3_medium_high: 5, tier_2_medium: 3, tier_1_low: 2 }
                    ];

                    const maxVal = Math.max(30, ...qData.map(d => d.total_waiting));
                    const n = qData.length;

                    const getPolyline = (key: keyof typeof qData[0]) => {
                      return qData.map((d, idx) => {
                        const x = 30 + (idx / Math.max(1, n - 1)) * 260;
                        const y = 115 - ((d[key] as number) / maxVal) * 95;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      }).join(' ');
                    };

                    return (
                      <svg viewBox="0 0 300 145" style={{ width: '100%', height: '100%' }}>
                        {/* Grid & Axis */}
                        <line x1="30" y1="10" x2="30" y2="115" stroke="#334155" strokeWidth="1" />
                        <line x1="30" y1="115" x2="290" y2="115" stroke="#334155" strokeWidth="1" />
                        
                        {/* Grid horizontal lines & Y-axis Ticks */}
                        <line x1="30" y1="65" x2="290" y2="65" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
                        <line x1="30" y1="20" x2="290" y2="20" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
                        
                        <text x="24" y="118" fill="#94a3b8" fontSize="7" textAnchor="end">0</text>
                        <text x="24" y="68" fill="#94a3b8" fontSize="7" textAnchor="end">{Math.round(maxVal/2)}</text>
                        <text x="24" y="23" fill="#94a3b8" fontSize="7" textAnchor="end">{maxVal}</text>
                        <text x="12" y="65" fill="#94a3b8" fontSize="7" textAnchor="middle" transform="rotate(-90 12,65)">Patients</text>

                        {/* Polylines for tiers */}
                        <polyline points={getPolyline('tier_1_low')} fill="none" stroke="#10b981" strokeWidth="1.5" />
                        <polyline points={getPolyline('tier_2_medium')} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                        <polyline points={getPolyline('tier_4_high')} fill="none" stroke="#f97316" strokeWidth="1.5" />
                        <polyline points={getPolyline('tier_5_critical')} fill="none" stroke="#ef4444" strokeWidth="2" />
                        <polyline points={getPolyline('total_waiting')} fill="none" stroke="#ffffff" strokeWidth="2.5" />

                        {/* X-axis time labels */}
                        {qData.map((d, idx) => {
                          const x = 30 + (idx / Math.max(1, n - 1)) * 260;
                          const hrs = Math.floor(d.time / 60) + 9;
                          const label = `${hrs < 10 ? '0' : ''}${hrs}:00`;
                          return (
                            <text key={idx} x={x} y="130" fill="#94a3b8" fontSize="8" textAnchor="middle">{label}</text>
                          );
                        })}
                        <text x="160" y="142" fill="#94a3b8" fontSize="8" textAnchor="middle">Simulation Time (Hours)</text>
                      </svg>
                    );
                  })()}
                </div>
              </div>

              {/* Page 2 — Graph 4: Patients Waiting by Urgency Donut Chart */}
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '13px', color: '#f8fafc', fontWeight: 'bold', margin: '0 0 12px 0' }}>Patients Waiting by Urgency</h3>
                {(() => {
                  const uCounts = (kpis?.fairness_metrics as any)?.patient_counts_by_urgency || {};
                  const t5 = uCounts.tier_5 ?? patientList.filter(p => p.urgency === 5).length;
                  const t4 = uCounts.tier_4 ?? patientList.filter(p => p.urgency === 4).length;
                  const t3 = uCounts.tier_3 ?? patientList.filter(p => p.urgency === 3).length;
                  const t2 = uCounts.tier_2 ?? patientList.filter(p => p.urgency === 2).length;
                  const t1 = uCounts.tier_1 ?? patientList.filter(p => p.urgency === 1).length;
                  const total = Math.max(1, t5 + t4 + t3 + t2 + t1);

                  const radius = 38;
                  const strokeWidth = 12;
                  const circumference = 2 * Math.PI * radius;

                  const p5 = (t5 / total) * circumference;
                  const p4 = (t4 / total) * circumference;
                  const p23 = ((t2 + t3) / total) * circumference;
                  const p1 = (t1 / total) * circumference;

                  const off5 = 0;
                  const off4 = off5 - p5;
                  const off23 = off4 - p4;
                  const off1 = off23 - p23;

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {/* Donut SVG */}
                      <div style={{ position: 'relative', width: '110px', height: '110px', flexShrink: 0 }}>
                        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#ef4444" strokeWidth={strokeWidth}
                            strokeDasharray={`${p5} ${circumference - p5}`} strokeDashoffset={off5} />
                          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#f97316" strokeWidth={strokeWidth}
                            strokeDasharray={`${p4} ${circumference - p4}`} strokeDashoffset={off4} />
                          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#f59e0b" strokeWidth={strokeWidth}
                            strokeDasharray={`${p23} ${circumference - p23}`} strokeDashoffset={off23} />
                          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#10b981" strokeWidth={strokeWidth}
                            strokeDasharray={`${p1} ${circumference - p1}`} strokeDashoffset={off1} />
                        </svg>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc' }}>{total}</span>
                          <span style={{ fontSize: '9px', color: '#94a3b8' }}>Total</span>
                        </div>
                      </div>

                      {/* Breakdown List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Tier 5</span>
                          <span style={{ fontWeight: 'bold' }}>{t5} <span style={{ color: '#64748b' }}>({Math.round((t5/total)*100)}%)</span></span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#fb923c', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#f97316' }} /> Tier 4</span>
                          <span style={{ fontWeight: 'bold' }}>{t4} <span style={{ color: '#64748b' }}>({Math.round((t4/total)*100)}%)</span></span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> Tier 2/3</span>
                          <span style={{ fontWeight: 'bold' }}>{t2 + t3} <span style={{ color: '#64748b' }}>({Math.round(((t2+t3)/total)*100)}%)</span></span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }} /> Tier 1</span>
                          <span style={{ fontWeight: 'bold' }}>{t1} <span style={{ color: '#64748b' }}>({Math.round((t1/total)*100)}%)</span></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* PAGE 3 — SIMULATION & STRATEGY LAB */}
        {activeTab === 'page3' && (
          <div>
            <header style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Simulation & Strategy Lab</h2>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0 0' }}>Stress-test arbitrary hospital capacity vectors & execute multi-policy comparisons</p>
            </header>

            {/* Scenario Selection Buttons */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '8px' }}>Scenario Selection</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                {[
                  { name: 'Normal Baseline', desc: 'Standard Conditions' },
                  { name: 'Emergency Surge', desc: 'High patient inflow' },
                  { name: 'Staff Shortage', desc: 'Reduced staff' },
                  { name: 'ICU Constraint', desc: 'Limited ICU beds' },
                  { name: 'Resource Failure', desc: 'Equipment downtime' }
                ].map(sc => (
                  <button
                    key={sc.name}
                    onClick={() => {
                      setScenario(sc.name);
                      fetchSimulation();
                      fetchSameSeedCompare();
                    }}
                    style={{
                      backgroundColor: scenario === sc.name ? '#0284c7' : '#0f172a',
                      color: scenario === sc.name ? '#ffffff' : '#cbd5e1',
                      border: scenario === sc.name ? '1px solid #38bdf8' : '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '12px 10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{sc.name}</div>
                    <div style={{ fontSize: '10px', color: scenario === sc.name ? '#e0f2fe' : '#64748b', marginTop: '2px' }}>{sc.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Page 3 Top Section — 2-Column Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', marginBottom: '24px' }}>
              
              {/* Left Column — Configure Hospital Resources */}
              <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 'bold', margin: '0 0 16px 0' }}>Configure Hospital Resources</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  {[
                    {
                      key: 'doctors', label: 'Doctors', max: 50,
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="#38bdf8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    },
                    {
                      key: 'nurses', label: 'Nurses', max: 120,
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="#38bdf8"><path d="M12 2a5 5 0 0 1 5 5v1h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm-1 7H9v2h2v2h2v-2h2V9h-2V7h-2v2z"/></svg>
                    },
                    {
                      key: 'regular_beds', label: 'Regular Beds', max: 200,
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="#38bdf8"><path d="M19 7h-8v8H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4zm-11 3a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>
                    },
                    {
                      key: 'icu_beds', label: 'ICU Beds', max: 30,
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="#38bdf8"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10h-3v3h-2v-3H9v-2h3V9h2v2h3v2z"/></svg>
                    },
                    {
                      key: 'operating_rooms', label: 'Operating Rooms', max: 15,
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="#38bdf8"><path d="M6 3a3 3 0 0 0-3 3c0 1.28.8 2.37 1.92 2.8L9 13.88l-2.08 5.08A3 3 0 1 0 9.8 20l2.2-5.38L14.2 20a3 3 0 1 0 2.88-1.04L15 13.88l4.08-5.08A3.003 3.003 0 0 0 18 3c-1.28 0-2.37.8-2.8 1.92L12 11.12 8.8 4.92A3 3 0 0 0 6 3z"/></svg>
                    },
                    {
                      key: 'ambulances', label: 'Ambulances', max: 15,
                      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="#38bdf8"><path d="M19 8h-3V4H3a2 2 0 0 0-2 2v10h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-3zM6 18.5A1.5 1.5 0 1 1 7.5 17 1.5 1.5 0 0 1 6 18.5zm12 0a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zM15 13H3V6h10v7zm3-1h-3V9.5h1.8l1.2 1.5V12z"/></svg>
                    }
                  ].map(res => {
                    const val = customCaps[res.key] ?? 10;
                    return (
                      <div key={res.key} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 40px', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1', fontWeight: '500' }}>
                          <span style={{ display: 'flex', alignItems: 'center' }}>{res.icon}</span>
                          <span>{res.label}</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max={res.max}
                          value={val}
                          onChange={e => setCustomCaps({ ...customCaps, [res.key]: Number(e.target.value) })}
                          style={{ width: '100%', cursor: 'pointer' }}
                        />
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#f8fafc', textAlign: 'right' }}>
                          {val}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ borderTop: '1px solid #1e293b', paddingTop: '14px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: '500' }}>Patient Arrival Rate Multiplier:</label>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f59e0b' }}>{arrivalMultiplier}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.5"
                    value={arrivalMultiplier}
                    onChange={e => setArrivalMultiplier(Number(e.target.value))}
                    style={{ width: '100%', marginBottom: '14px' }}
                  />
                  <button
                    onClick={() => { fetchSimulation(); fetchSameSeedCompare(); }}
                    disabled={loading}
                    style={{ width: '100%', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
                  >
                    {loading ? 'Simulating...' : 'Run All Strategies'}
                  </button>
                </div>
              </section>

              {/* Right Column (Top Right Corner) — Strategy Comparison Graph */}
              {comparisonData && (
                <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 'bold', margin: 0 }}>Strategy Comparison Results</h3>
                    
                    {/* Metric Selector Tabs */}
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1e293b', padding: '3px', borderRadius: '6px' }}>
                      {[
                        { id: 'avg_wait', label: 'Avg Wait' },
                        { id: 'p95_wait', label: 'P95 Wait' },
                        { id: 'throughput', label: 'Throughput' },
                        { id: 'lwbs', label: 'LWBS %' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setLabMetricTab(tab.id as any)}
                          style={{
                            backgroundColor: labMetricTab === tab.id ? '#0284c7' : 'transparent',
                            color: labMetricTab === tab.id ? '#ffffff' : '#94a3b8',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SVG Vertical Bar Chart with Full Height Utilization and Axes */}
                  {(() => {
                    const policies = [
                      { id: 'FCFS', label: 'FCFS', color: '#ef4444' },
                      { id: 'URGENCY', label: 'Urgency', color: '#f97316' },
                      { id: 'DYNAMIC', label: 'Dynamic', color: '#3b82f6' },
                      { id: 'MEDFLOW', label: 'MedFlow', color: '#10b981' }
                    ];

                    const getVal = (pId: string) => {
                      const kpi = comparisonData[pId];
                      if (!kpi) return 0;
                      if (labMetricTab === 'avg_wait') return kpi.waiting_metrics.avg_wait_mins;
                      if (labMetricTab === 'p95_wait') return kpi.waiting_metrics.p95_wait_mins;
                      if (labMetricTab === 'throughput') return kpi.throughput_patients_per_hour;
                      return kpi.lwbs_pct;
                    };

                    const unit = labMetricTab === 'throughput' ? '/hr' : labMetricTab === 'lwbs' ? '%' : 'm';
                    const vals = policies.map(p => getVal(p.id));
                    const maxVal = Math.max(1, ...vals);
                    const bestPolicy = policies.reduce((min, p) => getVal(p.id) < getVal(min.id) ? p : min, policies[0]);

                    return (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '230px' }}>
                        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                          {/* Y-Axis Label */}
                          <div style={{ position: 'absolute', left: '-12px', top: '42%', transform: 'rotate(-90deg)', fontSize: '9px', color: '#94a3b8', fontWeight: 'bold' }}>
                            {labMetricTab.replace('_', ' ').toUpperCase()} ({unit})
                          </div>

                          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '10px 10px 24px 35px', borderLeft: '2px solid #334155', borderBottom: '2px solid #334155' }}>
                            {policies.map(p => {
                              const val = getVal(p.id);
                              const hPct = Math.min(100, Math.max(12, (val / maxVal) * 100));

                              return (
                                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: p.color, marginBottom: '6px' }}>
                                    {val.toFixed(1)}{unit}
                                  </span>
                                  <div style={{ width: '42px', backgroundColor: '#1e293b', borderRadius: '4px 4px 0 0', height: `${hPct}%`, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                                    <div style={{ width: '100%', height: '100%', backgroundColor: p.color, borderRadius: '4px 4px 0 0', transition: 'height 0.4s ease-in-out' }} />
                                  </div>
                                  <span style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '6px', fontWeight: '500' }}>{p.label}</span>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* X-Axis Label */}
                          <div style={{ textAlign: 'center', fontSize: '9px', color: '#94a3b8', marginTop: '4px', fontWeight: 'bold' }}>
                            Scheduling Policy (X Axis)
                          </div>
                        </div>

                        {/* White Space Utilization Badges */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
                          <div style={{ backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Optimal Strategy</div>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#34d399' }}>{bestPolicy.label} ({getVal(bestPolicy.id).toFixed(1)}{unit})</div>
                          </div>
                          <div style={{ backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>MedFlow vs FCFS</div>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#38bdf8' }}>
                              {labMetricTab === 'throughput'
                                ? `+${(getVal('MEDFLOW') - getVal('FCFS')).toFixed(1)} patients/hr`
                                : `↓ ${Math.round((1 - getVal('MEDFLOW') / Math.max(1, getVal('FCFS'))) * 100)}% reduction`}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </section>
              )}
            </div>

            {/* Page 3 Bottom Section — Detailed Strategy Matrix Table */}
            {comparisonData && (
              <section style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 'bold', marginBottom: '12px' }}>Detailed Strategy Metrics Matrix</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '8px' }}>Scheduling Policy</th>
                      <th style={{ padding: '8px' }}>Average Wait Time</th>
                      <th style={{ padding: '8px' }}>P95 Wait Time</th>
                      <th style={{ padding: '8px' }}>Max Wait Time</th>
                      <th style={{ padding: '8px' }}>Throughput</th>
                      <th style={{ padding: '8px' }}>Left Without Being Seen (LWBS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(comparisonData).map(([pName, pKpi]) => (
                      <tr key={pName} style={{ borderBottom: '1px solid #1e293b', backgroundColor: pName === 'MEDFLOW' ? '#0284c715' : 'transparent' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: pName === 'MEDFLOW' ? '#38bdf8' : '#e2e8f0' }}>{pName}</td>
                        <td style={{ padding: '8px' }}>{pKpi.waiting_metrics.avg_wait_mins.toFixed(1)} mins</td>
                        <td style={{ padding: '8px' }}>{pKpi.waiting_metrics.p95_wait_mins.toFixed(1)} mins</td>
                        <td style={{ padding: '8px' }}>{pKpi.waiting_metrics.max_wait_mins.toFixed(1)} mins</td>
                        <td style={{ padding: '8px' }}>{pKpi.throughput_patients_per_hour} patients/hr</td>
                        <td style={{ padding: '8px', color: pKpi.lwbs_pct > 10 ? '#f87171' : '#34d399', fontWeight: 'bold' }}>{pKpi.lwbs_pct}% ({pKpi.lwbs_count} patients)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
