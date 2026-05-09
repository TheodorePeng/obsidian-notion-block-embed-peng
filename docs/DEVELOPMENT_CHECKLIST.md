# Development Checklist

Use this checklist for every feature or refactor.

## Core Questions (must answer)

1. Did this change stay inside the single core pipeline?
2. Did this change avoid Note/Canvas branching in core modules?
3. Is there at least one core-logic test for the new behavior?
4. Are parser/repository/renderer/writeback boundaries still clear?
5. Does the change keep the current writeback boundary (limited writeback)?
6. Did refresh/cache behavior stay scope-based (not accidental global clear)?
7. Did new async flows keep bounded concurrency and stale-render safety?

## Merge Gate

Run all checks:

```bash
npx tsc --noEmit
npm run test
npm run build
```

Then bump version:

```bash
npm run bump:patch
```

## PR Summary Template

- What changed:
- Runtime changes (if any):
- Which core pipeline step changed:
- Why no host-specific branch was introduced:
- New tests added:
- Backward compatibility notes:
