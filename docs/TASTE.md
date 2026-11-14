# Your taste profile

A taste profile tells the Machina what you like: tempo, keys, groove, bass, instruments, sound, structure and
transitions, learnt from tracks you love. It is one small JSON file, `server/data/taste.json`, that you can read and
edit by hand. Tick **Compose to my taste** on the Machina screen and the Machina follows it wherever your direction
leaves things open; your direction always wins. Settings shows what the profile says. The design is in
[ADR 0012](adr/0012-taste-profile.md).

Your music never leaves your computer: the tracks are measured locally, and only the measurements are read.

## Make a profile from a folder of tracks (in a chat, no API cost)

1. **Install ffmpeg** once, if `ffmpeg -version` does not answer: `brew install ffmpeg` on a Mac, `sudo apt install
ffmpeg` on Debian or Ubuntu, or a build from https://ffmpeg.org on Windows.
2. **Open a chat with Claude Code in the BPMachina folder** and ask, for example:

   > Analyse the tracks in ~/Music/Psytrance and write my taste profile, following docs/TASTE.md.

3. Claude runs the measuring script, which takes about ten seconds a track:

   ```bash
   node scripts/analyse-tracks.js ~/Music/Psytrance
   ```

   It writes `server/data/taste-analysis.json` (git-ignored). Add `--update` to measure only new or changed tracks
   next time, and `--limit 100` to cap how many are read (200 by default, 500 at most).

4. Claude reads the summary and the tracks, writes `server/data/taste.json`, and checks it:

   ```bash
   node scripts/check-taste.js
   ```

5. Open Settings in BPMachina to see the profile. Edit the file by hand whenever you like; the app reads it fresh.

To refine it later, add tracks to the folder and ask Claude to update the profile, or tell it what to change ("I like
longer breakdowns", "less acid").

## Instructions for Claude, writing the profile

- Read `summary` first, then skim the tracks. Weigh tracks with `tempo.confidence` under 1 lightly: their beat was not
  clear (a tempo change, a non-electronic track).
- `groove.kick`, `sub`, `bass`, `mid` and `high` are how hard each of the 16 steps of a bar is hit in that band, 0 to
  100, over the bars with a kick. Strong `kick` at 0, 4, 8, 12 is four on the floor. In psytrance the rolling bass
  shows as `bass` or `sub` strength on the three steps after each kick (1, 2, 3, 5, 6, 7…); a hard trance or NRG
  offbeat bass on 2, 6, 10, 14. `high` peaks on 2, 6, 10, 14 are offbeat hats; `mid` peaks on 4 and 12 a clap or
  snare. Turn these into `groove.*Steps` and `bass.steps` and `bass.style`.
- `key.candidates` lists the top three keys; full mixes often swap a key with its relative major or minor, so prefer
  what most tracks agree on, the bass roots (`key.bassRoots`), and the genre. `key.degrees` shows each semitone's
  strength above the root: a strong flat second (degree 1) suggests phrygian.
- `sections` (with `startBar`, `bars`, `label`, `energy`, `kick`) and `energy` (0 to 100 and K or - per 4 bars) show
  the arrangement; use the typical lengths for `structure.sections`. Labels are guesses: a "break" is a short kickless
  stretch.
- `transitions` lists what happens going into each section: `riser`, `filter-sweep`, `kick-gap`, `snare-roll`, `drop`,
  `crash`. Count how often each appears for `transitions[].frequency`.
- `balance` (energy share per band) and `loudness.crestDb` (small: loud and compressed) inform `sound`.
- Tags (`genre`, `artist`) and file names help name the genres.
- Acid habits, instrument roles, exact basslines and melodies cannot be measured: fill `acid`, `instruments` and the
  notes from what the person tells you, the genre's conventions, and what the measures suggest, and say so in
  `source.notes`. Ask the person about likes and avoid, and keep their words.
- Set `"source": { "tracks": N, "method": "chat" }` and `updated` to today's date. Keep it short; the example in
  [taste.example.json](taste.example.json) shows every field.

## What the measures can and cannot tell

| Measured well                                   | Approximate                                           | Not measured                        |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| Tempo of a steady electronic track (to 0.1 BPM) | Key and scale (relative major and minor get mixed up) | The notes of the bassline or melody |
| Kick, bass and hat positions in the bar         | Swing                                                 | Chords                              |
| Where the kick drops out and returns            | Section names, risers and filter sweeps               | Which synth or sample made a sound  |
| Spectral balance and loudness                   | Snare rolls and crashes                               | Acid accents and slides             |

## The format

`schemaVersion` (1) and `name` are required; everything else is optional. Steps are positions 0 to 15 in a 16-step
bar, 0 on the beat. Percentages are 0 to 100. `presence` and `frequency` are `rarely`, `sometimes`, `often` or
`always`. The full list of fields and limits is in `server/schemas/tasteSchema.js`.

| Field               | What it holds                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `genres`            | Up to 6, each with a `share` in percent                                                                                              |
| `tempo`             | `min`, `max` and `typical` BPM                                                                                                       |
| `keys`              | `roots` (note names) and `scales` (BPMachina's scales), `notes`                                                                      |
| `groove`            | `swing`, `kickSteps`, `clapSteps`, `hatSteps`, `openHatSteps`, `notes`                                                               |
| `bass`              | `style` (rolling, offbeat, octave, galloping, sustained, melodic, other), `steps`, `noteLength`, `rootShare`, `octaveJumps`, `notes` |
| `acid`              | `presence`, `accentsPerBar`, `slidesPerBar`, `notes`                                                                                 |
| `instruments`       | Up to 14 of BPMachina's instruments, each with `presence` and a `role`                                                               |
| `sound`             | `subBass`, `brightness`, `density`, `reverbSize`, `delayDivision`, `duckAmount`, `notes`                                             |
| `structure`         | `lengthBars` (`min`, `max`), `phraseBars`, `sections` (`kind`, `bars`, `energy`, `kick`, `cue`), `energyCurve`                       |
| `transitions`       | Up to 10, each with `kind`, `frequency`, `bars`, `notes`                                                                             |
| `likes`, `avoid`    | Up to 12 short notes each                                                                                                            |
| `source`, `updated` | How it was made and when; kept for you, not sent to the Machina                                                                      |

The profile is data: the Machina reads it as a description of music, never as instructions, and it cannot change the
Machina's rules or what the app accepts as a song.
