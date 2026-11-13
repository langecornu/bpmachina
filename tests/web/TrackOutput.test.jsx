// Tests of each track's output on the BPM Grid: the built-in synth or a MIDI output and channel, a drum's note, a
// device that is not connected, and notes reaching the device when drawn and played.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App.jsx';
import { createMockEngine } from './audioMocks.js';
import { accessibilityViolations } from './axe.js';
import { MockMidiAccess, removeRequestMidiAccess, setRequestMidiAccess } from './midiMocks.js';
import { installMockServer } from './mockServer.js';

/**
 * @param {{ devices?: string[] | null, edit?: (song: any) => void }} [options] `devices` null: a browser without MIDI;
 *   otherwise MIDI was turned on in an earlier visit and these outputs are plugged in
 */
async function openGrid({ devices = ['TR-8S', 'TD-3'], edit } = {}) {
  vi.stubGlobal('confirm', () => true);
  const server = installMockServer();
  edit?.(server.song);
  const access = devices ? new MockMidiAccess(devices) : null;
  if (access) {
    localStorage.setItem('bpm-midi', JSON.stringify({ enabled: true, clockOutput: '' }));
    setRequestMidiAccess(vi.fn().mockResolvedValue(access));
  }
  const audio = await createMockEngine();
  const utils = render(<App createEngine={() => audio.engine} />);
  await screen.findByRole('heading', { name: 'Machina Awakens' });
  await userEvent.click(screen.getByRole('button', { name: 'BPM Grid' }));
  return { server, access, audio, ...utils };
}

/** @param {string} track */
async function openOutput(track) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${track} output`) }));
  return screen.getByRole('group', { name: `${track} output` });
}

afterEach(() => {
  vi.unstubAllGlobals();
  removeRequestMidiAccess();
  localStorage.clear();
});

describe('track output', () => {
  it('offers only the built-in synth while MIDI is off, and says where to turn it on', async () => {
    await openGrid({ devices: null });
    const panel = await openOutput('Kick');
    expect(
      within(panel)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Built-in synth']);
    expect(panel).toHaveTextContent('Turn MIDI on in Settings');
    await userEvent.click(screen.getByRole('button', { name: /^Kick output/ }));
    expect(screen.queryByRole('group', { name: 'Kick output' })).not.toBeInTheDocument();
  });

  // Many saved edits and an accessibility check take a while on a busy machine.
  it('sends a drum track to a device on channel 10 with its General MIDI note, or the note chosen', async () => {
    const { server, access, container } = await openGrid();
    const panel = await openOutput('Kick');
    await userEvent.selectOptions(within(panel).getByLabelText('Sound'), 'MIDI: TR-8S');
    expect(within(panel).getByLabelText('Channel')).toHaveValue('10');
    expect(panel).toHaveTextContent('Sends note 36 (General MIDI).');
    expect(screen.getByRole('button', { name: 'Kick output: TR-8S · ch 10' })).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);

    fireEvent.change(within(panel).getByLabelText('Note'), { target: { value: '37' } });
    expect(panel).toHaveTextContent('Sends note 37.');
    fireEvent.change(within(panel).getByLabelText('Note'), { target: { value: '200' } });
    expect(within(panel).getByLabelText('Note'), 'a note out of range is not taken').toHaveValue(37);
    await userEvent.selectOptions(within(panel).getByLabelText('Channel'), '11');
    await userEvent.selectOptions(within(panel).getByLabelText('Sound'), 'MIDI: TD-3');
    expect(within(panel).getByLabelText('Note'), 'the note stays with a new device').toHaveValue(37);
    await waitFor(
      () => expect(server.song.tracks[0].output).toEqual({ kind: 'midi', deviceName: 'TD-3', channel: 11, note: 37 }),
      { timeout: 2000 },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Kick, bar 1, step 2' }));
    expect(access.output('TD-3').messages()).toEqual([
      [0x9a, 37, 90],
      [0x8a, 37, 0],
    ]);

    fireEvent.change(within(panel).getByLabelText('Note'), { target: { value: '' } });
    expect(panel).toHaveTextContent('Sends note 36 (General MIDI).');
  }, 30000);

  it('plays a synth track on its device and channel, and back on the synth when chosen', async () => {
    const { access, audio } = await openGrid();
    const panel = await openOutput('Acid');
    await userEvent.selectOptions(within(panel).getByLabelText('Sound'), 'MIDI: TD-3');
    expect(within(panel).getByLabelText('Channel')).toHaveValue('1');
    expect(within(panel).queryByLabelText('Note'), 'a synth track sends its notes’ pitches').not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Roll/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Loop pattern' }));
    expect(access.output('TD-3').messages()).toContainEqual([0x90, 52, 118]);
    expect(audio.played.some((note) => note.instrument === 'acid')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(access.output('TD-3').messages().at(-1)).toEqual([0xb0, 123, 0]);

    await userEvent.selectOptions(within(panel).getByLabelText('Sound'), 'Built-in synth');
    expect(within(panel).queryByLabelText('Channel')).not.toBeInTheDocument();
  });

  it('keeps a device that is not connected, says so, and plays on the synth', async () => {
    await openGrid({
      devices: ['TR-8S'],
      edit: (song) => {
        song.tracks[3].output = { kind: 'midi', deviceName: 'TB-303 interface', channel: 2 };
      },
    });
    expect(screen.getByText('TB-303 interface · ch 2 (not connected)')).toBeInTheDocument();
    const panel = await openOutput('Bass');
    expect(within(panel).getByLabelText('Sound')).toHaveValue('midi:TB-303 interface');
    expect(panel).toHaveTextContent('TB-303 interface is not connected, so this track plays on the built-in synth.');
  });
});
