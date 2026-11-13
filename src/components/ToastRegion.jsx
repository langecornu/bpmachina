// Shows the current toasts in a polite live region, so a screen reader hears them too.
import { Icon } from './Icon.jsx';

export function ToastRegion({ toasts }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <Icon name="check" size={15} />
          {toast.text}
        </div>
      ))}
    </div>
  );
}
