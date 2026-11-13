# Security policy

## Supported versions

Only the latest release receives security fixes while the project is below 1.0.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private reporting: open the repository's
**Security** tab and choose **Report a vulnerability**. Include what you found, how to reproduce it, and the version
or commit.

## Scope and design notes

BPMachina has **no login**. It is meant for your own computer, and by default the server listens on this computer only
(`HOST=127.0.0.1`, ADR 0004). Setting `HOST=0.0.0.0` opens it to your network, where anyone who can reach it can change
the song and compose with your saved Anthropic key. Do not expose it to the internet.

## Threat model

| Who                                                 | What they could do                                               | What limits it                                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anyone who can reach the server (if opened to them) | Change or replace the song, compose with the saved key           | Loopback by default. The key is write-only. Compositions are rate limited (six a minute) and run one at a time.                                       |
| A web page open in a browser on this computer       | Send requests to the app (cross-site requests), or DNS rebinding | Changes are only accepted from the app's own pages (Origin and Sec-Fetch-Site checks), requests must be addressed to this computer (Host check), CORS |
| A crafted song file or request                      | Break the app or the saved song                                  | Strict schemas with size limits on every list, string and number; references between tracks, notes, patterns and sections are checked                 |
| The AI's answer                                     | Put something unexpected into the song                           | Structured outputs fix its shape; `shared/composition.js` keeps only known instruments, clamps every number and caps every list (ADR 0003)            |

The saved Anthropic key (`server/data/secrets.json`) is readable by its owner only, never returned by any route, and
never committed (`server/data/` is git-ignored). `ANTHROPIC_API_KEY` in the environment takes precedence.
