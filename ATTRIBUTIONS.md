# Attributions

BPMachina is built on open-source software. Thank you to their authors. Runtime dependencies are MIT licensed unless
the table says otherwise; every licence is compatible with this project's licence, GPL-3.0-or-later (versions as installed; see
`package-lock.json`).

## Runtime dependencies

| Package            | Use                                     | Project                                                  |
| ------------------ | --------------------------------------- | -------------------------------------------------------- |
| @anthropic-ai/sdk  | The Machina Engine (Apache-2.0)         | https://github.com/anthropics/anthropic-sdk-typescript   |
| React, React DOM   | UI                                      | https://github.com/facebook/react                        |
| Express            | HTTP server                             | https://github.com/expressjs/express                     |
| cors               | CORS middleware                         | https://github.com/expressjs/cors                        |
| helmet             | Security headers                        | https://github.com/helmetjs/helmet                       |
| express-rate-limit | Rate limiting                           | https://github.com/express-rate-limit/express-rate-limit |
| zod                | Input validation and the answer's shape | https://github.com/colinhacks/zod                        |

## Build and quality tooling

Vite and `@vitejs/plugin-react` (https://github.com/vitejs/vite), ESLint (https://github.com/eslint/eslint),
Prettier (https://github.com/prettier/prettier), concurrently (https://github.com/open-cli-tools/concurrently), all MIT.
Tests and checks, not shipped in the app: Vitest and its v8 coverage, jsdom, Testing Library and the ESLint React and
accessibility plugins (MIT), TypeScript for type checking (Apache-2.0), and axe-core for accessibility checks (MPL-2.0).

## Fonts

- **Manrope** by Mikhail Sharanda, SIL Open Font License 1.1, bundled locally through the
  `@fontsource-variable/manrope` package (https://fontsource.org/fonts/manrope).

## Sound, formats and design

- The synths, the clap and the 909-style drum kit are synthesised in the browser with the Web Audio API (W3C). The
  other drums play by default the public-domain samples listed under Drum samples below.
- The acid voice and the drum kit are modelled by ear and from published descriptions of classic analogue machines,
  and are described as "303-style" and "909-style". The ladder filter follows the textbook zero-delay-feedback design
  (V. Zavalishin, _The Art of VA Filter Design_); no code or circuit was copied.
- TB-303 and TR-909 are trademarks of Roland Corporation. BPMachina is not affiliated with, endorsed or sponsored by
  Roland Corporation; the names are used only to describe the style of sound.
- Pitches are MIDI note numbers (MIDI 1.0, The MIDI Association); no MIDI data or code is bundled.
- MIDI out sends MIDI 1.0 channel messages, MIDI clock and song position (The MIDI Association) through the browser's
  Web MIDI API (W3C); drum tracks default to General MIDI percussion note numbers. No MIDI library is used.
- The look, the design tokens and the shared server code come from the sibling project
  [Open DMX Stage](https://github.com/langecornu/open-dmx-stage) (MIT). The song cue export follows the song fields that
  Open DMX Stage's AI shows read.

## Drum samples

The files in `public/samples/drums/` are public domain, dedicated under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They come from the sample library of
[Sonic Pi](https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples), whose samples README lists each one as CC0
and originally shared on Freesound, and were changed here by `scripts/prepare-drum-samples.sh`: mixed to mono,
peak-normalised to -1 dBFS, trimmed, faded and saved as 16-bit FLAC. No attribution is required; it is given with
thanks.

| File                  | Sonic Pi sample      | Original on Freesound                            |
| --------------------- | -------------------- | ------------------------------------------------ |
| `kick-tek.flac`       | `bd_tek`             | DWSD, https://freesound.org/s/171104/            |
| `kick-haus.flac`      | `bd_haus`            | Rodrigo The Mad, https://freesound.org/s/137722/ |
| `kick-zum.flac`       | `bd_zum`             | n1ghthawk, https://freesound.org/s/172124/       |
| `snare-electro.flac`  | `elec_hi_snare`      | looppool, https://freesound.org/s/13125/         |
| `snare-dub.flac`      | `sn_dub`             | Adriak909, https://freesound.org/s/173142/       |
| `hat-tight.flac`      | `drum_cymbal_closed` | menegass, https://freesound.org/s/100053/        |
| `hat-zild.flac`       | `hat_zild`           | pjcohen, https://freesound.org/s/45668/          |
| `hat-psych.flac`      | `hat_psych`          | PSYCHO BOOMER, https://freesound.org/s/42548/    |
| `openhat-cymbal.flac` | `drum_cymbal_open`   | menegass, https://freesound.org/s/100055/        |
| `tom-low.flac`        | `drum_tom_lo_hard`   | menegass, https://freesound.org/s/100064/        |
| `tom-fuzz.flac`       | `elec_fuzz_tom`      | looppool, https://freesound.org/s/13140/         |
| `perc-blip.flac`      | `elec_blip`          | looppool, https://freesound.org/s/13121/         |
| `perc-tick.flac`      | `elec_tick`          | looppool, https://freesound.org/s/13113/         |
