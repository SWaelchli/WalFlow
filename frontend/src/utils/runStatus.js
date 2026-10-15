// F3-04: turns the solver's stats into the status chip state and the banner texts.
// Pure functions; the UI lives in StatusPanel / RunBanners / Navbar.

const REASON_TEXT = {
  negative_absolute_pressure: 'pressure below absolute zero',
  below_vapor_pressure: 'pressure below the vapour pressure (the liquid would boil or cavitate)',
  near_vacuum: 'pressure close to vacuum',
  temperature_out_of_range: 'temperature outside the range where the fluid properties are valid',
};

const portLabel = (port) => (port && port !== '-' ? ` ${String(port).replace('-', ' ')}` : '');

/**
 * What a result means for the user.
 * level: 'failed' (no usable result), 'nothing' (nothing was solved), 'warning' (solved, with caveats), 'ok'.
 * notes: `{ severity: 'error'|'warning', text, nodeId? }`, most important first.
 */
export function summarizeStats(stats) {
  if (!stats) return null;
  const notes = [];

  if (stats.success === false) {
    return {
      level: 'failed',
      headline: 'Solver failed',
      detail: stats.error || 'The solver could not find a solution.',
      notes: [{ severity: 'error', text: stats.error || 'The solver could not find a solution.', nodeId: stats.bottleneck?.id || null }],
    };
  }

  // A run without a single pipe or unknown has nothing to balance; "converged" would be misleading
  if (!stats.num_edges || !stats.system_size) {
    return {
      level: 'nothing',
      headline: 'Nothing to solve',
      detail: 'No pipes connect the components, so no equations were solved. Connect the components and run again.',
      notes: [{ severity: 'warning', text: 'No pipes connect the components, so no equations were solved.' }],
    };
  }

  if (stats.controls_converged === false) {
    notes.push({ severity: 'warning', text: 'Control loops did not settle within the iteration limit. Check set points and valve sizing.' });
  }
  // A regulator that is wide open or closed cannot hold its set point (lock-up is intended behaviour)
  const STATE_TEXT = { wide_open: 'is wide open and cannot hold its set point', closed: 'is closed and cannot hold its set point' };
  (stats.saturated_controllers || []).forEach((c) => {
    if (!STATE_TEXT[c?.state]) return;
    notes.push({ severity: 'warning', text: `${c.name} ${STATE_TEXT[c.state]}.`, nodeId: c.id || null });
  });
  if (stats.properties_converged === false) {
    notes.push({ severity: 'warning', text: 'Fluid properties did not settle with temperature; pressures and temperatures may differ slightly.' });
  }

  const issues = stats.physical_validity?.issues || [];
  const byReason = new Map();
  issues.forEach((i) => {
    if (!byReason.has(i.reason)) byReason.set(i.reason, []);
    byReason.get(i.reason).push(i);
  });
  byReason.forEach((list, reason) => {
    const shown = list.slice(0, 3).map((i) => `${i.node}${portLabel(i.port)}`).join(', ');
    const more = list.length > 3 ? ` and ${list.length - 3} more` : '';
    notes.push({
      severity: 'warning',
      text: `${REASON_TEXT[reason] || reason}: ${shown}${more}. The result is not physical there.`,
      nodeId: list[0].node_id || null,
    });
  });

  if (stats.non_finite_count) {
    notes.push({ severity: 'warning', text: `${stats.non_finite_count} value(s) could not be calculated and are shown as "-".` });
  }

  return notes.length
    ? { level: 'warning', headline: 'Converged with warnings', detail: notes[0].text, notes }
    : { level: 'ok', headline: 'Converged', detail: 'The system is balanced.', notes };
}

/**
 * State of the navbar chip. Precedence: connection first, then a run in progress, then the last result.
 * @returns {{ state: string, label: string, tone: 'neutral'|'ok'|'warn'|'bad'|'busy' }}
 */
export function deriveRunState({ isConnected, loginRequired, isSimulating, stats, runError, resultsStale }) {
  if (loginRequired) return { state: 'signin', label: 'Sign in to simulate', tone: 'warn' };
  if (!isConnected) return { state: 'offline', label: 'Solver not connected', tone: 'bad' };
  if (isSimulating) return { state: 'running', label: 'Running...', tone: 'busy' };
  if (runError) return { state: 'failed', label: 'Failed', tone: 'bad' };
  const summary = summarizeStats(stats);
  if (!summary) return { state: 'idle', label: 'Not run yet', tone: 'neutral' };
  if (summary.level === 'failed') return { state: 'failed', label: 'Failed', tone: 'bad' };
  if (resultsStale) return { state: 'stale', label: 'Results out of date', tone: 'warn' };
  if (summary.level === 'nothing') return { state: 'nothing', label: 'Nothing to solve', tone: 'warn' };
  if (summary.level === 'warning') return { state: 'warning', label: `Converged, ${summary.notes.length} warning${summary.notes.length > 1 ? 's' : ''}`, tone: 'warn' };
  return { state: 'converged', label: 'Converged', tone: 'ok' };
}
