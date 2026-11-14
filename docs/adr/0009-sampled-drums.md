# 9. The drums play bundled public-domain samples, with the 909-style synth as a choice and the fallback

Status: accepted. Supersedes the "no samples are bundled" part of ADR 0005; the rest of ADR 0005 (the look-ahead
scheduler, the pure playback plan, the limiter, injected clock and voices) stands.

## Context

The synthesised drums of ADR 0005 (noise bursts through filters, sine sweeps) sound thin next to the recorded kits
psytrance, hard trance and NRG are made with: the kick and hats carry these genres, and a filtered noise hat is the
part that most makes the app sound like an old home computer. ADR 0007 made the drums 909-style synths with Tune and
Decay knobs, which is better, but recorded one-shots get closer at once; and some tracks will still want the synth.
ADR 0005 avoided samples because they need downloading and licensing. ADR 0004 says the app works on this computer
only, so nothing may be fetched from a CDN or a sample library at run time.

## Decision

- **A small bundled kit** in `public/samples/drums/`: thirteen one-shots, three kicks, two snares, three closed hats,
  an open hat, two toms and two percussion hits, about 340 kB in all. Each is public domain (CC0 1.0), taken from
  Sonic Pi's sample library, with its source recorded in `ATTRIBUTIONS.md`. `scripts/prepare-drum-samples.sh`
  rebuilds them from the originals. There is no CC0 clap in that library, so the clap stays synthesised.
- **Mono 16-bit FLAC.** Every browser the app supports decodes FLAC with `decodeAudioData` (Chrome, Edge, Firefox and
  Safari 11 or newer), so one format is enough. It is lossless and sample-accurate: MP3 and AAC add encoder padding at
  the start of each file, which would put every hit a few milliseconds late, and Ogg Opus would need a second format
  for older Safari. FLAC is larger than Opus, but at this length (mostly under a quarter of a second) the whole kit is
  smaller than the app's JavaScript.
- **Served as static files, loaded lazily** (`src/audio/samples.js`): the engine starts fetching them when it makes
  its audio context, which a browser only allows after the first click or key press. They are not in the JavaScript
  bundle, so the first-load budget (`npm run size`) is unchanged.
- **Decoded once per audio context**, each `AudioBuffer` kept for the life of the context.
- **Each hit is an `AudioBufferSourceNode`** started at the note's time on the audio clock, through a gain set by the
  note's velocity (accent included) times a level per drum, into the same output node the synthesised voices use: the
  track's channel strip (ADR 0008). A closed or open hat chokes an open hat that is still ringing.
- **Never silent:** `playNote` plays the sample when it is decoded and the synthesised voice otherwise, so the first
  hits after pressing Play, and any drum whose file failed to fetch or decode, are still heard. A failed file is
  logged once and not retried until the page reloads.
- **A kit per drum track**, in the track's `sound` (`kit`, song format version 4, ADR 0006): one of that drum's
  samples, or `909`, the synthesised voice of ADR 0007 with all its knobs. Absent means the first sample, so a new
  track and every older song play samples; the 3-to-4 migration only raises the version. The kits are listed in
  `shared/sound.js`, so the server validates them and the sound panel offers them.
- **Knobs on samples:** Tune sets the playback rate over the same half-octave either way as the synth; Decay below the
  middle fades the sample out sooner, and above it plays the whole sample, since a recording cannot ring longer than it
  was recorded. Attack and Snappy only shape the synth, so the panel shows them only when the synth is chosen.

## Consequences

The drums sound like recorded drums, from the bundled files only, with no network beyond this computer. The kit adds
about 340 kB to the install and to the first Play, once per page load. The very first hits after opening the page may
be synthesised while the files decode, which is audible as a change of sound in the first bar or so. Attack, Snappy
and the rest of the synth's character do not reach the samples, which follow Tune and Decay only. A closed hat
chokes an open hat of the same kind (sample or synth); a sampled hat does not choke a synthesised open hat or the other
way round. Bringing your own samples remains future work and would build on the same loader and the same `kit` field.
