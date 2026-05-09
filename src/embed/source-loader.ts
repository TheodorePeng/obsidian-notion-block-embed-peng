import { EmbedBlockNode, EmbedLoadResult, NotionApiBlockTree, ParsedNotionTarget } from '../core/models';
import { NotionBlockEmbedSettings } from '../core/settings';
import { Logger } from '../core/logger';
import { toEmbedNodeTree } from '../notion/adapters';
import { NotionRepository } from '../notion/repository';
import { parseNotionTargetFromSource } from '../notion/parser';

export interface EmbedLoadMetrics {
  parseMs: number;
  repositoryMs: number;
  adapterMs: number;
  totalMs: number;
  sharedLoadState: 'leader' | 'join';
}

export interface EmbedLoadDetailedResult {
  loaded: EmbedLoadResult;
  metrics: EmbedLoadMetrics;
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function buildSharedLoadKey(source: string, settings: NotionBlockEmbedSettings): string {
  return `${settings.showChildren ? 'children' : 'single'}::${source}`;
}

const sharedLoadTasks = new Map<string, Promise<EmbedLoadDetailedResult>>();

function parseTarget(source: string): ParsedNotionTarget {
  return parseNotionTargetFromSource(source);
}

function createEmptyRoot(): EmbedBlockNode {
  return {
    id: 'nbe-empty-root',
    type: 'section_container',
    richText: [],
    children: [],
    props: {},
    meta: {
      sourcePageId: '',
      notionTypeData: {},
    },
    capabilities: {
      writable: false,
    },
  };
}

interface LoadedTreeResult {
  tree: NotionApiBlockTree;
  sourcePageId: string;
  cacheScopes: EmbedLoadResult['cacheScopes'];
  writebackAllowed: boolean;
}

async function loadTree(
  repository: NotionRepository,
  target: ParsedNotionTarget,
  settings: NotionBlockEmbedSettings,
): Promise<LoadedTreeResult> {
  if (target.mode === 'empty_block_url') {
    throw new Error('Empty block URL target should not load a repository tree.');
  }
  if (target.mode === 'block_url') {
    return {
      tree: await repository.getBlockTree(target.blockId, settings.showChildren),
      sourcePageId: target.pageId,
      cacheScopes: repository.cacheScopesForTarget(target),
      writebackAllowed: settings.allowWriteback,
    };
  }
  if (target.mode === 'page_heading') {
    return {
      tree: await repository.getPageSectionByHeading(target.pageId, target.heading, settings.showChildren),
      sourcePageId: target.pageId,
      cacheScopes: repository.cacheScopesForTarget(target),
      writebackAllowed: false,
    };
  }

  const resolved = await repository.getBlockTreeByNbeRef(target.pageNbeId, target.blockNbeId, settings.showChildren);
  return {
    tree: resolved.tree,
    sourcePageId: resolved.pageId,
    cacheScopes: [
      { kind: 'page_tree', pageId: resolved.pageId },
      { kind: 'block_tree', blockId: resolved.blockId },
    ],
    writebackAllowed: false,
  };
}

function createDetailedResult(
  parsedTarget: ParsedNotionTarget,
  root: EmbedBlockNode,
  writebackAllowed: boolean,
  cacheScopes: EmbedLoadResult['cacheScopes'],
  metrics: Omit<EmbedLoadMetrics, 'sharedLoadState'> & { sharedLoadState?: EmbedLoadMetrics['sharedLoadState'] },
): EmbedLoadDetailedResult {
  return {
    loaded: {
      parsedTarget,
      sourceMode: parsedTarget.mode,
      root,
      writebackAllowed,
      cacheScopes,
    },
    metrics: {
      parseMs: metrics.parseMs,
      repositoryMs: metrics.repositoryMs,
      adapterMs: metrics.adapterMs,
      totalMs: metrics.totalMs,
      sharedLoadState: metrics.sharedLoadState ?? 'leader',
    },
  };
}

async function loadEmbedPipeline(
  source: string,
  settings: NotionBlockEmbedSettings,
  repository: NotionRepository,
): Promise<EmbedLoadDetailedResult> {
  const totalStart = now();

  const parseStart = now();
  const parsedTarget = parseTarget(source);
  const parseMs = now() - parseStart;

  if (parsedTarget.mode === 'empty_block_url') {
    return createDetailedResult(parsedTarget, createEmptyRoot(), false, [], {
      parseMs,
      repositoryMs: 0,
      adapterMs: 0,
      totalMs: now() - totalStart,
    });
  }

  const repositoryStart = now();
  const loaded = await loadTree(repository, parsedTarget, settings);
  const repositoryMs = now() - repositoryStart;

  const adapterStart = now();
  const root = toEmbedNodeTree(loaded.tree, loaded.sourcePageId);
  const adapterMs = now() - adapterStart;

  return createDetailedResult(parsedTarget, root, loaded.writebackAllowed, loaded.cacheScopes, {
    parseMs,
    repositoryMs,
    adapterMs,
    totalMs: now() - totalStart,
  });
}

export function isEmbedSourceLikelyWarm(
  source: string,
  settings: NotionBlockEmbedSettings,
  repository: NotionRepository,
): boolean {
  try {
    return repository.isLikelyWarmTarget(parseTarget(source), settings.showChildren);
  } catch {
    return false;
  }
}

export async function loadEmbedFromSourceDetailed(
  source: string,
  settings: NotionBlockEmbedSettings,
  repository: NotionRepository,
  logger?: Logger,
): Promise<EmbedLoadDetailedResult> {
  const sharedKey = buildSharedLoadKey(source, settings);
  const running = sharedLoadTasks.get(sharedKey);
  if (running) {
    logger?.debug(`shared-load hit ${sharedKey}`);
    logger?.debug(`shared-load join ${sharedKey}`);
    const detailed = await running;
    return {
      loaded: detailed.loaded,
      metrics: {
        ...detailed.metrics,
        sharedLoadState: 'join',
      },
    };
  }

  const task = loadEmbedPipeline(source, settings, repository).finally(() => {
    if (sharedLoadTasks.get(sharedKey) === task) {
      sharedLoadTasks.delete(sharedKey);
    }
  });
  sharedLoadTasks.set(sharedKey, task);
  return task;
}

export async function loadEmbedFromSource(
  source: string,
  settings: NotionBlockEmbedSettings,
  repository: NotionRepository,
): Promise<EmbedLoadResult> {
  return (await loadEmbedFromSourceDetailed(source, settings, repository)).loaded;
}

export function clearSharedEmbedLoadTasks(): void {
  sharedLoadTasks.clear();
}
