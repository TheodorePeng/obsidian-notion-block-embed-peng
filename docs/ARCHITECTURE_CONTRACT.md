# Single-Pipeline Architecture Contract

This plugin must keep one core pipeline for both Note and Canvas rendering:

`parser -> repository -> adapters -> renderer -> writeback service`

Runtime shell:

`main -> PluginRuntime -> processor -> (core pipeline)`

## Non-Negotiable Rules

1. Do not create Canvas-specific data parsing, rendering, or writeback logic.
2. Keep `notion-embed` processing in a single entry (`src/embed/processor.ts`).
3. Keep rendering logic host-agnostic (`src/render/*` only accepts `EmbedBlockNode`).
4. Keep writeback logic host-agnostic (`src/writeback/*` depends on block capability only).
5. New features must be added to core modules first, then reused by both hosts.
6. Cache invalidation must be scope-based by default; global clear is only for explicit force refresh.
7. Active-embed refresh and repository tree loading must use bounded concurrency.

## Allowed Adaptation

- Thin host-level adaptation is allowed only for UI shell concerns.
- Host-level adaptation must not change Notion query, parsing, rendering semantics, or writeback semantics.

## Disallowed Patterns

- `if (isCanvas) { ... } else { ... }` in core modules.
- Canvas-only renderer file that duplicates block rendering.
- Separate writeback path for Canvas and Note.
- Unbounded parallel refresh/load loops that can spike Notion API traffic.

## Required Validation Before Merge

1. Core logic tests are added or updated.
2. Existing render and writeback tests still pass.
3. Single-pipeline guard test passes.
