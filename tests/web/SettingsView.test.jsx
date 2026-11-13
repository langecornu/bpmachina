// Tests of the API key card: saving a key that cannot be read back, a refused key, replacing and removing it.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsView } from '../../src/components/SettingsView.jsx';
import { installMockServer } from './mockServer.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Settings', () => {
  it('saves a key, then only says that one is saved', async () => {
    installMockServer({ hasKey: false });
    render(<SettingsView />);
    const field = await screen.findByLabelText('Paste your API key');
    await userEvent.type(field, 'sk-ant-api03-0123456789abcdef');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByText('Key saved')).toBeInTheDocument();
    expect(screen.queryByLabelText('Paste your API key')).not.toBeInTheDocument();
  });

  it('shows why a key was refused', async () => {
    installMockServer({ hasKey: false });
    render(<SettingsView />);
    await userEvent.type(await screen.findByLabelText('Paste your API key'), 'bad-key-0123456789abcdef');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refused');
  });

  it('replaces or removes a saved key', async () => {
    vi.stubGlobal('confirm', () => true);
    installMockServer({ hasKey: true });
    render(<SettingsView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Replace key' }));
    expect(screen.getByLabelText('Paste your API key')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: /Remove key/ }));
    expect(await screen.findByText('The key was removed.')).toBeInTheDocument();
  });
});
