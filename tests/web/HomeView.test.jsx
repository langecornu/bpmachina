// Tests of Home and the transport bar: the two ways to work, starting over (or not), and looping a pattern.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App.jsx';
import { createMockEngine } from './audioMocks.js';
import { installMockServer } from './mockServer.js';

let server;

beforeEach(async () => {
  server = installMockServer();
  const audio = await createMockEngine();
  render(<App createEngine={() => audio.engine} />);
  await screen.findByRole('heading', { name: 'Machina Awakens' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Home', () => {
  it('leads to the Machina, the BPM Grid and the Arrangement', async () => {
    await userEvent.click(screen.getByRole('button', { name: /Direct the Machina/ }));
    expect(screen.getByRole('heading', { name: 'Direct the Machina' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await userEvent.click(screen.getByRole('button', { name: /Shape it on the BPM Grid/ }));
    expect(screen.getByRole('heading', { name: 'BPM Grid' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await userEvent.click(screen.getByRole('button', { name: /Arrange the song/ }));
    expect(screen.getByRole('heading', { name: 'Arrangement' })).toBeInTheDocument();
  });

  it('does nothing when starting over is cancelled, and reopens the starter song when confirmed', async () => {
    vi.stubGlobal('confirm', () => false);
    await userEvent.click(screen.getByRole('button', { name: 'New empty song' }));
    expect(screen.getByRole('heading', { name: 'Machina Awakens' })).toBeInTheDocument();
    vi.stubGlobal('confirm', () => true);
    server.song = { ...server.song, name: 'Changed' };
    await userEvent.click(screen.getByRole('button', { name: 'Open the starter song' }));
    expect(await screen.findByText('Opened the starter song')).toBeInTheDocument();
  });

  it('plays from the Home button, and loops the first pattern from the transport bar', async () => {
    await userEvent.click(screen.getAllByRole('button', { name: 'Play song' })[0]);
    expect(await screen.findByText('Playing')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Loop pattern' }));
    expect(screen.getByText('Pattern Intro')).toBeInTheDocument();
  });
});
