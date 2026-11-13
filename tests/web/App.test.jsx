// End-to-end tests of the app in the browser code: loading, moving between screens, editing on the BPM Grid with
// undo and autosave, playing, and the keyboard shortcuts.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App.jsx';
import { createMockEngine } from './audioMocks.js';
import { accessibilityViolations } from './axe.js';
import { installMockServer } from './mockServer.js';

async function renderApp(options) {
  const server = installMockServer(options);
  const audio = await createMockEngine();
  const utils = render(<App createEngine={() => audio.engine} />);
  await screen.findByRole('heading', { name: 'Machina Awakens' });
  return { server, audio, ...utils };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('App', () => {
  it('opens on Home with the song at a glance, and every screen passes an accessibility check', async () => {
    const { container } = await renderApp();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('0:41')).toBeInTheDocument();
    for (const name of ['Home', 'Machina', 'BPM Grid', 'Arrangement', 'Settings']) {
      await userEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name }));
      expect(await accessibilityViolations(container)).toEqual([]);
    }
  });

  it('retries while the server starts, then says so if it never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installMockServer({ failSongLoads: 2 });
    const audio = await createMockEngine();
    render(<App createEngine={() => audio.engine} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(await screen.findByRole('heading', { name: 'Machina Awakens' })).toBeInTheDocument();
  });

  it('places a drum hit, saves it, and undoes and redoes it', async () => {
    const { server } = await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'BPM Grid' }));
    const cell = screen.getByRole('button', { name: 'Clap, bar 1, step 2' });
    expect(cell).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(cell);
    expect(cell).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(server.saves.length).toBeGreaterThan(0), { timeout: 2000 });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Clap, bar 1, step 2' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByRole('button', { name: 'Clap, bar 1, step 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('plays the song with Space, follows the clock, and stops', async () => {
    const { audio } = await renderApp();
    fireEvent.keyDown(window, { key: ' ' });
    expect(await screen.findByText('Playing')).toBeInTheDocument();
    expect(audio.played.length).toBeGreaterThan(0);
    expect(screen.getByText(/\(playing\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(audio.engine.isPlaying).toBe(false);
  });

  it('loops the open pattern with Space on the BPM Grid, but not while typing', async () => {
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'BPM Grid' }));
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: ' ' });
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    expect(await screen.findByText('Pattern Intro')).toBeInTheDocument();
  });

  it('changes tempo, key and master volume from the top bar', async () => {
    const { audio } = await renderApp();
    fireEvent.change(screen.getByLabelText('Tempo in beats per minute'), { target: { value: '150' } });
    expect(screen.getByLabelText('Tempo in beats per minute')).toHaveValue(150);
    fireEvent.change(screen.getByLabelText('Tempo in beats per minute'), { target: { value: '999' } });
    expect(screen.getByLabelText('Tempo in beats per minute')).toHaveValue(150);
    await userEvent.selectOptions(screen.getByLabelText('Key root'), 'F#');
    await userEvent.selectOptions(screen.getByLabelText('Scale'), 'phrygian');
    expect(screen.getByText('F# phrygian')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Master volume'), { target: { value: '40' } });
    expect(audio.engine.masterLevel).toBe(0.4);
  });

  it('starts an empty song after asking', async () => {
    vi.stubGlobal('confirm', () => true);
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New empty song' }));
    expect(await screen.findByRole('heading', { name: 'Untitled song' })).toBeInTheDocument();
  });
});
