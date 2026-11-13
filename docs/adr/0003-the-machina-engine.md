# 3. The Machina Engine calls Claude from the server, and its answer is data, never trusted as a song

Status: accepted

## Context

BPMachina's idea is a split: the person sets the pulse and the direction, and an AI does the heavy lifting of writing
notes. The AI must follow direction closely (a brief, a structure with a cue per section, tempo, key, band), revise
part of a song without disturbing the rest, and never cost the person their work. Calling it needs an API key that
costs the owner money.

## Decision

- **Claude through the official Anthropic SDK, on the server only** (`server/services/machinaEngine.js`). The browser
  never talks to Anthropic and never sees the key. The person picks Claude Haiku 5.5, Sonnet 5.5 or Opus 5.5 (the
  default) for each composition, with a cost estimate first. It runs at medium effort, streamed, with up to 64,000
  output tokens, and with server-side refusal fallbacks (`fallbacks: "default"`) on Sonnet and Opus. The system prompt
  is stable and cached.
- **A write-only key**, pasted once on Settings, checked with Anthropic, stored in `server/data/secrets.json` for the
  owner only; no route returns it. `ANTHROPIC_API_KEY` in the environment takes precedence. (Same as Open DMX Stage's
  ADR 0007.)
- **Structured outputs** fix the answer's shape (tracks, patterns of notes, sections). **`shared/composition.js`**
  then treats it as untrusted data: only known instruments, notes moved onto the grid and folded by octaves into each
  instrument's range, duplicates and dangling references dropped, every number clamped and every list capped. The
  result must pass the same song schema as anything the browser saves.
- **Revisions merge, they do not replace.** A pattern revision changes only that pattern's notes. A song revision keeps
  pattern ids where names match, the person's brief, and their cues where the answer leaves one empty. **Locked tracks**
  keep their notes exactly in every pattern that existed; the AI is told not to change them, and the merge enforces it
  anyway.
- **The browser applies the result**, through the same undoable edit as any other change, so one Undo brings back the
  song from before. The server does not save the answer itself.
- **Rate limited** to six compositions a minute, one at a time.

## Consequences

The Machina needs an internet connection and an Anthropic account; everything else works without them. Revising the
whole song sends every note and asks for every note back, which costs more than revising a pattern; the estimate says
so. Locks are guaranteed by code, not by the model's obedience.
