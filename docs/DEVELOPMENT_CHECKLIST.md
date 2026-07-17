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

## Local Vault Development

The source repository is the only development source. The installed Vault copy is a runtime mirror and must not be used for source edits or reverse synchronization.

Set the target plugin directory in the shell before starting the build watcher:

```bash
export OBSIDIAN_NOTION_EMBED_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/obsidian-notion-block-embed-peng"
npm run dev:vault
```

The deploy mode copies only `main.js`, `manifest.json`, and `styles.css`. It never copies `data.json`, `.git`, source files, or caches. Reload the plugin in Obsidian after a successful deployment.

## Notion API Container Boundaries

- An NBE marker in the first direct heading child of a callout resolves to the callout ID;
  this is the supported way to embed the complete callout subtree.
- Markers in later children, ordinary toggles, paragraphs, and non-callout parents keep
  their original block target.
- The repository hydrates every supported API-visible descendant recursively, including
  nested callouts, tables/table rows, dividers, lists, equations, images, and quotes.
- `unsupported.block_type` descendants are retained as explicit placeholders and are never
  queried for children. This is intentional for API-only types such as `button` and
  `ai_block`; do not add browser scraping or private Notion API fallbacks.

## PR Summary Template

- What changed:
- Runtime changes (if any):
- Which core pipeline step changed:
- Why no host-specific branch was introduced:
- New tests added:
- Backward compatibility notes:
