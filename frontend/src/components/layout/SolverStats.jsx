import React, { useState } from 'react';
import { summarizeStats } from '../../utils/runStatus';
import { InfoIcon, WarningIcon, CheckIcon, CrossIcon } from '../symbols/IconLibrary';
import { clickableProps } from '../../utils/a11yProps';

function formatSolverName(method, fallbackUsed = false) {
  if (fallbackUsed) {
    return 'Levenberg-Marq (fallback)';
  }
  if (!method) return 'N/A';
  if (method === 'sparse_newton') return 'Sparse Newton';
  if (method === 'lm') return 'Levenberg-Marq';
  return method;
}

const SUMMARY_TONE = { ok: 'tone-ok', warning: 'tone-warn', nothing: 'tone-warn', failed: 'tone-bad' };

function BottleneckCard({ bottleneck, onSelectComponent }) {
  return (
    <div {...clickableProps}
      onClick={() => bottleneck.id && onSelectComponent && onSelectComponent(bottleneck.id, bottleneck.type)}
      className={`sidebar-bottleneck-card ${bottleneck.id ? 'is-clickable' : 'is-static'}`}
    >
      <div className="stats-bottleneck-head">
        <span>Critical Bottleneck</span>
        {bottleneck.id && <span className="stats-bottleneck-locate">Click to locate</span>}
      </div>
      <div>
        <div className="stats-bottleneck-name">{bottleneck.name}</div>
        <div className="stats-bottleneck-type">{bottleneck.error_type}</div>
      </div>
      <div className="stats-bottleneck-note">
        This component has the largest mathematical error. Check its sizing or connections.
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="stats-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {hint && <div className="stats-label">{hint}</div>}
    </div>
  );
}

