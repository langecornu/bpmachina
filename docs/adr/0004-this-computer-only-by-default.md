# 4. The server listens on this computer only by default

Status: accepted

## Context

The app has no login. Open DMX Stage listens on the network by default (its ADR 0008) because a lighting box is run
from phones and tablets. BPMachina is used at the computer it runs on, and anyone who can reach it can compose with the
saved Anthropic key, which costs money.

## Decision

`HOST` defaults to `127.0.0.1`. Setting `HOST=0.0.0.0` opens it to the network, and the server warns in its log when
it does. The same protections as Open DMX Stage apply either way: changes only from the app's own pages, requests
addressed to this computer, CORS, rate limits.

## Consequences

Safe by default. Using it from another device needs one setting and a trusted network. An access token would remove
this trade-off and would be recorded in a new decision.
