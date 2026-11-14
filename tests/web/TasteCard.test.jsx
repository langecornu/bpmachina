// Tests of the taste profile card on Settings: how to make a profile when there is none, what the saved one says,
// what is wrong with a broken one, and a failed load.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TasteCard } from '../../src/components/TasteCard.jsx';
import { accessibilityViolations } from './axe.js';
import { installMockServer } from './mockServer.js';

const example = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../docs/taste.example.json'), 'utf8'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Taste card', () => {
  it('says how to make a profile when there is none', async () => {
    installMockServer();
    render(<TasteCard />);
    expect(await screen.findByText(/No taste profile yet/)).toHaveTextContent('docs/TASTE.md');
  });

  it('shows what the saved profile says, readably', async () => {
    installMockServer({ taste: { status: 'ok', profile: example } });
    const { container } = render(<TasteCard />);
    expect(await screen.findByText(example.name)).toBeInTheDocument();
    expect(screen.getByText('140–146 BPM, usually 143')).toBeInTheDocument();
    expect(screen.getByText('x...x...x...x...')).toBeInTheDocument();
    expect(screen.getByText('.xxx.xxx.xxx.xxx')).toBeInTheDocument();
    expect(screen.getByText(/often, 4 accents a bar, 2 slides a bar/)).toBeInTheDocument();
    expect(screen.getByText(/intro 32 → build 16/)).toBeInTheDocument();
    expect(screen.getByText(/Cheesy major-key melodies/)).toBeInTheDocument();
    expect(screen.getByText(/From 0 tracks, written by hand/)).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);
  });

  it('shows a sparse profile without empty rows', async () => {
    installMockServer({
      taste: { status: 'ok', profile: { schemaVersion: 1, name: 'Bare', source: { tracks: 12, method: 'chat' } } },
    });
    render(<TasteCard />);
    expect(await screen.findByText('Bare')).toBeInTheDocument();
    expect(screen.getByText(/From 12 tracks, made in chat/)).toBeInTheDocument();
    expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
  });

  it('lists what is wrong with a broken profile', async () => {
    installMockServer({ taste: { status: 'invalid', problems: ['tempo.min: Too small'] } });
    render(<TasteCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('tempo.min: Too small');
  });

  it('shows a failed load', async () => {
    installMockServer({ taste: new Error('The server is not answering') });
    render(<TasteCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not answering');
  });
});
