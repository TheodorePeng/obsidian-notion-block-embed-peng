import { MarkdownView, type App, type MarkdownPostProcessorContext, type TFile } from "obsidian";
import type { CanvasData, CanvasTextData } from "obsidian/canvas";
import { PluginError } from "../core/errors";
import { extractNotionEmbedCodeBlocks, type NotionEmbedCodeBlock } from "../nbe/source";
import { parseNotionTargetFromSource } from "../notion/parser";

function detectNewline(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function lineStartOffset(text: string, line: number): number {
  if (line <= 0) return 0;
  let currentLine = 0;
  for (let i = 0; i < text.length; i++) {
    if (currentLine === line) return i;
    if (text[i] === "\n") currentLine += 1;
  }
  return text.length;
}

function lineEndOffset(text: string, line: number): number {
  return lineStartOffset(text, line + 1);
}

function replaceBlockInSection(sectionText: string, nextSource: string): string {
  const newline = detectNewline(sectionText);
  const normalizedSource = nextSource.trim();
  const block = `\`\`\`notion-embed${newline}${normalizedSource}${newline}\`\`\``;
  const pattern = /```notion-embed[^\n\r]*[\s\S]*?```/;
  if (pattern.test(sectionText)) {
    return sectionText.replace(pattern, block);
  }
  return block;
}

function replaceSectionText(content: string, section: SectionLike, replacement: string): string {
  const sectionStart = lineStartOffset(content, section.lineStart);
  const sectionEnd = lineEndOffset(content, section.lineEnd);
  const sectionText = content.slice(sectionStart, sectionEnd);
  const pattern = /```notion-embed[^\n\r]*[\s\S]*?```/;
  if (!pattern.test(sectionText)) {
    throw new PluginError("UNKNOWN", "Unable to locate the notion-embed code block in the current note section.");
  }
  const updatedSection = sectionText.replace(pattern, replacement);
  return `${content.slice(0, sectionStart)}${updatedSection}${content.slice(sectionEnd)}`;
}

interface SectionLike {
  text: string;
  lineStart: number;
  lineEnd: number;
}

interface MarkdownSectionTarget {
  kind: "markdown-section";
  section: SectionLike;
  view?: MarkdownView;
  file?: TFile;
}

interface CanvasTextNodeTarget {
  kind: "canvas-text-node";
  file: TFile;
  nodeId: string;
  expectedSource: string | null;
}

type SourceUpdateTarget = MarkdownSectionTarget | CanvasTextNodeTarget;

export type NotionEmbedSourceShape = "empty" | "single_line" | "multi_line";

export function classifyNotionEmbedSource(source: string): NotionEmbedSourceShape {
  const lines = source
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "empty";
  }
  return lines.length === 1 ? "single_line" : "multi_line";
}

export function getEditableFooterSourceValue(source: string): string | null {
  const shape = classifyNotionEmbedSource(source);
  if (shape !== "single_line") return null;
  const trimmed = source.trim();
  return trimmed || null;
}

export function canApplyNotionEmbedSourceUpdate(
  ctx: MarkdownPostProcessorContext,
  hostEl: HTMLElement,
): boolean {
  const section = ctx.getSectionInfo(hostEl) as SectionLike | null;
  if (section) return true;
  const sourcePath = ctx.sourcePath?.trim();
  return typeof sourcePath === "string" && sourcePath.endsWith(".canvas");
}

function rewritePageHeadingSource(source: string, nextUrl: string): string {
  const lines = source.split(/\r?\n/g);
  let replaced = false;
  const rewritten = lines.map((line) => {
    if (/^\s*url\s*:/i.test(line)) {
      replaced = true;
      return `url: ${nextUrl}`;
    }
    return line;
  });
  if (!replaced) {
    throw new PluginError("INVALID_INPUT", 'Missing "url:" line in page-heading source.');
  }
  return rewritten.join(detectNewline(source));
}

export function rewriteNotionEmbedSourceUrl(source: string, nextUrl: string): string {
  const trimmedUrl = nextUrl.trim();
  if (!trimmedUrl) {
    throw new PluginError("INVALID_INPUT", "Embed URL is required.");
  }
  const sourceShape = classifyNotionEmbedSource(source);
  if (sourceShape === "empty") {
    throw new PluginError("INVALID_INPUT", "Empty notion-embed must be edited in source.");
  }
  if (sourceShape === "single_line") {
    return trimmedUrl;
  }
  const currentTarget = parseNotionTargetFromSource(source);
  if (currentTarget.mode === "page_heading") {
    return rewritePageHeadingSource(source, trimmedUrl);
  }
  throw new PluginError("INVALID_INPUT", "This embed source must be edited in source.");
}

