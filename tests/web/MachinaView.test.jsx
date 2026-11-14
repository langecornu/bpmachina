// Tests of directing the Machina from the screen: the key notice, presets, the request sent, the result replacing the
// song with one Undo to bring it back, revisions with locks, and errors.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App.jsx';
import { createMockEngine } from './audioMocks.js';
import { installMockServer, makeId } from './mockServer.js';
import { createEmptySong } from '../../shared/song.js';

async function openMachina(options) {
  const server = installMockServer(options);
  const audio = await createMockEngine();
  render(<App createEngine={() => audio.engine} />);
  await screen.findByRole('heading', { name: 'Machina Awakens' });
  await userEvent.click(
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Machina' }),
  );
  return server;
}

const composed = () => ({ ...createEmptySong(makeId), name: 'Written by the Machina' });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Machina screen', () => {
  it('asks for a key first, and links to Settings', async () => {
    await openMachina({ hasKey: false });
    expect(await screen.findByText(/Add it in Settings/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compose' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('fills the form from a preset and sends the direction', async () => {
    const server = await openMachina({
      compose: (_body, reply) =>
        reply(200, {
          song: composed(),
          summary: 'A dark roller.',
          model: 'claude-opus-5-5',
          usage: { inputTokens: 2000, outputTokens: 20000 },
        }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Psytrance journey' }));
    expect(screen.getByLabelText('Section 1 name')).toHaveValue('Intro');
    expect(screen.getByLabelText('Acid')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Remove section 5' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a section' }));
    expect(screen.getByLabelText('Section 5 name')).toHaveValue('Part 5');
    await userEvent.click(screen.getByLabelText(/Sonnet 5.5/));
    await userEvent.click(screen.getByRole('button', { name: 'Compose' }));
    expect(await screen.findByText('A dark roller.')).toBeInTheDocument();
    const [sent] = server.composeRequests;
    expect(sent).toMatchObject({
      mode: 'new',
      bpm: 142,
      key: { root: 'E', scale: 'phrygian' },
      model: 'claude-sonnet-5-5',
    });
    expect(sent.sections.map((section) => section.name)).toEqual(['Intro', 'Build', 'Breakdown', 'Drop', 'Part 5']);
    expect(screen.getByLabelText('Song name')).toHaveValue('Written by the Machina');
    expect(screen.getByText(/cost about 41¢/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo the Machina’s change' }));
    expect(screen.getByLabelText('Song name')).toHaveValue('Machina Awakens');
  });

  it('remembers the draft when leaving the screen', async () => {
    await openMachina();
    await userEvent.type(screen.getByLabelText('The brief'), 'Hard and fast');
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Machina' }),
    );
    expect(screen.getByLabelText('The brief')).toHaveValue('Hard and fast');
  });

  it('lets the person set tempo and key, or leave them to the Machina', async () => {
    await openMachina();
    const [tempoChoice, keyChoice] = screen.getAllByLabelText('Machina chooses');
    await userEvent.click(tempoChoice);
    fireEvent.change(screen.getByLabelText('Tempo for the new song'), { target: { value: '300' } });
    expect(screen.getByLabelText('Tempo for the new song')).toHaveValue(220);
    await userEvent.click(keyChoice);
    await userEvent.selectOptions(screen.getByLabelText('Key root for the new song'), 'A');
    await userEvent.selectOptions(screen.getByLabelText('Scale for the new song'), 'dorian');
    fireEvent.change(screen.getByLabelText('Song length in bars'), { target: { value: '64' } });
    expect(screen.getByLabelText('Song length in bars')).toHaveValue(64);
    await userEvent.click(screen.getByLabelText('Kick'));
    await userEvent.click(screen.getByLabelText('Kick'));
    expect(screen.getByLabelText('Kick')).not.toBeChecked();
  });

  it('revises the open pattern with locked tracks', async () => {
    const server = await openMachina({
      compose: (body, reply) =>
        reply(200, {
          song: server.song,
          summary: 'Harder.',
          model: 'claude-opus-5-5',
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Revise this song' }));
    expect(screen.getByRole('button', { name: 'Revise' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Direction'), 'Harder');
    await userEvent.click(screen.getByLabelText('Kick'));
    await userEvent.click(screen.getByLabelText('Bass'));
    await userEvent.click(screen.getByLabelText('Bass'));
    await userEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(await screen.findByText('Harder.')).toBeInTheDocument();
    const [sent] = server.composeRequests;
    expect(sent.mode).toBe('revise');
    expect(sent.patternId).toBe(server.song.patterns[0].id);
    expect(sent.lockedTrackIds).toEqual([server.song.tracks[0].id]);
    await userEvent.click(screen.getByLabelText(/The whole song/));
    await userEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(server.composeRequests[1].patternId).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Shape it on the BPM Grid/ }));
    expect(screen.getByRole('heading', { name: 'BPM Grid' })).toBeInTheDocument();
  });

  it('composes to a taste picked from the library, grouped by style', async () => {
    const server = await openMachina({
      tastes: {
        night: { schemaVersion: 1, name: 'Night psy', style: 'Psytrance', moods: ['dark'], intensity: 85 },
        rumble: { schemaVersion: 1, name: 'Rumble', style: 'Techno' },
      },
      compose: (_body, reply) =>
        reply(200, {
          song: composed(),
          summary: 'To taste.',
          model: 'claude-opus-5-5',
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
    });
    const picker = await screen.findByLabelText('Compose to my taste');
    await screen.findByRole('option', { name: 'Night psy · dark · High' });
    expect(within(picker).getByRole('group', { name: 'Techno' })).toBeInTheDocument();
    await userEvent.selectOptions(picker, 'night');
    expect(screen.getByText(/Your direction always wins/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('The brief'), 'Anything');
    await userEvent.click(screen.getByRole('button', { name: 'Compose' }));
    expect(await screen.findByText('To taste.')).toBeInTheDocument();
    expect(server.composeRequests[0].tasteId).toBe('night');
    await userEvent.selectOptions(picker, '');
    await userEvent.click(screen.getByRole('button', { name: 'Compose' }));
    await vi.waitFor(() => expect(server.composeRequests).toHaveLength(2));
    expect(server.composeRequests[1].tasteId).toBeNull();
  });

  it('points to Settings when the library is empty', async () => {
    await openMachina();
    expect(await screen.findByText(/No tastes yet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Compose to my taste')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Tastes in Settings' }));
    expect(screen.getByRole('heading', { name: 'Your tastes' })).toBeInTheDocument();
  });

  it('shows the reason when composing fails', async () => {
    await openMachina({ compose: (_body, reply) => reply(429, { error: 'The API key has reached its usage limit.' }) });
    await userEvent.type(screen.getByLabelText('The brief'), 'Anything');
    await userEvent.click(screen.getByRole('button', { name: 'Compose' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('usage limit');
    expect(screen.getByLabelText('Song name')).toHaveValue('Machina Awakens');
  });
});
