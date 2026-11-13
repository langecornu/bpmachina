// A light/dark switch (role="switch") with sun and moon on the track.
import { Icon } from './Icon.jsx';

export function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark theme"
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="theme-switch"
      onClick={onToggle}
    >
      <span className="theme-icon theme-icon-sun">
        <Icon name="sun" size={16} />
      </span>
      <span className="theme-icon theme-icon-moon">
        <Icon name="moon" size={16} />
      </span>
      <span className="theme-knob">
        <Icon name={isDark ? 'moon' : 'sun'} size={16} />
      </span>
    </button>
  );
}
