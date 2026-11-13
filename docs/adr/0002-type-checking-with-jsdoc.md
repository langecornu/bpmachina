# 2. Type checking with JSDoc and `tsc`

Status: accepted

## Context

Wrong shapes cause bugs that tests find late, and prop and data shapes were undocumented. A full TypeScript migration is
a large change for a small codebase.

## Decision

Stay with plain JavaScript and check types with JSDoc annotations and `tsc` in check-only mode (`allowJs`, `checkJs`,
`noEmit`, `strict`). The `include` list in `tsconfig.json` grows over time; new modules start with `// @ts-check`. Zod
schemas remain the runtime source of truth for data. PropTypes are not used.

## Consequences

Most of the benefit with no migration. Types live in comments, which is less ergonomic than TypeScript. Revisit full
TypeScript if the codebase or the number of contributors grows; that would supersede this record.
