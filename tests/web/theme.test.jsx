// Tests for the theme switch and its hook: remembers the choice, and still works when storage is blocked.
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '../../src/components/ThemeToggle.jsx';
import { useTheme } from '../../src/hooks/useTheme.js';

beforeEach(() => {
  document.documentElement.dataset.theme = 'dark';
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThemeToggle', () => {
  it('is a switch that reports whether the dark theme is on and asks to toggle', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<ThemeToggle theme="dark" onToggle={onToggle} />);
    const control = screen.getByRole('switch', { name: 'Dark theme' });
    expect(control).toBeChecked();
    await user.click(control);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<ThemeToggle theme="light" onToggle={onToggle} />);
    expect(screen.getByRole('switch', { name: 'Dark theme' })).not.toBeChecked();
  });
});

describe('useTheme', () => {
  it('starts from the theme set before first paint, applies a change, and remembers it', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('bpm-theme')).toBe('light');
  });

  it('still switches for this session when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
  });
});
