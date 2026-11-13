// Tests of the BPM Grid: patterns, tracks and their mix, accents, and placing notes in the piano roll.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App.jsx';
import { createMockEngine } from './audioMocks.js';
import { installMockServer } from './mockServer.js';

let audio;

beforeEach(async () => {
  vi.stubGlobal('confirm', () => true);
  installMockServer();
  audio = await createMockEngine();
  render(<App createEngine={() => audio.engine} />);
  await screen.findByRole('heading', { name: 'Machina Awakens' });
  await userEvent.click(screen.getByRole('button', { name: 'BPM Grid' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BPM Grid', () => {
  it('switches, adds, copies, renames, shortens and deletes patterns', async () => {
    const tabs = () => within(screen.getByRole('tablist', { name: 'Patterns' })).getAllByRole('tab');
    await userEvent.click(screen.getByRole('tab', { name: /Roll/ }));
    expect(screen.getByRole('tab', { name: /Roll/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(screen.getByRole('tab', { name: /Roll copy/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Peak' } });
    expect(screen.getByRole('tab', { name: /Peak/ })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Length'), '1');
    expect(screen.queryByRole('button', { name: 'Kick, bar 2, step 1' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(tabs()).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'New pattern' }));
    expect(screen.getByRole('tab', { name: /^A/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('accents a hit with Shift-click and previews a new hit', async () => {
    const cell = screen.getByRole('button', { name: 'Kick, bar 1, step 1' });
    expect(cell).toHaveAttribute('data-level', 'loud');
    fireEvent.click(cell, { shiftKey: true });
    expect(screen.getByRole('button', { name: 'Kick, bar 1, step 1' })).toHaveAttribute('data-level', 'mid');
    await userEvent.click(screen.getByRole('button', { name: 'Kick, bar 1, step 2' }));
    expect(audio.played.at(-1)).toMatchObject({ instrument: 'kick', pitch: 36 });
  });

  it('mutes, balances, adds and removes tracks', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Mute Kick' }));
    expect(screen.getByRole('button', { name: 'Mute Kick' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Kick volume'), { target: { value: '30' } });
    expect(screen.getByLabelText('Kick volume')).toHaveValue('30');
    await userEvent.selectOptions(screen.getByLabelText('Add a track'), 'fx');
    expect(screen.getByRole('button', { name: 'Remove FX' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove FX' }));
    expect(screen.queryByRole('button', { name: 'Remove FX' })).not.toBeInTheDocument();
  });

  it('sets a track’s pan, sends and ducking from its lane, heard by the engine at once', async () => {
    const button = screen.getByRole('button', { name: 'Closed hat mix: pan and effects' });
    expect(button).toHaveAttribute('title', 'Mix: pan R 18, reverb 6, delay 0');
    const panel = screen.getByLabelText('Closed hat mix');
    fireEvent.change(within(panel).getByLabelText(/Pan/), { target: { value: '-40' } });
    expect(within(panel).getByText('L 40')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText(/Reverb/), { target: { value: '25' } });
    fireEvent.change(within(panel).getByLabelText(/Delay/), { target: { value: '0' } });
    await userEvent.click(within(panel).getByLabelText('Duck under the kick'));
    const hat = audio.engine.song.tracks.find((track) => track.instrument === 'hat');
    expect(hat.mix).toEqual({ pan: -40, reverb: 25, delay: 0, duck: true });
    fireEvent.change(within(panel).getByLabelText(/Pan/), { target: { value: '0' } });
    expect(within(panel).getByText('C')).toBeInTheDocument();
  });

  it('places and removes notes in the piano roll, in the key or not', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Edit Acid notes' }));
    const roll = screen.getByRole('region', { name: 'Acid notes' });
    expect(within(roll).queryByRole('button', { name: 'F3, bar 1, step 1' })).not.toBeInTheDocument();
    await userEvent.click(within(roll).getByRole('button', { name: '1/4' }));
    await userEvent.click(within(roll).getByRole('button', { name: 'G3, bar 1, step 1' }));
    expect(within(roll).getByRole('button', { name: 'G3, bar 1, step 4' })).toHaveAttribute('data-note', 'body');
    expect(audio.played.at(-1)).toMatchObject({ instrument: 'acid', pitch: 55 });
    await userEvent.click(within(roll).getByRole('button', { name: 'G3, bar 1, step 3' }));
    expect(within(roll).getByRole('button', { name: 'G3, bar 1, step 1' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(roll).getByLabelText(/Only notes in/));
    expect(within(roll).getByRole('button', { name: 'F3, bar 1, step 1' })).toBeInTheDocument();
    await userEvent.click(within(roll).getByRole('button', { name: 'Hear E3' }));
    expect(audio.played.at(-1)).toMatchObject({ instrument: 'acid', pitch: 52 });
  });
});
