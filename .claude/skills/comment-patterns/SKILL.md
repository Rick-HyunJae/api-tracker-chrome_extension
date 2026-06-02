---
name: comment-patterns
description: |
    Use when a task involves writing, reviewing, or refactoring comments or JSDoc
    in TypeScript/TSX/config files, or when prompts include "주석 달아줘",
    "JSDoc 정리해줘", "주석 규칙 확인해줘", "comment cleanup", or "WHY-only comments".
---

# Commenting Guidelines

Keep comments small, useful, and non-redundant. Explain WHY, never WHAT.

## Project override

**CLAUDE.md takes precedence.** This project's default is *no comments*. JSDoc and
inline comments are only added when the WHY is non-obvious (hidden constraint,
surprising behavior, narrow implementation choice). If the rule below seems to
encourage more comments than CLAUDE.md allows, CLAUDE.md wins.

## What comments should do

- Explain WHY, not WHAT.
- Capture hidden constraints, surprising behavior, or non-obvious design choices.
- Help the next reader avoid guessing.

## What to avoid

- Repeating code that already explains itself.
- Adding comments because the file feels "too quiet".
- Inline property comments for object literals.
- Commenting barrel `index.ts` files.
- Referencing tasks/PRs/issues ("added for X flow", "fix for #123") — those rot.

## JSDoc rules

- JSDoc only on exported declarations where the WHY is non-obvious.
- Put JSDoc on the top-level declaration.
- Keep tag groups readable with blank lines between distinct blocks.
- Do not end comment sentences with a period.

## Inline comment rules

- Use `//` only inside a component body or at a plugin/utility integration point.
- Use `/* ... */` for multi-line explanation only when JSDoc is not the right shape.
- Keep inline comments short and context-specific.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `// creates the client` above `axios.create(...)` | Delete — restates code |
| `staleTime: 1000 * 60, // 1 minute` | Delete — identifier already explains |
| Adding JSDoc to every export "for consistency" | Only export-with-non-obvious-WHY gets JSDoc |
| Comment referencing current PR/task | Put in PR description, not the code |
| Multi-paragraph docstring | Compress to one short line — long comments rot |

## Red Flags — STOP

- About to add a comment without a clear WHY → **don't**
- Tempted to "improve" existing comments while editing nearby code → **don't** (surgical changes only)
- Writing a comment that paraphrases the next line → **delete**
- Adding JSDoc to a barrel `index.ts` → **delete**

## How to work with the bundled examples

- `assets/templates/` — ready-to-copy skeletons.
- `assets/examples/` — concrete good/bad examples.
- Prefer adapting the template structure over inventing a new style.

## Reference

- `references/policy.md` — full rule set and decision notes.
