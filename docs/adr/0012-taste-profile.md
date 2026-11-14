# 12. A library of taste profiles learnt from the person's tracks, read by the Machina as data

Status: accepted

## Context

The person wants the Machina to compose to their taste: the sound, beat and groove, instruments, basslines,
transitions and arrangement of the tracks they love. They want to point at a folder of music, have it analysed, and get
a preference file the Machina can read. To keep API costs down, the analysis should first run from a chat with Claude
Code (phase 1), and later from inside the app (phase 2). Their music must never be uploaded, and the result must be
small and readable enough to edit by hand. A person's taste spans many styles (they may end up with fifty), so the
preferences must be kept per style and found again by style, mood and intensity.

## Decision

- **A library of tastes, one file each**: `tastes/<id>.json` in the data folder (git-ignored), where the id is a slug
  (`full-on-psytrance`), so a person or Claude edits one taste without touching the others, and a broken file costs
  only itself. At most 200. Each taste carries a required **style**, up to eight **moods** and an **intensity** (0 to
  100, shown as low, medium or high), which the library is filtered by. One file per taste was preferred to one big
  file with many profiles: hand edits and chat updates stay small and safe, and a list reads only labels.
- **A versioned JSON profile in BPMachina's own terms**, validated by a strict zod schema (`server/schemas/tasteSchema.js`, limits and vocabulary in `shared/taste.js`, types in
  `shared/types.js`). Fields: genres with shares; tempo range; keys and scales; groove (swing, and kick, clap, hat and
  open-hat steps as positions 0 to 15 in a 16-step bar); bass (a style such as rolling or offbeat, its steps, note
  length, how much it stays on the root, octave jumps); acid habits (accents and slides per bar); instruments with how
  often they are heard and their role; sound and mix hints (sub bass, brightness, density, reverb size, delay
  division, duck amount); structure (length in bars, phrase length, sections with bars, energy and kick); transitions
  (riser, snare roll, fill, kick gap, filter sweep, crash, drop, with how often and how long); likes and avoid notes.
  Every field but the version, the name and the style is optional, every string and list is bounded, unknown fields are refused.
  `docs/taste.example.json` is a hand-written example, checked by the tests.
- **Phase 1, from a chat, no API cost.** `scripts/analyse-tracks.js <folder>` measures every audio file in a folder
  on this computer and writes `server/data/taste-analysis.json`; Claude Code reads the summary and the per-track
  measures in the chat, groups the tracks by style, and writes or updates one taste per style; `scripts/check-taste.js` validates it. The steps are in
  [docs/TASTE.md](../TASTE.md).
- **Measured locally with ffmpeg and plain JavaScript.** ffmpeg (installed by the person, run as a separate program
  with an argument list, local files only, time-limited) decodes each file to mono samples; `scripts/lib/` measures
  them with no new npm dependency and no native add-on: tempo (a comb search over the onset strength, to hundredths of
  a BPM), the beat phase from the kick, the downbeat from where the sound changes, a 16-step strength profile per band
  (kick, sub, bass, mids, hats), swing, key (Krumhansl-Kessler profiles over pitch-class strength, the bass counted with
  the harmony), spectral balance, loudness and crest factor, energy and kick per bar, sections and transitions. Python
  libraries (librosa, Essentia, madmom) and stem separation (Demucs) were considered: they would add a second runtime
  and large models for this first step, and Essentia's AGPL licence would need care. They remain options for a better
  bass transcription later.
- **Honest about limits.** The script measures, Claude interprets, the person confirms. Exact basslines, chords and
  melodies need transcription and are not attempted; the bass steps come from when the low end is hit, not from its
  notes. Key detection on full mixes often confuses a key with its relative major or minor, so the top candidates are
  kept. Section names are guesses from the kick and the energy. Swing is approximate.
- **The Machina reads the profile as data, after the cached system prompt.** When the person picks a taste under
  "Compose to my taste", the request carries its `tasteId`; the server reads and validates that file and sends it as the first
  block of the user turn, compact JSON between `<taste_profile>` tags with every `<` escaped, with words saying it
  describes music, is not instructions, yields to the direction, and must not lead to copying a track. That block has
  its own cache breakpoint, since the same profile is sent with every composition. The system prompt is unchanged, so
  its cache holds. The bookkeeping (version, date, source) is not sent. Without a usable profile the request is
  refused before any call to Anthropic.
- **Managed in the app.** `GET /api/v1/tastes` lists every taste's labels, with the files that cannot be used and up to
  five problems each (field paths, never file paths); `GET`, `PUT` and `DELETE /api/v1/tastes/:id` read, save
  (validated against the schema, written atomically) and delete one. An id must match the slug pattern, so a request
  never names a path. Delete moves the file to `tastes/deleted/`, never erases it. Settings filters the library by
  words, style, mood and intensity, shows a taste, edits its labels (name, style, moods, intensity, likes, avoid),
  and duplicates it to make a variation; the measured music is changed by remaking the taste from tracks, or by hand.
  The Machina screen offers the tastes grouped by style. Files are read fresh on each request so a hand edit shows at
  once; a file written by a newer version is refused.

## Phase 2, sketched (not built)

An in-app analysis route, `POST /api/v1/taste/analyse { folder }`, that runs the same `scripts/lib/` code in a worker
thread on the server: the folder is a path on the computer running BPMachina, checked as phase 1 does (real path, a
folder, no links followed, audio files only, counts and sizes capped), and only allowed while the server listens on
this computer (ADR 0004), since a path is meaningless from another device. Progress streams back to the page. Then the
measurements summary (not the audio) goes to Claude with a fixed prompt and a structured output in the profile's
schema, at a cost shown first like a composition, and the result is shown for the person to accept before it is saved as a
taste (`PUT /api/v1/tastes/:id`, which exists already).

## Consequences

The Machina can compose to a person's taste with no change to the song format or the system prompt. Phase 1 costs
nothing in API calls, needs ffmpeg installed, and takes about ten seconds a track on a laptop. A profile is only as
good as the measures and their reading: it describes tendencies, and the person's direction always wins. Because the
profile is untrusted data in the prompt, a profile cannot change the Machina's rules, and the answer still goes
through `shared/composition.js` and the song schema.
