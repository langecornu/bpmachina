// Tests of the taste library on Settings: how to start when it is empty, finding a taste among many by words, style,
// mood and intensity, what a taste says, editing its labels, duplicating and deleting it, broken files and a failed
// load.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TasteLibrary } from '../../src/components/TasteLibrary.jsx';
import { accessibilityViolations } from './axe.js';
import { installMockServer } from './mockServer.js';

const example = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../docs/taste.example.json'), 'utf8'));

const library = () => ({
  night: example,
  sunrise: { schemaVersion: 1, name: 'Sunrise', style: 'Full-on psytrance', moods: ['euphoric'], intensity: 55 },
  rumble: { schemaVersion: 1, name: 'Rumble', style: 'Peak-time techno', moods: ['dark'], intensity: 75 },
  sketch: { schemaVersion: 1, name: 'Bare', style: 'Goa' },
});

const tasteButton = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Taste library', () => {
  it('says how to make tastes when there are none', async () => {
    installMockServer();
    render(<TasteLibrary />);
    expect(await screen.findByText(/No tastes yet/)).toHaveTextContent('docs/TASTE.md');
  });

  it('finds tastes by words, style, mood and intensity', async () => {
    installMockServer({ tastes: library() });
    const { container } = render(<TasteLibrary />);
    expect(await screen.findByText('4 of 4 tastes')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Style'), 'Full-on psytrance');
    expect(screen.getByText('2 of 4 tastes')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Intensity'), 'medium');
    expect(screen.getByText('1 of 4 tastes')).toBeInTheDocument();
    expect(tasteButton('Sunrise')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Style'), '');
    await userEvent.selectOptions(screen.getByLabelText('Intensity'), '');
    await userEvent.selectOptions(screen.getByLabelText('Mood'), 'dark');
    expect(screen.getByText('2 of 4 tastes')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Mood'), '');
    await userEvent.type(screen.getByLabelText('Find'), 'rumble');
    expect(screen.getByText('1 of 4 tastes')).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);
  });

  it('shows what a taste says, readably', async () => {
    installMockServer({ tastes: library() });
    const { container } = render(<TasteLibrary />);
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${example.name}`) }));
    const details = await screen.findByRole('region', { name: `Taste: ${example.name}` });
    expect(within(details).getByText('140–146 BPM, usually 143')).toBeInTheDocument();
    expect(within(details).getByText('x...x...x...x...')).toBeInTheDocument();
    expect(within(details).getByText('.xxx.xxx.xxx.xxx')).toBeInTheDocument();
    expect(within(details).getByText('High (80)')).toBeInTheDocument();
    expect(within(details).getByText(/often, 4 accents a bar, 2 slides a bar/)).toBeInTheDocument();
    expect(within(details).getByText(/intro 32 → build 16/)).toBeInTheDocument();
    expect(within(details).getByText(/From 0 tracks, written by hand/)).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);
    await userEvent.click(tasteButton('Bare'));
    expect(await screen.findByRole('region', { name: 'Taste: Bare' })).toBeInTheDocument();
    expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
  });

  it('edits a taste’s labels and keeps the rest of it', async () => {
    const server = installMockServer({ tastes: library() });
    render(<TasteLibrary />);
    await userEvent.click(await screen.findByRole('button', { name: /^Sunrise/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit labels' }));
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Sunrise set');
    await userEvent.click(screen.getByRole('button', { name: '+ hypnotic' }));
    await userEvent.type(
      screen.getByLabelText('Likes, one per line'),
      'Big melodies{enter}Big melodies{enter}Rolling bass',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save taste' }));
    expect(await screen.findByRole('region', { name: 'Taste: Sunrise set' })).toBeInTheDocument();
    const [saved] = server.tasteSaves;
    expect(saved.id).toBe('sunrise');
    expect(saved.profile).toMatchObject({
      name: 'Sunrise set',
      style: 'Full-on psytrance',
      moods: ['euphoric', 'hypnotic'],
      intensity: 55,
      likes: ['Big melodies', 'Rolling bass'],
    });
    expect(saved.profile.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await userEvent.click(screen.getByRole('button', { name: 'Edit labels' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit labels' })).toBeInTheDocument();
  });

  it('duplicates a taste under a new id, and deletes one after asking', async () => {
    vi.stubGlobal('confirm', () => true);
    const server = installMockServer({ tastes: library() });
    render(<TasteLibrary />);
    await userEvent.click(await screen.findByRole('button', { name: /^Rumble/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByRole('region', { name: 'Taste: Rumble (copy)' })).toBeInTheDocument();
    expect(server.tasteSaves[0].id).toBe('rumble-copy');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('4 of 4 tastes')).toBeInTheDocument();
    expect(server.tastes['rumble-copy']).toBeUndefined();
  });

  it('lists the taste files it cannot use', async () => {
    installMockServer({ tastes: library(), tasteProblems: [{ id: 'old', problems: ['tempo.min: Too small'] }] });
    render(<TasteLibrary />);
    expect(await screen.findByRole('alert')).toHaveTextContent('old.json: tempo.min: Too small');
  });

  it('shows a failed load', async () => {
    installMockServer({ tastes: new Error('The server is not answering') });
    render(<TasteLibrary />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not answering');
  });
});
