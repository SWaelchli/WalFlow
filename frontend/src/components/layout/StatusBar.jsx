import React from 'react';
import { useStore } from 'reactflow';
import { runCommand } from '../../commands';
import { CaseIcon, WarningIcon, RulerIcon } from '../symbols/IconLibrary';
import { useUnits } from '../../context/UnitContext';
import StatusChip from './StatusChip';

/** One clickable slot: icon + words, never colour alone. */
function Slot({ icon: Glyph, label, title, onClick, className = '', ...rest }) {
  return (
    <button type="button" className={`status-slot ${className}`} title={title} onClick={onClick} {...rest}>
      {Glyph && <Glyph size={14} />}
      <span>{label}</span>
    </button>
  );
}

// Own component so only the zoom slot re-renders while the user zooms
function ZoomSlot({ onClick }) {
  const zoom = useStore((st) => st.transform[2]);
  return <Slot label={`${Math.round(zoom * 100)} %`} title="Zoom: click to fit view" onClick={onClick} className="status-slot-zoom" aria-label={`Zoom ${Math.round(zoom * 100)} percent, fit view`} />;
}

/**
 * Status bar, fixed slots left to right: Run result, Case, Warnings; right: Units, Selection, Zoom.
 * Slots never wrap. Clicks run commands through `runCommand` where a command exists.
 */
export default function StatusBar({ ctx, chip, activeCaseName, warningCount, hasErrors, onOpenWarnings, onOpenUnits }) {
  const { basisLabel, labels } = useUnits();
  const selected = ctx.selection.nodes.length + ctx.selection.edges.length;

  return (
    <>
      <StatusChip {...chip} />
      <Slot
        icon={CaseIcon}
        label={`Case: ${activeCaseName}`}
        title="Active case: click to show the case manager"
        onClick={() => runCommand('view.case-manager', ctx)}
        className="status-slot-case"
      />
      {warningCount > 0 && (
        <Slot
          icon={WarningIcon}
          label={`${warningCount} ${hasErrors ? (warningCount === 1 ? 'problem' : 'problems') : (warningCount === 1 ? 'warning' : 'warnings')}`}
          title="Model checks: click to list them"
          onClick={onOpenWarnings}
          data-status-flyout-trigger=""
        />
      )}
      <span className="status-spacer" />
      <Slot icon={RulerIcon} label={`${basisLabel} · ${labels.flow}`} title="Units: click to open the global settings" onClick={onOpenUnits} className="status-slot-units" />
      {selected > 0 && <span className="status-slot status-slot-static status-slot-selection">{selected} selected</span>}
      <ZoomSlot onClick={() => runCommand('view.fit', ctx)} />
    </>
  );
}
