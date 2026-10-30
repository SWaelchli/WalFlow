import React from 'react';
import { getCommand, formatShortcut, runCommand } from '../../commands';
import { PlayIcon, SpinnerIcon, UndoIcon, RedoIcon, SidePaneIcon, ResultsPaneIcon, InspectorPaneIcon } from '../symbols/IconLibrary';

/** Icon-only command button: accessible name + tooltip (reason when disabled, else label and shortcut). */
function IconCommand({ commandId, ctx, icon, label, pressed }) {
  const Glyph = icon;
  const command = getCommand(commandId);
  const enabled = command.isEnabled(ctx);
  const shortcut = formatShortcut(command.shortcut);
  const tip = enabled === true ? `${label}${shortcut ? ` (${shortcut})` : ''}` : enabled;
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      aria-disabled={enabled !== true || undefined}
      aria-pressed={pressed}
      title={tip}
      onClick={() => runCommand(commandId, ctx)}
    >
      <Glyph size={20} />
    </button>
  );
}

export default function CommandBar({ ctx }) {
  const run = getCommand('simulation.run');
  const runShortcut = formatShortcut(run.shortcut);
  const isSimulating = ctx.isSimulating;
  const caseCommand = getCommand('simulation.active-case');
  const caseOptions = caseCommand.children(ctx);
  const sideCommand = `view.${ctx.sidePane}`; // the pane command that toggles the side pane in its current state
  const inspectorCommand = getCommand('view.inspector');
  const resultsCommand = getCommand('view.results');

  return (
    <div className="shell-commandbar" role="toolbar" aria-label="Commands">
      <IconCommand commandId="edit.undo" ctx={ctx} icon={UndoIcon} label="Undo" />
      <IconCommand commandId="edit.redo" ctx={ctx} icon={RedoIcon} label="Redo" />
      <span className="commandbar-divider" role="separator" aria-orientation="vertical" />

      <button
        type="button"
        className="btn-primary commandbar-run"
        disabled={run.isEnabled(ctx) !== true}
        title={`Run hydraulic simulation for the active case (${runShortcut})`}
        onClick={() => runCommand('simulation.run', ctx)}
      >
        {isSimulating ? (
          <>
            <SpinnerIcon size={12} color="var(--color-text-inverse)" />
            Solving…
          </>
        ) : (
          <>
            <PlayIcon size={12} />
            Run Simulation
          </>
        )}
      </button>

      <div className="case-switcher">
        <span className="case-switcher-label">Case:</span>
        <select
          aria-label="Active operating case"
          title="Switch operating case. Add cases in the Operating cases tab below the canvas."
          value={ctx.activeCaseId}
          onChange={(e) => caseOptions[ctx.cases.findIndex((c) => c.id === e.target.value)]?.run()}
          className="form-select case-switcher-select"
        >
          {ctx.cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.is_base ? ' (base)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="commandbar-spacer" />

      <div className="commandbar-group" role="group" aria-label="Panels">
        <IconCommand commandId={sideCommand} ctx={ctx} icon={SidePaneIcon} label="Side pane" pressed={!!ctx.sidePaneOpen} />
        <IconCommand commandId="view.results" ctx={ctx} icon={ResultsPaneIcon} label="Results panel" pressed={!!resultsCommand.checked(ctx)} />
        <IconCommand commandId="view.inspector" ctx={ctx} icon={InspectorPaneIcon} label="Inspector" pressed={!!inspectorCommand.checked(ctx)} />
      </div>
    </div>
  );
}
