import React, { useState, useEffect } from 'react';

interface KPIResult {
  policy: string;
  total_patients: number;
  completed_patients: number;
  completion_rate_pct: number;
  total_simulation_time_mins: number;
  waiting_metrics: {
    avg_wait_mins: number;
    p95_wait_mins: number;
    max_wait_mins: number;
    min_wait_mins: number;
  };
  fairness_metrics: {
    starvation_ratio: number;
    avg_wait_by_urgency_mins: Record<string, number>;
  };
  resource_utilization_pct: Record<string, number>;
  resource_capacities: Record<string, number>;
}

interface PatientRecord {
  patient_id: string;
  age: number;
  gender: string;
  department: string;
  urgency: number;
  icu_required: boolean;
  or_required: boolean;
  doctor_required: number;
  nurse_required: number;
  true_duration: number;
  predicted_duration?: number;
  wait_time: number;
  status: string;
}

export default function App() {
  const [scenario, setScenario] = useState<string>('Normal');
  const [policy, setPolicy] = useState<string>('MEDFLOW');
  const [nPatients, setNPatients] = useState<number>(300);
  const [loading, setLoading] = useState<boolean>(false);
  const [simulationData, setSimulationData] = useState<{
    kpis: KPIResult;
    patient_sample: PatientRecord[];
  } | null>(null);
  const [experimentData, setExperimentData] = useState<any>(null);
  const [mlMetrics, setMlMetrics] = useState<any>(null);

  // Initial Data Fetch
  useEffect(() => {
    fetchSimulation();
    fetchMLMetrics();
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
        }),
      });
      const data = await res.json();
      setSimulationData(data);
    } catch (err) {
      console.error('Error fetching simulation data:', err);
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
      console.error('Error fetching ML metrics:', err);
    }
  };

  const runFullExperiments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n_patients: nPatients, seed: 42 }),
      });
      const data = await res.json();
      setExperimentData(data);
    } catch (err) {
      console.error('Error running experiments:', err);
    } finally {
      setLoading(false);
    }
  };

  const kpis = simulationData?.kpis;
  const capacities = kpis?.resource_capacities || { regular_beds: 200, icu_beds: 35, doctors: 60, nurses: 150, operating_rooms: 10, ambulances: 10 };
  const utils = kpis?.resource_utilization_pct || {};

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0f19', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #1e293b', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#38bdf8', margin: 0 }}>MEDFLOW</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: '4px 0 0 0' }}>Inpatient Hospital Resource Simulation & Mathematical Scheduling Engine</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ backgroundColor: '#0369a1', color: '#e0f2fe', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
            Multi-Specialty Scale
          </span>
          <span style={{ backgroundColor: '#047857', color: '#d1fae5', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
            System Status: ONLINE
          </span>
        </div>
      </header>

      {/* Hospital Resource Status Bar */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#cbd5e1', marginBottom: '12px' }}>IP Hospital Status (Resource Occupancy & Capacities)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          {Object.entries(capacities).map(([res, cap]) => {
            const uPct = utils[res] || 0;
            return (
              <div key={res} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>{res.replace('_', ' ')}</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f8fafc', margin: '4px 0' }}>
                  {Math.round((uPct / 100) * cap)} / {cap}
                </div>
                <div style={{ backgroundColor: '#334155', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: uPct > 85 ? '#ef4444' : uPct > 60 ? '#f59e0b' : '#3b82f6', width: `${uPct}%`, height: '100%' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{uPct}% Utilized</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Control Panel */}
      <section style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Operational Scenario</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #475569', borderRadius: '6px', padding: '8px 12px' }}
            >
              <option value="Normal">Scenario 1 — Normal Baseline</option>
              <option value="Patient Surge">Scenario 2 — Patient Surge (15.0x)</option>
              <option value="ICU Shortage">Scenario 3 — ICU Shortage (2 Beds)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Scheduling Policy</label>
            <select
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #475569', borderRadius: '6px', padding: '8px 12px' }}
            >
              <option value="FCFS">1. FCFS (First-Come, First-Served)</option>
              <option value="URGENCY">2. Urgency-Only</option>
              <option value="DYNAMIC">3. Dynamic Priority (Aging)</option>
              <option value="MEDFLOW">4. MEDFLOW (Resource-Aware Heuristic)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Patient Count ({nPatients})</label>
            <input
              type="range"
              min="50"
              max="500"
              step="50"
              value={nPatients}
              onChange={(e) => setNPatients(Number(e.target.value))}
              style={{ width: '120px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginLeft: 'auto' }}>
            <button
              onClick={fetchSimulation}
              disabled={loading}
              style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {loading ? 'Simulating...' : 'Run Simulation'}
            </button>
            <button
              onClick={runFullExperiments}
              disabled={loading}
              style={{ backgroundColor: '#0d9488', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Run Controlled Experiments
            </button>
          </div>
        </div>
      </section>

      {/* Simulation KPI Summary Cards */}
      {kpis && (
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#cbd5e1', marginBottom: '12px' }}>Operational Simulation Results ({kpis.policy} - {scenario})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Average Wait Time</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#60a5fa' }}>{kpis.waiting_metrics.avg_wait_mins.toFixed(1)} m</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Across all completed patients</div>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>P95 Waiting Time</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fbbf24' }}>{kpis.waiting_metrics.p95_wait_mins.toFixed(1)} m</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>95th percentile queue tail</div>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Maximum Wait Time</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f87171' }}>{kpis.waiting_metrics.max_wait_mins.toFixed(1)} m</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Worst-case starvation peak</div>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Starvation Ratio</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#34d399' }}>{kpis.fairness_metrics.starvation_ratio}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>P95 / Mean Wait ratio</div>
            </div>
          </div>
        </section>
      )}

      {/* Controlled Experiments Comparison Matrix */}
      {experimentData && (
        <section style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#38bdf8', marginBottom: '12px' }}>
            Controlled Experiments Matrix (Identical Patient Stream N={experimentData.n_patients}, Seed={experimentData.seed})
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                <th style={{ padding: '8px' }}>Scenario</th>
                <th style={{ padding: '8px' }}>Policy</th>
                <th style={{ padding: '8px' }}>Avg Wait</th>
                <th style={{ padding: '8px' }}>P95 Wait</th>
                <th style={{ padding: '8px' }}>Max Wait</th>
                <th style={{ padding: '8px' }}>Starvation Ratio</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(experimentData.results).map(([scName, polMap]: [string, any]) =>
                Object.entries(polMap).map(([polName, kData]: [string, any]) => (
                  <tr key={`${scName}-${polName}`} style={{ borderBottom: '1px solid #1e293b', backgroundColor: polName === 'MEDFLOW' ? '#0284c715' : 'transparent' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{scName}</td>
                    <td style={{ padding: '8px', color: polName === 'MEDFLOW' ? '#38bdf8' : '#e2e8f0', fontWeight: polName === 'MEDFLOW' ? 'bold' : 'normal' }}>
                      {polName}
                    </td>
                    <td style={{ padding: '8px' }}>{kData.waiting_metrics.avg_wait_mins.toFixed(1)}m</td>
                    <td style={{ padding: '8px' }}>{kData.waiting_metrics.p95_wait_mins.toFixed(1)}m</td>
                    <td style={{ padding: '8px' }}>{kData.waiting_metrics.max_wait_mins.toFixed(1)}m</td>
                    <td style={{ padding: '8px' }}>{kData.fairness_metrics.starvation_ratio}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Queue & ML Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Inpatient Queue Table */}
        <section style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#cbd5e1', marginBottom: '12px' }}>IP Patient Stream (Sample Triage & Status)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                  <th style={{ padding: '6px' }}>Patient ID</th>
                  <th style={{ padding: '6px' }}>Urgency</th>
                  <th style={{ padding: '6px' }}>Department</th>
                  <th style={{ padding: '6px' }}>Wait Time</th>
                  <th style={{ padding: '6px' }}>ICU / OR</th>
                  <th style={{ padding: '6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {simulationData?.patient_sample?.slice(0, 15).map((p) => (
                  <tr key={p.patient_id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '6px', fontWeight: '600', color: '#38bdf8' }}>{p.patient_id}</td>
                    <td style={{ padding: '6px' }}>
                      <span style={{
                        backgroundColor: p.urgency >= 4 ? '#7f1d1d' : p.urgency >= 3 ? '#78350f' : '#1e3a8a',
                        color: p.urgency >= 4 ? '#fca5a5' : p.urgency >= 3 ? '#fde68a' : '#bfdbfe',
                        padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'
                      }}>
                        Tier {p.urgency}
                      </span>
                    </td>
                    <td style={{ padding: '6px' }}>{p.department}</td>
                    <td style={{ padding: '6px' }}>{p.wait_time.toFixed(1)}m</td>
                    <td style={{ padding: '6px' }}>
                      {p.icu_required ? 'ICU ' : ''}{p.or_required ? 'OR' : '-'}
                    </td>
                    <td style={{ padding: '6px' }}>
                      <span style={{ color: p.status === 'ADMITTED' ? '#34d399' : p.status === 'DISCHARGED' ? '#94a3b8' : '#fbbf24' }}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ML Performance Panel */}
        <section style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#cbd5e1', marginBottom: '12px' }}>ML Duration Predictor</h2>
          {mlMetrics ? (
            <div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>Model: <strong style={{ color: '#f8fafc' }}>{mlMetrics.model}</strong></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>MAE (Mean Abs Error)</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#38bdf8' }}>{mlMetrics.metrics.mae} mins</div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>R² Variance Score</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#34d399' }}>{mlMetrics.metrics.r2}</div>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', lineHeight: '1.4' }}>
                {mlMetrics.disclaimer}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '12px', color: '#64748b' }}>Loading ML metrics...</p>
          )}
        </section>
      </div>
    </div>
  );
}
