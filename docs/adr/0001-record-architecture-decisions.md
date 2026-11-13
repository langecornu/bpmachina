# 1. Record architecture decisions

Status: accepted

## Context

Several decisions in this project are not obvious from the code and are easy to undo by accident (why the AI's answer
is never trusted as a song, why sound is made in the browser, how types are checked). New contributors need the
reasoning. The practice comes from the sibling project Open DMX Stage.

## Decision

Significant decisions are recorded as short Architecture Decision Records in `docs/adr/`, numbered, with context,
decision and consequences. A decision is changed by adding a new record that supersedes the old one, not by editing history.

## Consequences

The reasoning survives. Writing a record is a small cost on each significant change.
