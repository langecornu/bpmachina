// Tests of the BPM Grid: patterns, tracks, accents, and placing notes in the piano roll.
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

  it('accents and slides notes with the piano roll tools and with Shift- and Alt-click', async () => {
    await userEvent.click(screen.getByRole('tab', { name: /Roll/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Acid notes' }));
    const roll = screen.getByRole('region', { name: 'Acid notes' });
    // The starter hook opens on an accent, and its E on step 7 slides into the B after it.
    expect(within(roll).getByRole('button', { name: 'E3, bar 1, step 1, accent' })).toHaveAttribute('data-accent');
    expect(within(roll).getByRole('button', { name: 'E3, bar 1, step 8' })).toHaveAttribute('data-slide');
    await userEvent.click(within(roll).getByRole('button', { name: 'Accent' }));
    await userEvent.click(within(roll).getByRole('button', { name: 'E3, bar 1, step 1, accent' }));
    expect(within(roll).getByRole('button', { name: 'E3, bar 1, step 1' })).not.toHaveAttribute('data-accent');
    await userEvent.click(within(roll).getByRole('button', { name: 'G3, bar 1, step 1' }));
    expect(within(roll).getByRole('button', { name: 'G3, bar 1, step 1' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(roll).getByRole('button', { name: 'Slide' }));
    await userEvent.click(within(roll).getByRole('button', { name: 'G3, bar 1, step 4' }));
    expect(within(roll).getByRole('button', { name: 'G3, bar 1, step 5' })).toHaveAttribute('data-slide');
    await userEvent.click(within(roll).getByRole('button', { name: 'Draw' }));
    fireEvent.click(within(roll).getByRole('button', { name: 'E3, bar 1, step 1' }), { shiftKey: true });
    expect(within(roll).getByRole('button', { name: 'E3, bar 1, step 1, accent' })).toBeInTheDocument();
    fireEvent.click(within(roll).getByRole('button', { name: 'E3, bar 1, step 1, accent' }), { altKey: true });
    expect(within(roll).getByRole('button', { name: 'E3, bar 1, step 1, accent, slide' })).toBeInTheDocument();
    // The pad cannot slide: no Slide tool, and Alt-click draws as usual.
    await userEvent.click(screen.getByRole('button', { name: 'Edit Pad notes' }));
    const pad = screen.getByRole('region', { name: 'Pad notes' });
    expect(within(pad).queryByRole('button', { name: 'Slide' })).not.toBeInTheDocument();
    expect(within(pad).getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('accents a drum hit with Alt-click', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Kick, bar 1, step 1' }), { altKey: true });
    expect(screen.getByRole('button', { name: 'Kick, bar 1, step 1, accent' })).toHaveAttribute('data-accent');
  });

  it('opens a track’s sound knobs, turns them, picks a waveform and resets them', async () => {
    expect(screen.queryByRole('button', { name: 'Pad sound' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Acid sound' }));
    const panel = screen.getByRole('group', { name: 'Acid sound' });
    expect(within(panel).getByLabelText(/Cutoff/)).toHaveValue('35');
    fireEvent.change(within(panel).getByLabelText(/Resonance/), { target: { value: '95' } });
    expect(within(panel).getByLabelText(/Resonance/)).toHaveValue('95');
    await userEvent.click(within(panel).getByRole('button', { name: 'Square' }));
    expect(within(panel).getByRole('button', { name: 'Square' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(panel).getByRole('button', { name: 'Reset' }));
    expect(within(panel).getByLabelText(/Resonance/)).toHaveValue('70');
    expect(within(panel).getByRole('button', { name: 'Reset' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Kick sound' }));
    expect(within(screen.getByRole('group', { name: 'Kick sound' })).getByLabelText(/Attack/)).toHaveValue('50');
    await userEvent.click(screen.getByRole('button', { name: 'Acid sound' }));
    expect(screen.queryByRole('group', { name: 'Acid sound' })).not.toBeInTheDocument();
  });
});