function DiagnosticsContent({ stats, batchStats, onSelectComponent }) {
  const [statsSource, setStatsSource] = useState('single');
  const [selectedBatchCaseId, setSelectedBatchCaseId] = useState('');

  const [prevStats, setPrevStats] = useState(stats);
  const [prevBatchStats, setPrevBatchStats] = useState(batchStats);

  if (stats !== prevStats) {
    setPrevStats(stats);
    setStatsSource('single');
  }

  if (batchStats !== prevBatchStats) {
    setPrevBatchStats(batchStats);
    setStatsSource('batch');
    if (batchStats && batchStats.length > 0) {
      setSelectedBatchCaseId(batchStats[0].case_id);
    }
  }

  if (!stats && (!batchStats || batchStats.length === 0)) {
    return (
      <div className="stats-empty">
        <div className="stats-empty-icon">
          <InfoIcon size={32} color="var(--color-text-muted)" />
        </div>
        <p className="stats-empty-title">No simulation data yet.</p>
        <p className="stats-empty-hint">Run a simulation or batch solve to see performance.</p>
      </div>
    );
  }

  const hasSingle = !!stats;
  const hasBatch = batchStats && batchStats.length > 0;
  const activeSource = (statsSource === 'batch' && hasBatch) ? 'batch' : (hasSingle ? 'single' : 'batch');

  // Single Case Stats
  const { success, time_ms, outer_iterations, total_inner_iterations, fallback_used, system_size, bottleneck } = stats || {};
  const summary = summarizeStats(stats);
  const toneClass = SUMMARY_TONE[summary?.level] || SUMMARY_TONE.failed;

  // Selected Batch Case Stats
  const selectedCase = hasBatch ? (batchStats.find(c => c.case_id === selectedBatchCaseId) || batchStats[0]) : null;

  return (
    <div className="stats-root">
      {hasSingle && hasBatch && (
        <div className="stats-source">
          <button
            onClick={() => setStatsSource('single')}
            className={`stats-source-btn${statsSource === 'single' ? ' active' : ''}`}
          >
            Single Run
          </button>
          <button
            onClick={() => setStatsSource('batch')}
            className={`stats-source-btn${statsSource === 'batch' ? ' active' : ''}`}
          >
            Batch Solve ({batchStats.length})
          </button>
        </div>
      )}

      {activeSource === 'single' && stats && (
        <div className="stats-root">
          <div className={`stats-banner ${toneClass}`}>
            <div className="stats-banner-icon">
              {summary.level === 'ok' ? <CheckIcon size={20} />
                : summary.level === 'failed' ? <CrossIcon size={20} />
                : <WarningIcon size={20} />}
            </div>
            <div>
              <div className="stats-banner-title">
                {summary.headline.toUpperCase()}
              </div>
              <div className="stats-banner-detail">
                {summary.detail}
              </div>
            </div>
          </div>

          {summary.level === 'warning' && summary.notes.length > 1 && (
            <ul className="stats-notes">
              {summary.notes.slice(1).map((n, i) => <li key={i}>{n.text}</li>)}
            </ul>
          )}

          {bottleneck && !success && <BottleneckCard bottleneck={bottleneck} onSelectComponent={onSelectComponent} />}

          <div className="stats-grid">
            <StatCard label="Total Time" value={`${time_ms.toFixed(1)} ms`} />
            <StatCard label="System Size" value={`${system_size} Eq.`} hint={stats.num_nodes !== undefined ? `${stats.num_nodes} Nodes / ${stats.num_edges} Pipes` : null} />
            <StatCard label="Control Steps" value={outer_iterations} hint="Outer Loop" />
            <StatCard label="Math Steps" value={total_inner_iterations} hint="Total Inner" />
            <StatCard label="Prop Steps" value={stats.property_iterations || 0} hint="Property Loops" />
            <StatCard label="Max Residual" value={stats.max_residual !== undefined ? stats.max_residual.toExponential(2) : 'N/A'} hint="Balance Error" />
            <StatCard label="Solver Method" value={formatSolverName(stats.solver_method, fallback_used)} />
            <StatCard label="Warm-Start" value={stats.warm_start_status || 'N/A'} />
          </div>
        </div>
      )}

      {activeSource === 'batch' && hasBatch && (
        <div className="stats-root">
          <div className="stats-batch-summary">
            <div className="stats-col">
              <span className="stats-label">Total Batch Time</span>
              <span className="stats-value">
                {batchStats.reduce((sum, c) => sum + (c.time_ms || 0), 0).toFixed(1)} ms
              </span>
            </div>
            <div className="stats-col">
              <span className="stats-label">Success Rate</span>
              <span className="stats-value">
                {((batchStats.filter(c => c.status === 'success' && !c.error_message).length / batchStats.length) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div>
            <label className="stats-case-label">
              Select operating case
            </label>
            <select
              value={selectedBatchCaseId}
              onChange={(e) => setSelectedBatchCaseId(e.target.value)}
              className="form-select stats-case-select"
            >
              {batchStats.map(c => {
                const caseSuccess = c.status === 'success' && !c.error_message;
                return (
                  <option key={c.case_id} value={c.case_id}>
                    {c.case_name} ({caseSuccess ? 'Success' : 'Failed'})
                  </option>
                );
              })}
            </select>
          </div>

          {selectedCase && (
            <div className="stats-root">
              {(() => {
                const caseSuccess = selectedCase.status === 'success' && !selectedCase.error_message;
                const caseErr = selectedCase.error_message || selectedCase.error;
                return (
                  <>
                    <div className={`stats-banner ${caseSuccess ? 'tone-ok' : 'tone-bad'}`}>
                      <div className="stats-banner-icon">{caseSuccess ? <CheckIcon size={20} /> : <CrossIcon size={20} />}</div>
                      <div>
                        <div className="stats-banner-title">
                          {caseSuccess ? 'CASE CONVERGED' : 'CASE FAILED'}
                        </div>
                        <div className="stats-banner-detail">
                          {caseSuccess ? 'System is balanced.' : caseErr || 'Non-physical results found.'}
                        </div>
                      </div>
                    </div>

                    {selectedCase.bottleneck && !caseSuccess && <BottleneckCard bottleneck={selectedCase.bottleneck} onSelectComponent={onSelectComponent} />}

                    {caseSuccess && (
                      <div className="stats-grid">
                        <StatCard label="Solve Time" value={`${(selectedCase.time_ms || 0).toFixed(1)} ms`} />
                        <StatCard label="System Size" value={`${selectedCase.system_size || 0} Eq.`} hint={selectedCase.num_nodes !== undefined ? `${selectedCase.num_nodes} Nodes / ${selectedCase.num_edges} Pipes` : null} />
                        <StatCard label="Control Steps" value={selectedCase.outer_iterations || 0} hint="Outer Loop" />
                        <StatCard label="Math Steps" value={selectedCase.total_inner_iterations || 0} hint="Total Inner" />
                        <StatCard label="Prop Steps" value={selectedCase.property_iterations || 0} hint="Property Loops" />
                        <StatCard label="Max Residual" value={selectedCase.max_residual !== undefined ? selectedCase.max_residual.toExponential(2) : 'N/A'} hint="Balance Error" />
                        <StatCard label="Solver Method" value={formatSolverName(selectedCase.solver_method, selectedCase.fallback_used)} />
                        <StatCard label="Warm-Start" value={selectedCase.warm_start_status || 'N/A'} />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DiagnosticsContent;
