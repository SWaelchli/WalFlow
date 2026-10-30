import { SIDE_PANES } from './sidePanes';

/** Vertical activity rail. The active button collapses the pane; another button opens that pane. */
export default function ActivityRail({ activePane, paneOpen, onSelect }) {
  return (
    <nav className="shell-rail" aria-label="Side panes">
      {SIDE_PANES.map((pane) => {
        const Icon = pane.Icon;
        return (
          <button
            key={pane.id}
            type="button"
            className="rail-button"
            aria-label={pane.title}
            title={pane.title}
            aria-pressed={paneOpen && activePane === pane.id}
            onClick={() => onSelect(pane.id)}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </nav>
  );
}
