// Tests of the MIDI hook with a stand-in Web MIDI: support, permission, the outputs list, remembering the choice,
// the clock output, and a screen closing while the browser asks.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMidi } from '../../src/hooks/useMidi.js';
import { MockMidiAccess, removeRequestMidiAccess, setRequestMidiAccess } from './midiMocks.js';

afterEach(() => {
  removeRequestMidiAccess();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useMidi', () => {
  it('reports that the browser has no MIDI, and turning it on does nothing', async () => {
    const { result } = renderHook(() => useMidi());
    expect(result.current.status).toBe('unsupported');
    await act(() => result.current.enable());
    expect(result.current.status).toBe('unsupported');
    expect(result.current.access).toBeNull();
  });

  it('asks only when turned on, without system exclusive, then lists the connected outputs once each', async () => {
    const access = new MockMidiAccess(['TR-8S', 'TD-3', 'TR-8S']);
    access.output('TD-3').state = 'disconnected';
    const request = vi.fn().mockResolvedValue(access);
    setRequestMidiAccess(request);
    const { result } = renderHook(() => useMidi());
    expect(result.current.status).toBe('off');
    expect(request, 'nothing is asked until the person turns MIDI on').not.toHaveBeenCalled();
    await act(() => result.current.enable());
    expect(request).toHaveBeenCalledWith({ sysex: false });
    expect(result.current.status).toBe('ready');
    expect(result.current.access).toBe(access);
    expect(result.current.outputNames).toEqual(['TR-8S']);
  });

  it('follows outputs plugged in and out, and stops following when turned off', async () => {
    const access = new MockMidiAccess(['TR-8S']);
    setRequestMidiAccess(vi.fn().mockResolvedValue(access));
    const { result } = renderHook(() => useMidi());
    await act(() => result.current.enable());
    act(() => access.plugIn('RD-9'));
    expect(result.current.outputNames).toEqual(['TR-8S', 'RD-9']);
    act(() => access.unplug('TR-8S'));
    expect(result.current.outputNames).toEqual(['RD-9']);
    act(() => result.current.disable());
    expect(result.current.status).toBe('off');
    expect(result.current.access).toBeNull();
    expect(access.listeners.size, 'no listener is left behind').toBe(0);
  });

  it('reports a refusal, and can ask again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setRequestMidiAccess(vi.fn().mockRejectedValue(new DOMException('denied', 'SecurityError')));
    const { result } = renderHook(() => useMidi());
    await act(() => result.current.enable());
    expect(result.current.status).toBe('denied');
    setRequestMidiAccess(vi.fn().mockResolvedValue(new MockMidiAccess()));
    await act(() => result.current.enable());
    expect(result.current.status).toBe('ready');
  });

  it('comes back on by itself on the next visit, with the clock output remembered', async () => {
    setRequestMidiAccess(vi.fn().mockResolvedValue(new MockMidiAccess(['TR-8S'])));
    const first = renderHook(() => useMidi());
    await act(() => first.result.current.enable());
    act(() => first.result.current.setClockOutput('TR-8S'));
    first.unmount();

    const request = vi.fn().mockResolvedValue(new MockMidiAccess(['TR-8S']));
    setRequestMidiAccess(request);
    const next = renderHook(() => useMidi());
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    expect(next.result.current.status).toBe('ready');
    expect(next.result.current.clockOutput).toBe('TR-8S');
  });

  it('does not take access for a screen that closed while the browser was asking', async () => {
    let allow;
    setRequestMidiAccess(vi.fn(() => new Promise((resolve) => (allow = resolve))));
    const { result, unmount } = renderHook(() => useMidi());
    let pending;
    act(() => {
      pending = result.current.enable();
    });
    expect(result.current.status).toBe('requesting');
    unmount();
    allow(new MockMidiAccess(['TR-8S']));
    await pending;
    expect(localStorage.getItem('bpm-midi'), 'nothing is remembered').toBeNull();
  });

  it('works without storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setRequestMidiAccess(vi.fn().mockResolvedValue(new MockMidiAccess()));
    const { result } = renderHook(() => useMidi());
    expect(result.current.status).toBe('off');
    expect(result.current.clockOutput).toBe('');
  });
});
