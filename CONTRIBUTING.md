# Contributing

Thanks for helping. Small, well-tested changes are preferred.

## Set up

```bash
nvm install && nvm use   # Node 24 LTS, from .nvmrc
npm ci
npm run dev              # API on :4100, web app on :5180
```

The Machina needs an Anthropic API key (Settings); everything else works without one. Tests never call Anthropic: they
use a stand-in client.

## Before you open a pull request

```bash
npm run check            # lint, typecheck, tests, build
```

Other useful commands: `npm run test:coverage`, `npm run size`, `npm run licenses`, `npm run format`.

## Rules

- Follow [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md). It explains the style, structure, testing and security
  rules.
- Add or update tests. Every bug fix lands with a regression test.
- Update the docs for any user-visible change, and `CHANGELOG.md`.
- Add new dependencies, file formats and protocols to `ATTRIBUTIONS.md`, and justify each dependency in the pull request.
- Say what you did **not** verify, especially how it sounds on real speakers and anything with MIDI gear.
- Use [Conventional Commit](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`) and keep pull requests small and focused.

## Changing the Machina's prompt

The system prompt in `server/services/machinaEngine.js` shapes every composition. When you change it, compose a few
songs in each home genre before and after, listen to them, and describe the difference in the pull request. Keep the
prompt stable between requests: it is cached.

## Reporting security problems

See [SECURITY.md](SECURITY.md). Do not open a public issue.
