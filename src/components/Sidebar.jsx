// Left navigation rail with the screens, grouped, and a live dot beside the screen whose music is playing.
import { GROUPS, VIEWS } from '../utils/views.js';
import { Icon } from './Icon.jsx';

export function Sidebar({ current, onSelect, liveViews = [] }) {
  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <div className="brand-name">BPMachina</div>
          <div className="brand-sub">You set the pulse</div>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
        {GROUPS.map((group) => (
          <div key={group} className="nav-group" role="group" aria-labelledby={`nav-group-${group}`}>
            <div className="nav-heading" id={`nav-group-${group}`}>
              {group}
            </div>
            {VIEWS.filter((view) => view.group === group).map((view) => (
              <button
                key={view.id}
                type="button"
                className="nav-item"
                aria-current={current === view.id ? 'page' : undefined}
                title={view.label}
                onClick={() => onSelect(view.id)}
              >
                <span className="nav-icon">
                  <Icon name={view.icon} size={17} />
                </span>
                <span className="nav-label">{view.label}</span>
                {liveViews.includes(view.id) ? (
                  <>
                    <span className="nav-live" aria-hidden="true" />
                    <span className="sr-only">{' (playing)'}</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="rail-footer">v0.1 · Open source · MIT</div>
    </aside>
  );
}
