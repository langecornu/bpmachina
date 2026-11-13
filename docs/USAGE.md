# Using BPMachina

A tour of every screen. BPMachina has two sides: **the Machina**, the AI composer you direct, and **the BPM Grid**,
where your hands shape every note. Everything you do is saved as you work, and everything can be undone.

## The frame around every screen

- **Top bar:** the song's name (click to rename), whether it is saved, the tempo in BPM, the key (root and scale), Undo
  and Redo, the master volume, and the light or dark theme.
- **Transport bar** at the bottom: what is playing, the section, bar and beat, and a progress line. **Play song** plays
  the arrangement from the start and loops it; **Loop pattern** loops the pattern open on the BPM Grid.
- **Keys:** Space plays and stops (on the BPM Grid it loops the open pattern); Ctrl or ⌘ Z undoes, with Shift it redoes.
  Neither fires while you type in a field.

## Home

The song at a glance: tempo and key, its length in minutes and bars, its tracks, patterns and notes, and the brief
it was written from. Three cards lead to the three ways to work. **Start over** opens a new empty song or the starter
song (this replaces the song on screen and cannot be undone, so it asks first).

## Machina

Direct the AI composer. It needs your Anthropic API key (see Settings); until then a notice links there.

**Compose a new song**

1. Optionally start from a genre: **Psytrance journey**, **Hard trance anthem** or **NRG rush**. This fills every field
   below, and you can change any of them.
2. Write **the brief**: genre, mood, references in words.
3. Set the **tempo** and **key**, or tick **Machina chooses**.
4. Pick the **band**, or leave it empty and the Machina picks.
5. Lay out the **structure**: each section with a name, a length in bars and a **cue** saying what happens there
   ("drums out, pad and the acid motif, a riser into the drop"). With no structure, give a rough length and the Machina
   chooses one.
6. Choose the **model**: Haiku 5.5 (fastest, cheapest), Sonnet 5.5, or Opus 5.5 (the most careful, the default). Each
   shows a rough cost for this request.
7. Press **Compose**. A full song takes a minute or two.

**Revise this song**

1. Choose **what to revise**: the pattern open on the BPM Grid, or the whole song (which follows each section's cue
   from the Arrangement).
2. Write the **direction**: "harder, double-time hats, the acid line rising an octave in the last bar".
3. **Lock** the tracks the Machina must not touch. Their notes stay exactly as they are.
4. Press **Revise**.

The Machina's answer replaces the song on screen at once. Its note says what it did and what it cost. **Play it**,
**Shape it on the BPM Grid**, or **Undo** to bring back the song from before. Your draft is remembered when you leave
the screen.

## BPM Grid

- **Patterns** are tabs along the top, each with its length in bars. **+** adds one; **Duplicate** copies the open
  one; **Name** and **Length** (1 to 8 bars) change it; **Delete** removes it and the sections that play it.
- **Lanes:** one per track, coloured by instrument, with **M** to mute, a volume slider, the **mix** button (sliders
  icon), and **×** to remove the track (and its notes everywhere).
- **Mix:** the mix button opens a small panel for the track: **Pan** from left to right, how much it sends to the
  **Reverb** and the **Delay**, and **Duck under the kick** (sidechain: the track dips on every kick and comes back in
  time with the tempo). New tracks start where their instrument usually sits: the kick and bass dry and centred, hats
  and percussion a little off centre, the pad and lead in the reverb, the bass, pad and lead ducking. Escape or a click
  elsewhere closes the panel. **Add a track** below the lanes picks an instrument.
- **Drums:** click a step to place or remove a hit; **Shift-click** a hit to cycle it loud, medium, soft.
- **Synths:** click a synth lane to open it in the **piano roll** below. Choose a note length (1/16 to 1 bar), click an
  empty cell to place a note, click a note to remove it. Rows show only the notes in the song's key until you untick
  **Only notes in…**; the key's root is highlighted. Click a note name to hear it.
- New notes are heard as you place them, and in the music on the next loop.

## Arrangement

The song in order. A strip shows each section's length and energy, and where playback is. Each section has a
**name**, the **pattern** it plays, how many times it **repeats**, its length in bars, an energy meter, and a **cue**
for the Machina. Buttons open the section's pattern on the BPM Grid, move it up or down, or remove it. **Add section**
adds one at the end.

**Effects** below the sections are shared by every track:

- **Reverb:** **Size** (a small room to a huge hall), **Decay** (a short or long tail) and its **Level**.
- **Delay:** a ping-pong echo that bounces left and right, timed to the tempo: **Time** 1/16, 1/8, 1/8 dotted or 1/4;
  **Feedback** (how many repeats), **Tone** (dark to bright repeats) and **Level**.
- **Sidechain:** how deep ducking tracks dip on each kick (**Amount**) and how long they take to come back
  (**Release**, in beats).

**Export for DMX-Stage** saves a `.cue.json` file with the tempo, the length, and each section's start bar and energy,
for [Open DMX Stage](https://github.com/langecornu/open-dmx-stage) to light the song.

## Settings

Paste your **Anthropic API key**. It is checked with Anthropic, saved on this computer for your user only, and never
shown again: you can only replace or remove it. If the server was started with `ANTHROPIC_API_KEY`, that key is used
and the screen says so. Each composition is billed to your Anthropic account.
