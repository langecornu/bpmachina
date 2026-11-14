// Tests of Settings: the API key card (saving a key that cannot be read back, a refused key, replacing and removing
// it) and the MIDI card (no MIDI, turning it on, a refusal, the outputs and the clock output).
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsView } from '../../src/components/SettingsView.jsx';
import { useMidi } from '../../src/hooks/useMidi.js';
import { accessibilityViolations } from './axe.js';
import { MockMidiAccess, removeRequestMidiAccess, setRequestMidiAccess } from './midiMocks.js';
import { installMockServer } from './mockServer.js';

function Settings() {
  return <SettingsView midi={useMidi()} />;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  removeRequestMidiAccess();
  localStorage.clear();
});

describe('Settings', () => {
  it('saves a key, then only says that one is saved', async () => {
    installMockServer({ hasKey: false });
    render(<Settings />);
    const field = await screen.findByLabelText('Paste your API key');
    await userEvent.type(field, 'sk-ant-api03-0123456789abcdef');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByText('Key saved')).toBeInTheDocument();
    expect(screen.queryByLabelText('Paste your API key')).not.toBeInTheDocument();
  });

  it('shows why a key was refused', async () => {
    installMockServer({ hasKey: false });
    render(<Settings />);
    await userEvent.type(await screen.findByLabelText('Paste your API key'), 'bad-key-0123456789abcdef');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refused');
  });

  it('replaces or removes a saved key', async () => {
    vi.stubGlobal('confirm', () => true);
    installMockServer({ hasKey: true });
    render(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Replace key' }));
    expect(screen.getByLabelText('Paste your API key')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: /Remove key/ }));
    expect(await screen.findByText('The key was removed.')).toBeInTheDocument();
  });
});

describe('MIDI settings', () => {
  it('says plainly when the browser has no MIDI, and that the synth plays', async () => {
    installMockServer();
    render(<Settings />);
    expect(screen.getByText(/This browser cannot send MIDI/)).toHaveTextContent('built-in synth');
    expect(screen.getByText(/This browser cannot send MIDI/)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Turn on MIDI' })).not.toBeInTheDocument();
  });

  it('turns MIDI on, lists the outputs, follows a new one and sends clock to the one chosen', async () => {
    installMockServer();
    const access = new MockMidiAccess(['TR-8S', 'TD-3']);
    setRequestMidiAccess(vi.fn().mockResolvedValue(access));
    const { container } = render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on MIDI' }));
    expect(await screen.findByText('MIDI on')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'MIDI outputs' });
    expect(list).toHaveTextContent('TR-8S');
    expect(list).toHaveTextContent('TD-3');
    act(() => access.plugIn('RD-9'));
    expect(list).toHaveTextContent('RD-9');
    await userEvent.selectOptions(screen.getByLabelText('Send MIDI clock to'), 'RD-9');
    expect(screen.getByLabelText('Send MIDI clock to')).toHaveValue('RD-9');
    act(() => access.unplug('RD-9'));
    expect(screen.getByRole('option', { name: 'RD-9 (not connected)' })).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Turn off MIDI' }));
    expect(screen.getByRole('button', { name: 'Turn on MIDI' })).toBeInTheDocument();
  });

  it('says when no outputs are plugged in', async () => {
    installMockServer();
    setRequestMidiAccess(vi.fn().mockResolvedValue(new MockMidiAccess()));
    render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on MIDI' }));
    expect(await screen.findByText(/No MIDI outputs found/)).toBeInTheDocument();
  });

  it('shows the wait for permission, then a refusal with a way to try again', async () => {
    installMockServer();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let refuse;
    setRequestMidiAccess(vi.fn(() => new Promise((_resolve, reject) => (refuse = reject))));
    render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on MIDI' }));
    expect(screen.getByText(/Waiting for the browser/)).toBeInTheDocument();
    await act(async () => refuse(new Error('denied')));
    expect(screen.getByRole('alert')).toHaveTextContent('did not allow MIDI');
    setRequestMidiAccess(vi.fn().mockResolvedValue(new MockMidiAccess(['TR-8S'])));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('MIDI on')).toBeInTheDocument();
  });
});