export async function applyNotionEmbedSourceUpdate(
  app: App,
  ctx: MarkdownPostProcessorContext,
  hostEl: HTMLElement,
  nextSource: string,
  currentSource?: string,
): Promise<void> {
  const target = await resolveSourceUpdateTarget(app, ctx, hostEl, currentSource ?? null);
  if (!target) {
    throw new PluginError("INVALID_INPUT", "Unable to locate embed source section.");
  }

  if (target.kind === "markdown-section") {
    const replacement = replaceBlockInSection(target.section.text, nextSource);

    if (target.view) {
      const content = target.view.getViewData();
      const updated = replaceSectionText(content, target.section, replacement);
      if (updated === content) {
        throw new PluginError("UNKNOWN", "No source change was applied.");
      }
      target.view.setViewData(updated, false);
      target.view.requestSave();
      return;
    }

    if (target.file) {
      const content = await app.vault.read(target.file);
      const updated = replaceSectionText(content, target.section, replacement);
      if (updated === content) {
        throw new PluginError("UNKNOWN", "No source change was applied.");
      }
      await app.vault.modify(target.file, updated);
      return;
    }

    throw new PluginError("INVALID_INPUT", "Unable to update this embed source from the current note context.");
  }

  const content = await app.vault.read(target.file);
  const updated = replaceNotionEmbedBlockInCanvasTextNode(content, target, nextSource);
  if (updated === content) {
    throw new PluginError("UNKNOWN", "No source change was applied.");
  }
  await app.vault.modify(target.file, updated);
}

async function resolveSourceUpdateTarget(
  app: App,
  ctx: MarkdownPostProcessorContext,
  hostEl: HTMLElement,
  currentSource: string | null,
): Promise<SourceUpdateTarget | null> {
  const section = ctx.getSectionInfo(hostEl) as SectionLike | null;
  if (!section) {
    const sourcePath = ctx.sourcePath?.trim();
    if (sourcePath?.endsWith(".canvas")) {
      return resolveCanvasTextNodeTarget(app, sourcePath, currentSource);
    }
    return null;
  }

  const sourcePath = ctx.sourcePath?.trim();
  if (sourcePath) {
    const matchedView = findPreferredMarkdownView(app, sourcePath);
    if (matchedView?.file) {
      return {
        kind: "markdown-section",
        section,
        view: matchedView,
        file: matchedView.file,
      };
    }

    const file = app.vault.getFileByPath(sourcePath);
    if (file) {
      return {
        kind: "markdown-section",
        section,
        file,
      };
    }

    return {
      kind: "markdown-section",
      section,
    };
  }

  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView?.file) {
    return {
      kind: "markdown-section",
      section,
      view: activeView,
      file: activeView.file,
    };
  }

  const activeFile = app.workspace.getActiveFile();
  if (activeFile) {
    const matchedView = findPreferredMarkdownView(app, activeFile.path);
    if (matchedView?.file) {
      return {
        kind: "markdown-section",
        section,
        view: matchedView,
        file: matchedView.file,
      };
    }

    const file = app.vault.getFileByPath(activeFile.path);
    if (file) {
      return {
        kind: "markdown-section",
        section,
        file,
      };
    }
  }

  return {
    kind: "markdown-section",
    section,
  };
}

function findPreferredMarkdownView(app: App, filePath: string): MarkdownView | null {
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView?.file?.path === filePath) {
    return activeView;
  }

  let matchedView: MarkdownView | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (matchedView) return;
    if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
      matchedView = leaf.view;
    }
  });

  return matchedView;
}

