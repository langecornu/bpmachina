// Web MIDI access for playing hardware and other apps. MIDI is off until the person turns it on in Settings (the
// browser asks permission once); after that it comes back on by itself on the next visit, which the browser allows
// without asking again. Follows outputs being plugged in or out. Web MIDI is available in Chrome, Edge and other
// Chromium browsers, and in Firefox with a site permission add-on; Safari has none. Without it, every track plays on
// the built-in synth. The choice to use MIDI and the clock output are kept in this browser, because they depend on
// the gear plugged into this computer; which track goes where is kept in the song.
import { useCallback, useEffect, useRef, useState } from 'react';

import { useStoredState } from './useStoredState.js';

const STORAGE_KEY = 'bpm-midi';
const DEFAULTS = { enabled: false, clockOutput: '' };

/**
 * @typedef {'unsupported' | 'off' | 'requesting' | 'ready' | 'denied'} MidiStatus
 * @typedef {{
 *   status: MidiStatus,
 *   access: any,
 *   outputNames: string[],
 *   clockOutput: string,
 *   enable: () => Promise<void>,
 *   disable: () => void,
 *   setClockOutput: (name: string) => void,
 * }} Midi `access` the browser's MIDI access while ready, else null; `clockOutput` '' for no clock
 */

/**
 * @param {any} access
 * @returns {string[]} the connected outputs' names, each once
 */
function listOutputs(access) {
  const names = [];
  for (const output of access.outputs.values()) {
    if (output.state !== 'disconnected' && output.name && !names.includes(output.name)) {
      names.push(output.name);
    }
  }
  return names;
}

/** @returns {Midi} */
export function useMidi() {
  const isSupported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  const [stored, setStored] = useStoredState(STORAGE_KEY, DEFAULTS);
  const [status, setStatus] = useState(/** @type {MidiStatus} */ (isSupported ? 'off' : 'unsupported'));
  const [access, setAccess] = useState(null);
  const [outputNames, setOutputNames] = useState(/** @type {string[]} */ ([]));
  const isMountedRef = useRef(true);

  const enable = useCallback(async () => {
    if (!isSupported) {
      return;
    }
    setStatus('requesting');
    try {
      // No system exclusive: notes, controllers and clock need none, and asking for it would warn the person.
      const granted = await navigator.requestMIDIAccess({ sysex: false });
      if (!isMountedRef.current) {
        return;
      }
      setAccess(granted);
      setOutputNames(listOutputs(granted));
      setStatus('ready');
      setStored((current) => ({ ...current, enabled: true }));
    } catch (error) {
      console.warn('[midi] access refused', error);
      if (isMountedRef.current) {
        setStatus('denied');
      }
    }
  }, [isSupported, setStored]);

  const disable = useCallback(() => {
    setAccess(null);
    setOutputNames([]);
    setStatus(isSupported ? 'off' : 'unsupported');
    setStored((current) => ({ ...current, enabled: false }));
  }, [isSupported, setStored]);

  const setClockOutput = useCallback(
    (name) => setStored((current) => ({ ...current, clockOutput: name })),
    [setStored],
  );

  // Turned on in an earlier visit: ask again at once, which the browser answers without a prompt once allowed.
  // Only once: turning MIDI on later goes through the button.
  const shouldRestore = stored.enabled && isSupported;
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (shouldRestore && !hasRestoredRef.current) {
      hasRestoredRef.current = true;
      enable();
    }
  }, [enable, shouldRestore]);

  // Follow outputs being plugged in or out.
  useEffect(() => {
    if (!access) {
      return undefined;
    }
    const handleStateChange = () => setOutputNames(listOutputs(access));
    access.addEventListener('statechange', handleStateChange);
    return () => access.removeEventListener('statechange', handleStateChange);
  }, [access]);

  // Setting the flag on mount too keeps this correct under React StrictMode, which mounts, unmounts and mounts again.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { status, access, outputNames, clockOutput: stored.clockOutput, enable, disable, setClockOutput };
}
