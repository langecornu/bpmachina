// Consistent empty state: an icon, a title, a hint and an optional action, so an empty screen says what to do next.
import { Icon } from './Icon.jsx';

export function EmptyState({ title, hint, icon = null, children }) {
  return (
    <div className="empty">
      {icon ? (
        <span className="empty-icon" aria-hidden="true">
          <Icon name={icon} size={26} />
        </span>
      ) : null}
      <strong>{title}</strong>
      <p>{hint}</p>
      {children}
    </div>
  );
}
