# Notion Block Embed

Embed a specific Notion block into Obsidian using Notion API / Integration token.

## Syntax

````markdown
```notion-embed
https://www.notion.so/your-page-id#your-block-id
```
````

Block mode (existing syntax): one Notion block URL line.

Page + heading mode:

````markdown
```notion-embed
url: https://www.notion.so/your-page-id
heading: Your Heading Text
```
````

## Current Scope

- Data source: Notion API only (no public HTML scraping fallback)
- Render host: Markdown notes (Canvas reuses the same note rendering via note/file cards)
- Input modes:
  - Block URL mode
  - Page + heading mode (read-only)
- Supported render block types:
  - heading_1 / heading_2 / heading_3
  - paragraph
  - bulleted_list_item / numbered_list_item
  - quote
  - code
  - to_do
  - synced_block
  - equation (inline rich_text + standalone equation block)
  - image (external/file URL, resizable with remembered width)
  - column_list / column
- Unsupported block types are shown as a readable placeholder
- Optional limited writeback for text-like block types
- Optional interval auto-refresh (manual / interval)
- Optional writeback conflict policy (`none` / `fail_on_conflict`)

## Runtime Model

- Runtime composition is centralized in `PluginRuntime`:
  - settings-driven reuse of `NotionClient`, `NotionRepository`, `WritebackService`
  - shared in-memory TTL cache
  - shared active-embed store + scheduler
- `main.ts` only keeps lifecycle/commands/settings wiring.
- `processor.ts` is render orchestration only:
  - parse target
  - load tree
  - render/mount
  - edit trigger

## Refresh & Cache Rules

- Manual `Refresh all` performs global cache invalidation, then refreshes active embeds.
- Embed-level refresh is scope-based invalidation:
  - block mode: invalidate the target block tree scope
  - page-heading mode: invalidate the target page section scope
- Writeback invalidates:
  - target block tree scope
  - source page section scopes
- Refresh execution is bounded:
  - active embed refresh concurrency: `3`
  - repository tree loading concurrency: `4`

## Important Boundary

- This plugin does not provide a native interactive Canvas card renderer.
- Canvas support is read-only preview by reusing rendered note content.
- Column layouts reuse the same rendering in Note and Canvas; narrow containers automatically stack columns vertically.
- Complex nested writeback remains out of scope for the current version.

## Single-Pipeline Rule

- Note and Canvas must reuse one core pipeline:
  - parser -> repository -> adapters -> renderer -> writeback service
- Do not create Canvas-specific data/query/render/writeback branches.
- Architecture rules: `docs/ARCHITECTURE_CONTRACT.md`
- Developer checklist: `docs/DEVELOPMENT_CHECKLIST.md`

## Installation / 安装

### Via BRAT (Recommended for Beta Testing)
1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin in Obsidian.
2. Open BRAT settings and click "Add Beta plugin".
3. Enter the repository URL: `https://github.com/TheodorePeng/obsidian-notion-block-embed-peng`
4. Click "Add Plugin" and enable "Notion Block Embed" in Community Plugins.

> Please refer to the [BRAT developer guide](https://tfthacker.com/brat-developers) for the latest workflow details.

### 通过 BRAT 安装（推荐用于测试版）
1. 在 Obsidian 中安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 打开 BRAT 设置，点击「Add Beta plugin」。
3. 输入仓库地址：`https://github.com/TheodorePeng/obsidian-notion-block-embed-peng`
4. 点击「Add Plugin」，然后在社区插件中启用「Notion Block Embed」。

> 请以 [BRAT 官方文档](https://tfthacker.com/brat-developers) 为准，本说明可能随 BRAT 更新而变化。