async function resolveCanvasTextNodeTarget(
  app: App,
  sourcePath: string,
  currentSource: string | null,
): Promise<CanvasTextNodeTarget> {
  const file = app.vault.getFileByPath(sourcePath);
  if (!file) {
    throw new PluginError("INVALID_INPUT", "Unable to update this embed source from the current note context.");
  }

  const raw = await app.vault.read(file);
  const parsed = parseCanvasDocument(raw);
  const selectedNodeId = resolveSelectedCanvasTextNodeId(app, sourcePath);

  if (selectedNodeId) {
    const selectedNode = findCanvasTextNodeById(parsed, selectedNodeId);
    const selectedMatch = selectedNode ? resolveEditableCanvasBlock(selectedNode.text, currentSource) : null;
    if (selectedMatch?.kind === "match") {
      return {
        kind: "canvas-text-node",
        file,
        nodeId: selectedNodeId,
        expectedSource: selectedMatch.block.source,
      };
    }
  }

  const matches: Array<{ nodeId: string; source: string }> = [];
  for (const node of getCanvasTextNodes(parsed)) {
    const match = resolveEditableCanvasBlock(node.text, currentSource, !currentSource);
    if (match?.kind === "match") {
      matches.push({
        nodeId: node.id,
        source: match.block.source,
      });
    }
  }

  if (matches.length === 1) {
    return {
      kind: "canvas-text-node",
      file,
      nodeId: matches[0].nodeId,
      expectedSource: matches[0].source,
    };
  }

  throw new PluginError("INVALID_INPUT", "Unable to determine the Canvas text node for this embed source.");
}

function replaceNotionEmbedBlockInCanvasTextNode(
  rawCanvas: string,
  target: CanvasTextNodeTarget,
  nextSource: string,
): string {
  const parsed = parseCanvasDocument(rawCanvas);
  const textNode = findCanvasTextNodeById(parsed, target.nodeId);
  if (!textNode) {
    throw new PluginError("INVALID_INPUT", "Unable to determine the Canvas text node for this embed source.");
  }

  const updatedText = replaceEmbedBlockInTextNode(textNode.text, nextSource, target.expectedSource);
  if (updatedText === textNode.text) {
    return rawCanvas;
  }

  textNode.text = updatedText;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function replaceEmbedBlockInTextNode(text: string, nextSource: string, expectedSource: string | null): string {
  const match = resolveEditableCanvasBlock(text, expectedSource);
  if (!match || match.kind !== "match") {
    throw new PluginError("INVALID_INPUT", "Unable to determine the Canvas text node for this embed source.");
  }

  const start = lineStartOffset(text, match.block.lineStart);
  const end = lineEndOffset(text, match.block.lineEnd);
  const blockText = text.slice(start, end);
  const replacement = replaceBlockInSection(blockText, nextSource);
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function resolveEditableCanvasBlock(
  text: string,
  currentSource: string | null,
  allowUniqueFallback = true,
): { kind: "match"; block: NotionEmbedCodeBlock } | { kind: "ambiguous" } | null {
  const blocks = extractNotionEmbedCodeBlocks(text);
  if (blocks.length === 0) {
    return null;
  }

  if (currentSource) {
    const exactMatches = blocks.filter((block) => block.source === currentSource);
    if (exactMatches.length === 1) {
      return { kind: "match", block: exactMatches[0] };
    }
    if (exactMatches.length > 1) {
      return { kind: "ambiguous" };
    }
    if (!allowUniqueFallback) {
      return null;
    }
  }

  if (blocks.length === 1) {
    return { kind: "match", block: blocks[0] };
  }

  return { kind: "ambiguous" };
}

function parseCanvasDocument(raw: string): CanvasData {
  try {
    return JSON.parse(raw) as CanvasData;
  } catch {
    throw new PluginError("INVALID_INPUT", "Unable to read the current Canvas file.");
  }
}

function getCanvasTextNodes(data: CanvasData): CanvasTextData[] {
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  return nodes.filter((node): node is CanvasTextData => node.type === "text" && typeof node.text === "string");
}

function findCanvasTextNodeById(data: CanvasData, nodeId: string): CanvasTextData | null {
  return getCanvasTextNodes(data).find((node) => node.id === nodeId) ?? null;
}

function resolveSelectedCanvasTextNodeId(app: App, sourcePath: string): string | null {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile || activeFile.path !== sourcePath || activeFile.extension !== "canvas") {
    return null;
  }

  const activeLeaf = (app.workspace as App["workspace"] & { activeLeaf?: { view?: unknown } }).activeLeaf;
  const activeView = activeLeaf?.view as {
    getViewType?: () => string;
    canvas?: { selection?: Set<unknown> | unknown[] };
  } | undefined;
  if (activeView?.getViewType?.() !== "canvas") {
    return null;
  }

  const selection = activeView.canvas?.selection;
  const selectedItems = Array.isArray(selection)
    ? selection
    : selection
      ? Array.from(selection as Set<unknown>)
      : [];
  const selectedNode = selectedItems[0] as
    | { id?: string; node?: { id?: string }; data?: { id?: string } }
    | undefined;
  return selectedNode?.id ?? selectedNode?.node?.id ?? selectedNode?.data?.id ?? null;
}
