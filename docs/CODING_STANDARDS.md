# Coding standards

The rules for code in BPMachina: **Node.js** (server), **React** and **Vite** (browser), plus a few rules that are
specific to a music composer with an AI engine. They are adapted from the sibling project Open DMX Stage, keeping only
what applies here.

Tags used below:

- **(met)** the code already follows this rule.
- **(gap)** not yet true everywhere. Adopt it for new code and when touching a file. Known gaps are listed in
  [Status and known gaps](#status-and-known-gaps).

**Match the sibling files in the same folder** unless the fix is small and risk-free.

Contents: [Tooling](#tooling) · [Formatting and style](#formatting-and-style) · [Part 1: Node.js](#part-1-nodejs) ·
[Part 2: React and Vite](#part-2-react-and-vite) · [Part 3: Project rules](#part-3-project-rules) ·
[Quick reference](#quick-reference) · [Status and known gaps](#status-and-known-gaps)

## Tooling

Run these before calling work done, and in CI:

```bash
npm run lint     # ESLint (flat config in eslint.config.js)
npm test         # node:test suite in tests/
npm run build    # Vite production build must succeed
npm audit --omit=dev
```

Prettier (`.prettierrc`) is the formatter; run `npm run format`. Formatting-only changes go in their own commit so they
do not bury real changes.

---

# Formatting and style

Enforced by Prettier and ESLint, so nobody argues about it in review.

| Topic                          | Rule                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Indent                         | 2 spaces, never tabs                                                                     |
| Braces                         | K&R: `{` on the same line, `} else {` cuddled                                            |
| Braces on `if`, `for`, `while` | always, even for one-line bodies (ESLint `curly: all`)                                   |
| Quotes                         | single `'` in JS; double `"` in JSX attributes and HTML                                  |
| Semicolons                     | required                                                                                 |
| Trailing commas                | on multiline structures                                                                  |
| Line length                    | about 120                                                                                |
| Blank lines                    | one between functions or logical groups, never more than one; file ends with one newline |
| Declarations                   | one `const` or `let` per statement; never `var`                                          |

```
RULES (all JS and JSX):
- Spaces inside object braces and imports: `{ a, b }`. (met)
- Arrow functions always parenthesize the parameter: `(row) => row.id`. (met)
- Prefer `function` declarations for named top-level functions; arrows for callbacks and handlers. (met)
- `const` by default, `let` only when reassigned, never `var`. (met)
- Template literals for interpolation. Use `??` and `?.` rather than `||` and long `&&` chains. (met)
- Comments explain WHY, not what, and sit above the code they describe. No commented-out code. (met)
- Import order: `node:` built-ins, a blank line, third-party packages, a blank line, local modules. (met)
- File order: header comment, imports, constants, helpers, exports. Every module opens with a short header comment
  saying what it is and why it exists. (met)
- JSX: one attribute per line once a tag is too long; self-close empty elements; avoid nested ternaries. (met)
- CSS: one selector and one declaration per line, kebab-case classes, values from design tokens (`var(--name)`),
  no vendor prefixes (the build handles them). (met)
```

---

# Part 1: Node.js

Runtime: Node 24 LTS (24.15 or newer), ESM only (`"type": "module"`). The test tooling (jsdom 31, Vitest 5) needs it.

## 1.1 Structure and naming

```
RULES:
- ESM only: `import` and `export`, `node:` prefix for built-ins, no `require`. (met)
- Layers (met):
    routes                    parse and validate input, shape the response, nothing else
    services                  business logic (the engine, projects, output management, importers)
    clients                   one module per external system (the Anthropic client is the SDK's)
  A route never talks to a device directly.
- `server/index.js` only wires things together and starts the listener. No logic. (met)
- Files camelCase.js, constants UPPER_SNAKE_CASE, classes PascalCase, booleans `is`/`has`/`should`. Use full words,
  not abbreviations. (met)
- One concept per file, and the filename matches the main export. A file past about 300 lines is a signal to split.
- Route files export a router, service files export named functions. Avoid default exports except for one obvious
  main thing. (met)
- No dead code, unused exports or unused imports.
- Pin the Node version with `"engines"` in `package.json` and `.nvmrc`. (met)
```

## 1.2 Modern JavaScript

```
RULES:
- Use `async`/`await`. Never mix it with `.then()` chains in the same function. (met, with one deliberate exception:
  a serialised write queue in the project service)
- Use `for...of` rather than `forEach` when the body awaits. `forEach` does not await.
- Use `Map` and `Set` for keyed lookup and de-duplication.
- Use `structuredClone` for deep copies, never `JSON.parse(JSON.stringify(x))`.
- Use `AbortController` or timeouts for outbound calls that can hang.
- Prefer built-in `fetch` and `node:` modules over adding a dependency.
- Test doubles are named `Mock*`, never `Fake*`. (met)
```

## 1.3 I/O, batching and limits

```
RULES:
- Never do I/O inside a per-item loop when it can be batched. Run independent I/O concurrently with `Promise.all`.
- Bound everything that comes from outside: request body size (`express.json` limit),
  collection lengths and string lengths in schemas, and result counts. (met)
- The audio scheduler must never block: no synchronous file or network work inside a tick.
- Cache slow-changing reference data with an explicit refresh rather than fetching it per request.
```

## 1.4 Configuration

```
RULES:
- One `config.js` is the ONLY module that reads `process.env`. It validates at startup and fails fast with a clear
  message. Everything else imports config. (met)
- Ship `.env.example` with every key and no real values. (met)
- Never hardcode hostnames, addresses, serial paths or credentials. Environment settings come from config; user choices
  come from saved settings. (met)
- Never commit `.env`, keys or machine-specific paths. (met)
```

## 1.5 Error handling and logging

```
RULES:
- Never write an empty `catch`. Handle the error, log it with context, or rethrow. A comment alone is not handling,
  unless it states why ignoring is correct. (met)
- Never swallow errors with a bare `console.log(error)`.
- One shared `httpError(status, message)` helper, not a copy per file. (met)
- One Express error middleware maps errors to responses. Routes throw or call `next(err)`. Wrap async handlers so
  rejected promises reach it. (met)
- Never send raw exception text, stack traces or file paths to clients. Return a safe message plus a correlation id.
  Log 5xx with the stack and 4xx as one line. (met)
- Validation and "user can fix this" errors use plain, actionable wording (for example "Plug the cable in and refresh
  the list"), never internal jargon.
- Degrade gracefully where the feature allows: if a saved output device is missing, start on the simulator and report
  why, rather than failing to start. (met)
- Handle `unhandledRejection` and `uncaughtException` at process level: log and exit non-zero. Handle `SIGTERM` and
  `SIGINT` by stopping output cleanly before exit. (met)
- Log lines are tagged `[module]`. Never log secrets or raw personal data at info level.
- Use one shared logger (`server/logger.js`) instead of raw `console.*`; ESLint enforces it for `server/`. (met)
```

## 1.6 Security

```
RULES:
- CRITICAL: secrets come only from the environment. Never in source, logs, or the browser. (met)
- CRITICAL: validate every external input (HTTP body, the AI's answer, a saved file) against a schema (zod),
  reject unknown fields (`.strict()`), and enforce size limits. (met)
- CRITICAL: input that selects a resource must be checked against what the system actually offers or a strict
  pattern: a pattern or track id must exist in the song. Never pass a client-supplied path or URL straight to the
  filesystem or the network. (met)
- CRITICAL: parse untrusted data defensively. Saved songs and the AI's answers are data, never instructions. (met)
- Lock CORS to a configured origin list. Never use bare `cors()`. (met)
- Use `helmet`, API rate limiting, and request and message size limits. (met)
- Never expose a control surface to the internet without authentication. This app has no login and is for a trusted
  machine or network. Say so in the docs. (met)
- Commit the lockfile, install with `npm ci`, run `npm audit`, and justify every new dependency. Prefer the standard
  library. (met)
```

## 1.7 Testing

```
RULES:
- Use `node:test` with `node:assert/strict`. Test names read as sentences: subject, condition, outcome. (met)
- Unit-test pure logic hardest: music theory, cleaning and merging the AI's answer, playback layout, song edits.
- Test the exact request sent to Anthropic (model, fallbacks, cached system prompt, the person's direction). (met)
- Mock all external systems. No test needs audio hardware, a real network or credentials. Name doubles
  `Mock*`. (met)
- Inject time (a `now` function or an explicit `tick(at)`) so timing logic is deterministic. (met)
- Cover positive, negative, bulk and invalid-input cases. Every bug fix lands with a regression test. (met)
- Assertion messages say what should be true.
- Target at least 80% line coverage on `server/services/` and `shared/`. (met: `npm run test:coverage` enforces thresholds, measured at 93% lines for the server; raise them as tests are
  added)
```

## 1.8 Documentation and dependencies

```
RULES:
- Each module opens with a short header comment: what it is and why. (met)
- JSDoc on exported functions with non-obvious contracts (`@param`, `@returns`, `@throws`). (met for `server/`, `shared/` and `scripts/`; browser code is not annotated yet)
- Every dependency is justified and documented in ATTRIBUTIONS.md with its licence. (met)
- Licences must be compatible with GPL-3.0-or-later (`npm run licenses` holds the allowed list; GPL-2.0-only is not). Do not bundle third-party data (for example sample packs) without a
  licence that allows it.
```

## 1.9 Node anti-patterns

- I/O in a per-item loop, or blocking work in the output tick.
- Empty `catch`, or a `catch` that only logs.
- Reading `process.env` anywhere but `config.js`.
- Bare `cors()`.
- Business logic inside route handlers.
- Passing client-supplied paths, hosts or ports to the OS without validation.
- Trusting the AI's answer before shared/composition.js has cleaned it.
- Unbounded request bodies, messages, collections or retries.
- Fire-and-forget promises with no `.catch`.
- Copy-pasted helpers (one `httpError`, one `asyncHandler`).
- Expanding XML entities or trusting imported files.

---

# Part 2: React and Vite

Stack: React 19 and Vite 8, function components, hooks only, ESM, plain CSS with design tokens.

## 2.1 Components

```
RULES:
- Function components and hooks only. No class components. (met; the one exception is `ErrorBoundary`, because React
  supports error boundaries only as classes)
- One component per file. Filename equals the component name (PascalCase.jsx). Non-component helpers and hooks live
  in `.js` files with named exports (`api.js`, `useLive.js`). (met)
- Destructure props in the signature. Keep props small and explicit; past about six props, group or compose. (met)
- Keep components under about 250 lines. Split presentational pieces from container logic. (gap: a few large screens
  remain, see known gaps)
- Type props and data shapes with JSDoc types checked by `tsc`, or TypeScript. Do not add PropTypes. (gap: `server/`,
  `shared/` and `scripts/` are checked by `npm run typecheck`; browser code and tests are not yet)
```

## 2.2 Naming

```
RULES:
- Components PascalCase, hooks `useThing`, handlers `handleThing` (defined) and `onThing` (props), booleans
  `isX`/`hasX`/`shouldX`. (met)
- Constants UPPER_SNAKE_CASE, CSS classes kebab-case. Use full words. (met)
```

## 2.3 State and effects

```
RULES:
- Keep state as local as possible and lift only to the nearest common parent. (met)
- Derive values during render. Do not mirror props or other state into new state. Use `useMemo` only when measurably
  expensive. (met)
- Related multi-step transitions use `useReducer` or a small state machine, not several loose `useState` booleans.
- `useEffect` is for syncing with external systems (network, audio, timers). Not for derived data or events. (met)
- Every effect that subscribes, polls or fetches returns a cleanup and ignores stale results. (met)
- Complete dependency arrays. Do not silence `react-hooks/exhaustive-deps`. (met)
- Never mutate state or props. Update immutably. (met)
- Extract repeated stateful logic into a custom hook (`useProject`, `useLive`, `useTheme`). (met)
- Wrap `localStorage` access in try and catch and make the UI work without it. (met)
```

## 2.4 Data and API access

```
RULES:
- All HTTP goes through `src/api.js`. Components never call `fetch` directly. (met)
- Check `res.ok` and throw an error that carries the server's message. (met)
- Show loading, empty and error states for every async view. No silent failures. (met)
- Flush pending saves before actions that depend on them (composing). (met)
- No secrets in the browser, ever. (met)
- The playhead follows the audio clock once per animation frame and re-renders only when the step changes. (met)
```

## 2.5 JSX and rendering

```
RULES:
- Use stable, unique `key`s from data identity. Never the array index for lists that reorder, filter or change. (met:
  sections, including draft ones, have stable ids; grid cells are keyed by their step, which is their identity)
- Never use `dangerouslySetInnerHTML` with unsanitized content. (met: not used)
- Treat song names, cues and all file contents as untrusted text.
- Use semantic elements (`button`, `nav`, `table`, `dialog`) rather than clickable `div`s. (met)
- Memoize only after measuring.
```

## 2.6 Accessibility

```
RULES:
- Every interactive element is keyboard-operable with a visible focus state. (met)
- Icon-only buttons get `aria-label`. Toggles expose state with `aria-pressed` or `aria-checked`. (met)
- Status regions use `role="status"` or `aria-live`. Errors use `role="alert"`. (met)
- Modals use the native `<dialog>` (focus trap, Escape to close), are labelled, and close from the keyboard. (met)
- Tabs follow the tab pattern: `role="tablist"`, arrow-key navigation. (met)
- Form controls have a `<label>`. Images and SVGs have a text alternative or are `aria-hidden`. (met)
- Colour is never the only signal; pair it with text or an icon. Contrast meets WCAG AA in BOTH themes. (met)
- Respect `prefers-reduced-motion`. (met)
- Add `eslint-plugin-jsx-a11y` and automated accessibility checks. (met: `eslint-plugin-jsx-a11y` runs in lint and axe runs in the component tests;
  the manual pass before a release is still a human step)
```

## 2.7 CSS and theming

```
RULES:
- Every colour, radius, shadow and spacing value comes from the tokens in `src/styles/tokens.css`. Never re-type a hex
  value in a component or rule. (met)
- Light and dark themes are token sets (`:root` and `:root[data-theme='dark']`). A new colour needs a value in both.
  (met)
- The theme is applied before first paint by an external script (`public/theme-init.js`); inline scripts are not
  allowed by the content security policy. (met)
- No inline `style` for anything reusable. Inline style is for values computed at runtime (a live colour, a width
  percentage). (met)
- No `!important` except to override a third party rule, with a comment. (met)
- Layouts work from 375px wide up, with no horizontal page scroll. Test phone, tablet and desktop widths. (met)
- Kebab-case classes with a short component-ish prefix to avoid collisions (`conn-`, `help-`, `dg-`).
```

## 2.8 Vite and build

```
RULES:
- Keep `vite.config.js` minimal: the React plugin and the dev proxy for `/api` and `/live`. (met)
- The browser may import from `shared/` only if the module is pure (no Node or DOM APIs). Never import server code into
  the client. (met)
- Static files that must keep their path (the favicon, the theme script) live in `public/`. (met)
- Fonts and other assets are bundled (for example via an npm font package), not loaded from a CDN, so the app works
  offline. (met)
- Only values prefixed `VITE_` reach client code through `import.meta.env`, and they are never secrets. (met: unused)
- `npm run build` must pass before merging. `dist/` is never committed. (met)
- Code-split large or rarely used screens with `React.lazy` once they are measurably heavy (for example the guide
  modal). (met for the guide, which loads on demand)
```

## 2.9 Performance

```
RULES:
- Measure before adding `memo`, `useMemo` or `useCallback`.
- Coalesce high-frequency events and avoid re-rendering whole screens for per-frame data where it can be scoped.
- Virtualize or paginate long lists beyond a few hundred rows.
- Debounce free-text input that triggers work.
```

## 2.10 Testing

```
RULES:
- Vitest with React Testing Library: test behaviour by role, label and text, not class names or internals. (met: every screen,
  the app shell, the top bar, the navigation and the hooks have component tests with an accessibility check; browser
  coverage is about 98% of statements and 90% of branches)
- Unit-test pure browser logic first: colour mapping, patch tools, scene colours. (met)
- Mock `api.js`, not `fetch`. Cover loading, success, error and cancel paths.
- Add `vitest-axe` checks on the key screens.
- No test depends on a real network, device or credentials.
```

## 2.11 React anti-patterns

- Fetching inside components with no cleanup or abort.
- Derived data stored in state and kept in sync by effects.
- Missing or wrong hook dependencies.
- Array index as `key` in dynamic lists.
- Unsanitized HTML from files or API content.
- Components of several hundred lines mixing fetching, state and markup.
- Direct `fetch` calls scattered through components.
- Prop drilling more than two levels without composition or context.
- Hard-coded colours that ignore the theme.

---

# Part 3: Project rules

Rules specific to BPMachina, beyond the general stack rules.

```
The Machina Engine (AI composition):
- Claude is called from the server only, through the official Anthropic SDK (ADR 0003). The key never reaches the
  browser, a log or an answer.
- The answer is data, never trusted as a song: every value goes through shared/composition.js, and the result must
  pass the same song schema as a browser save.
- Locks are enforced by the merge code, not by the prompt. A test proves every lock.
- The system prompt is stable between requests (it is cached). A prompt change says in the pull request what was
  composed before and after, and how it sounded.
- Tests never call Anthropic: they use the stand-in client in tests/server/helpers.js.

Sound:
- Audio work never blocks: notes are scheduled ahead on the audio clock (ADR 0005), never timed with setTimeout.
- The engine takes its context, timer and note sink as arguments, so scheduling is tested deterministically.
- Every instrument has a voice, and every voice ends by itself (no node left running).
- What plays when is a pure function of the song (src/utils/playback.js); keep musical logic out of the engine.

Data and persistence:
- The song is one JSON document validated by a strict zod schema on load and on save. Invalid saved data is moved
  aside with a logged reason, never overwritten; a newer version is never overwritten.
- Writes are atomic (a temporary file, then rename). Saved files live in server/data/ and are git-ignored.
- shared/ holds what both sides need (music theory, instruments, the song, composition, the cue export) and stays
  pure: no browser or Node APIs.
- Every edit goes through `update`, so it can be undone. Pure edit functions live in src/utils/songEdit.js.
- A format change raises schemaVersion and adds a migration with tests.

Interop with Open DMX Stage:
- The cue export keeps the field names Open DMX Stage reads for a song (ADR 0006). A change to them is coordinated
  with that project.

Documentation and pull requests:
- A user-visible change updates the docs and CHANGELOG.md. A new dependency or format goes in ATTRIBUTIONS.md.
- Small, focused changes; lint, type check, tests and build pass. UI changes include screenshots in both themes.
- The description states what was NOT verified, especially how it sounds on real speakers.
```

---

# Quick reference

| Layer       | Rule                                                                                                      | Priority     |
| ----------- | --------------------------------------------------------------------------------------------------------- | ------------ |
| Node        | Secrets only from the environment; never logged or sent to the browser                                    | **CRITICAL** |
| Node        | Validate every external input against a strict schema with size limits                                    | **CRITICAL** |
| Node        | Treat the AI's answer as untrusted data: clean, clamp and cap it, then validate it as a song              | **CRITICAL** |
| Node        | Parse untrusted files defensively (no XML entity expansion)                                               | **CRITICAL** |
| React       | No secrets in client code; never inject unsanitized HTML                                                  | **CRITICAL** |
| Node        | No empty `catch`; one error middleware; safe client messages                                              | **HIGH**     |
| Node        | Lock CORS to known origins; helmet, rate limits, body caps                                                | **HIGH**     |
| Node        | One config module; fail fast; `.env.example`                                                              | **HIGH**     |
| Node        | Tests with a stand-in Anthropic client and injected time; regression test per bug                         | **HIGH**     |
| Project     | Schedule sound ahead on the audio clock; every voice ends by itself                                       | **HIGH**     |
| Project     | Every edit undoable; locked tracks enforced by code                                                       | **HIGH**     |
| React       | Effects return cleanup and ignore stale results; complete dependency arrays                               | **HIGH**     |
| React       | All HTTP through `api.js`; check `res.ok`; loading, empty and error states                                | **HIGH**     |
| React       | Keyboard access, labels, `aria-*`, text with colour, AA contrast in both themes                           | **HIGH**     |
| Node        | Graceful shutdown; exit on `uncaughtException`                                                            | **MEDIUM**   |
| Node        | ESM, `node:` built-ins, `async`/`await`, `??` and `?.`                                                    | **MEDIUM**   |
| Node        | One shared logger                                                                                         | **MEDIUM**   |
| React       | Derive, do not mirror; `useReducer` for multi-step flows                                                  | **MEDIUM**   |
| React       | Stable data-based `key`s                                                                                  | **MEDIUM**   |
| React       | Components under about 250 lines; types or PropTypes on props                                             | **MEDIUM**   |
| React       | Tokens only, in both themes; no re-typed hex                                                              | **MEDIUM**   |
| Vite        | Bundle assets, minimal config, pure `shared/` imports only                                                | **MEDIUM**   |
| CI          | Required CI on every PR (lint, typecheck, test with coverage, build, audit); protected branches           | **HIGH**     |
| CI          | Least-privilege workflow permissions; third-party actions pinned to a commit SHA                          | **HIGH**     |
| Reliability | The song file has a schema version, atomic writes and a backup; never overwrite what cannot be read       | **HIGH**     |
| Testing     | Component tests by role and label with automated accessibility checks; a coverage floor that only goes up | **HIGH**     |
| Logging     | One structured logger with levels, redaction by allowlist and request ids                                 | **MEDIUM**   |
| Types       | JSDoc and tsc --checkJs now; full TypeScript is an ADR-recorded decision                                  | **MEDIUM**   |
| Releases    | Semantic Versioning, Conventional Commits, changelog, tagged CI-built releases                            | **MEDIUM**   |
| API         | Versioned /api/v1, one error shape, correct status codes                                                  | **MEDIUM**   |
| Docs        | ADRs for big decisions; docs and screenshots updated in the same PR                                       | **MEDIUM**   |

---

# Status and known gaps

| Area     | Gap                                                                                      | Next step                                                        |
| -------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Sound    | Only synthesised voices; no samples, no MIDI out, no audio export                        | Samples and MIDI out as other note sinks beside the voices; WAV  |
| Testing  | The voices are tested against a recording stand-in, not listened to; no end-to-end suite | A listening check before releases; Playwright for the main flows |
| Types    | Browser code is not type checked yet (`tsconfig.json` covers `shared/`, `server/`)       | Add `src/` once its JSDoc types are in place                     |
| Machina  | No streaming progress while composing; a whole-song revision resends every note          | Stream progress to the browser; revise several patterns at once  |
| Security | No access token; safe by default because the server listens on this computer only        | An optional token if it is used on shared networks (ADR 0004)    |
