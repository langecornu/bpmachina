// Tests of the Arrangement: editing sections, opening a pattern, and the export for Open DMX Stage.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App.jsx';
import { createMockEngine } from './audioMocks.js';
import { installMockServer } from './mockServer.js';

beforeEach(async () => {
  installMockServer();
  const audio = await createMockEngine();
  render(<App createEngine={() => audio.engine} />);
  await screen.findByRole('heading', { name: 'Machina Awakens' });
  await userEvent.click(
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Arrangement' }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sectionNames = () => screen.getAllByLabelText('Section').map((input) => input.value);

describe('Arrangement', () => {
  it('adds, renames, repeats, moves and removes sections', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(sectionNames()).toEqual(['Intro', 'Roll', 'Breakdown', 'Drop', 'Intro']);
    const inputs = screen.getAllByLabelText('Section');
    fireEvent.change(inputs[4], { target: { value: 'Outro' } });
    fireEvent.change(screen.getAllByLabelText('Repeats')[4], { target: { value: '3' } });
    expect(screen.getAllByLabelText('Repeats')[4]).toHaveValue(3);
    fireEvent.change(screen.getAllByLabelText('Repeats')[4], { target: { value: '99' } });
    expect(screen.getAllByLabelText('Repeats')[4]).toHaveValue(3);
    const patternSelect = screen.getAllByLabelText('Pattern')[4];
    await userEvent.selectOptions(patternSelect, within(patternSelect).getByRole('option', { name: /Breakdown/ }));
    expect(screen.getByText('6 bars')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Move Outro up' }));
    expect(sectionNames()).toEqual(['Intro', 'Roll', 'Breakdown', 'Outro', 'Drop']);
    await userEvent.click(screen.getByRole('button', { name: 'Move Outro down' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Outro' }));
    expect(sectionNames()).toEqual(['Intro', 'Roll', 'Breakdown', 'Drop']);
    await userEvent.type(screen.getAllByLabelText('Cue for the Machina')[0], ' Soft.');
    expect(screen.getAllByLabelText('Cue for the Machina')[0]).toHaveValue('Kick, hats and the pad only. Soft.');
  });

  it('opens a section’s pattern on the BPM Grid', async () => {
    await userEvent.click(screen.getAllByRole('button', { name: 'Open Breakdown on the BPM Grid' })[0]);
    expect(screen.getByRole('tab', { name: /Breakdown/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('exports the song cue as a file', async () => {
    const created = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob) => (created.push(blob), 'blob:cue'),
      revokeObjectURL: () => {},
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Export for DMX-Stage' }));
    expect(click).toHaveBeenCalled();
    const cue = JSON.parse(await created[0].text());
    expect(cue).toMatchObject({ format: 'bpmachina-song-cue', name: 'Machina Awakens', bpm: 142 });
    expect(await screen.findByText('Exported the song cue for Open DMX Stage')).toBeInTheDocument();
    click.mockRestore();
  });

  it('shows an empty state with no sections', async () => {
    for (const name of ['Remove Intro', 'Remove Roll', 'Remove Breakdown', 'Remove Drop']) {
      await userEvent.click(screen.getByRole('button', { name }));
    }
    expect(screen.getByText('No sections yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export for DMX-Stage' })).toBeDisabled();
  });
});
