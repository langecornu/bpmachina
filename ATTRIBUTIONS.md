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

- Every instrument is synthesised in the browser with the Web Audio API (W3C); no samples are bundled.
- Pitches are MIDI note numbers (MIDI 1.0, The MIDI Association); no MIDI data or code is bundled.
- The look, the design tokens and the shared server code come from the sibling project
  [Open DMX Stage](https://github.com/langecornu/open-dmx-stage) (MIT). The song cue export follows the song fields that
  Open DMX Stage's AI shows read.
