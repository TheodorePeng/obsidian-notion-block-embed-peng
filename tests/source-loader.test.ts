import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { NotionApiBlockTree } from '../src/core/models';
import { clearSharedEmbedLoadTasks, loadEmbedFromSourceDetailed } from '../src/embed/source-loader';

function createParagraphTree(id: string, text: string): NotionApiBlockTree {
  return {
    block: {
      object: 'block',
      id,
      type: 'paragraph',
      has_children: false,
      paragraph: {
        rich_text: [{ plain_text: text }],
      },
    },
    children: [],
  };
}

describe('source-loader shared loads', () => {
  afterEach(() => {
    clearSharedEmbedLoadTasks();
  });

  it('joins concurrent loads for the same source and settings', async () => {
    let resolveTree: ((tree: NotionApiBlockTree) => void) | null = null;
    const repository = {
      getBlockTree: vi.fn(
        () =>
          new Promise<NotionApiBlockTree>((resolve) => {
            resolveTree = resolve;
          }),
      ),
      getPageSectionByHeading: vi.fn(),
      getBlockTreeByNbeRef: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
      isLikelyWarmTarget: vi.fn(() => false),
    };

    const source = 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const firstLoad = loadEmbedFromSourceDetailed(source, DEFAULT_SETTINGS, repository as never);
    const secondLoad = loadEmbedFromSourceDetailed(source, DEFAULT_SETTINGS, repository as never);

    expect(repository.getBlockTree).toHaveBeenCalledTimes(1);
    resolveTree?.(createParagraphTree('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Shared load'));

    const [firstResult, secondResult] = await Promise.all([firstLoad, secondLoad]);
    expect(firstResult.loaded.root?.children).toEqual(secondResult.loaded.root?.children);
    expect(secondResult.metrics.sharedLoadState).toBe('join');
  });
});
