import * as obsidian from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../src/core/logger';
import { createRenderSession } from '../src/embed/render-session';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { NotionApiBlockTree } from '../src/core/models';
import { EMPTY_NOTION_EMBED_MESSAGE } from '../src/embed/empty-state';

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

function createEquationTree(id: string, expression: string): NotionApiBlockTree {
  return {
    block: {
      object: 'block',
      id,
      type: 'equation',
      has_children: false,
      equation: {
        expression,
      },
    },
    children: [],
  };
}

function createMarkdownView(path: string, content: string): obsidian.MarkdownView {
  const view = new obsidian.MarkdownView();
  view.file = { path } as never;
  view.setViewData(content, false);
  return view;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRenderSession', () => {
  it('rerenders with the next source and disposes cleanly', async () => {
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    const repository = {
      getBlockTree: vi.fn(async (blockId: string) =>
        blockId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
          ? createParagraphTree(blockId, 'First block')
          : createParagraphTree(blockId, 'Second block'),
      ),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
    };

    const session = createRenderSession({
      app: {} as never,
      logger: new Logger(),
      runtime: {
        getSettings: () => DEFAULT_SETTINGS,
        getRepository: () => repository as never,
        getWritebackService: () => ({}) as never,
        invalidateScopes: vi.fn(),
        trackEmbed: vi.fn(),
      },
      imageSizing: {
        getWidthRatio: vi.fn(),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
      editor: { open: vi.fn(), close: vi.fn() } as never,
      notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
      source: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      mount,
      hostEl,
      ctx: {
        getSectionInfo: () => null,
      } as never,
    });

    await session.rerender();
    expect(mount.textContent).toContain('First block');

    await session.rerender({
      nextSource: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#cccccccccccccccccccccccccccccccc',
    });
    expect(mount.textContent).toContain('Second block');

    session.dispose();
    expect(repository.getBlockTree).toHaveBeenCalledTimes(2);
  });

  it('preloads MathJax when the loaded tree contains math', async () => {
    const loadMathJax = vi.spyOn(obsidian, 'loadMathJax').mockResolvedValue(undefined);
    const finishRenderMath = vi.spyOn(obsidian, 'finishRenderMath').mockResolvedValue(undefined);
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    const repository = {
      getBlockTree: vi.fn(async () => createEquationTree('math-block', 'x^2 + 1')),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
    };

    const session = createRenderSession({
      app: {} as never,
      logger: new Logger(),
      runtime: {
        getSettings: () => DEFAULT_SETTINGS,
        getRepository: () => repository as never,
        getWritebackService: () => ({}) as never,
        invalidateScopes: vi.fn(),
        trackEmbed: vi.fn(),
      },
      imageSizing: {
        getWidthRatio: vi.fn(),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
      editor: { open: vi.fn(), close: vi.fn() } as never,
      notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
      source: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      mount,
      hostEl,
      ctx: {
        getSectionInfo: () => null,
      } as never,
    });

    await session.rerender();

    expect(loadMathJax).toHaveBeenCalledTimes(1);
    expect(finishRenderMath).toHaveBeenCalledTimes(1);
  });

  it('does not preload MathJax when the loaded tree has no math', async () => {
    const loadMathJax = vi.spyOn(obsidian, 'loadMathJax').mockResolvedValue(undefined);
    const finishRenderMath = vi.spyOn(obsidian, 'finishRenderMath').mockResolvedValue(undefined);
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    const repository = {
      getBlockTree: vi.fn(async () => createParagraphTree('paragraph-block', 'No math here')),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
    };

    const session = createRenderSession({
      app: {} as never,
      logger: new Logger(),
      runtime: {
        getSettings: () => DEFAULT_SETTINGS,
        getRepository: () => repository as never,
        getWritebackService: () => ({}) as never,
        invalidateScopes: vi.fn(),
        trackEmbed: vi.fn(),
      },
      imageSizing: {
        getWidthRatio: vi.fn(),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
      editor: { open: vi.fn(), close: vi.fn() } as never,
      notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
      source: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      mount,
      hostEl,
      ctx: {
        getSectionInfo: () => null,
      } as never,
    });

    await session.rerender();

    expect(loadMathJax).not.toHaveBeenCalled();
    expect(finishRenderMath).not.toHaveBeenCalled();
  });

  it('renders an empty embed shell with a source-edit button and skips repository loading for blank source', async () => {
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    const repository = {
      getBlockTree: vi.fn(),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn(() => []),
    };

    const session = createRenderSession({
      app: {
        workspace: {
          iterateAllLeaves: vi.fn(),
          getActiveViewOfType: vi.fn(() => null),
          getActiveFile: vi.fn(() => null),
          revealLeaf: vi.fn(async () => undefined),
          setActiveLeaf: vi.fn(),
        },
      } as never,
      logger: new Logger(),
      runtime: {
        getSettings: () => DEFAULT_SETTINGS,
        getRepository: () => repository as never,
        getWritebackService: () => ({}) as never,
        invalidateScopes: vi.fn(),
        trackEmbed: vi.fn(),
      },
      imageSizing: {
        getWidthRatio: vi.fn(),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
      editor: { open: vi.fn(), close: vi.fn() } as never,
      notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
      source: '\n  \n',
      mount,
      hostEl,
      ctx: {
        getSectionInfo: () => ({}) as never,
      } as never,
    });

    await session.rerender();

    expect(repository.getBlockTree).not.toHaveBeenCalled();
    expect(repository.getPageSectionByHeading).not.toHaveBeenCalled();
    expect(mount.querySelector('.nbe-embed')).toBeTruthy();
    expect(mount.querySelector('.nbe-footer')).toBeFalsy();
    expect(mount.querySelector('.nbe-empty-note')?.textContent).toBe(EMPTY_NOTION_EMBED_MESSAGE);
    expect(mount.querySelector('.nbe-error')).toBeFalsy();
  });

  it('keeps the footer visible for invalid single-line sources so users can repair them in place', async () => {
    const invalidSource = 'not-a-valid-embed-url';
    const validSource =
      'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const noteContent = ['before', '```notion-embed', invalidSource, '```', 'after'].join('\n');
    const activeView = createMarkdownView('Note.md', noteContent);
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    const repository = {
      getBlockTree: vi.fn(async () => createParagraphTree('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Recovered block')),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
    };

    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });

    try {
      const session = createRenderSession({
        app: {
          workspace: {
            getActiveViewOfType: vi.fn(() => activeView),
            getActiveFile: vi.fn(() => activeView.file),
            iterateAllLeaves: vi.fn(),
          },
          vault: {
            getFileByPath: vi.fn(() => null),
            read: vi.fn(),
            modify: vi.fn(),
          },
        } as never,
        logger: new Logger(),
        runtime: {
          getSettings: () => DEFAULT_SETTINGS,
          getRepository: () => repository as never,
          getWritebackService: () => ({}) as never,
          invalidateScopes: vi.fn(),
          trackEmbed: vi.fn(),
        },
        imageSizing: {
          getWidthRatio: vi.fn(),
          rememberWidthRatio: vi.fn(),
          resetWidthRatio: vi.fn(),
          touch: vi.fn(),
          flush: vi.fn(async () => undefined),
        },
        editor: { open: vi.fn(), close: vi.fn() } as never,
        notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
        source: invalidSource,
        mount,
        hostEl,
        ctx: {
          sourcePath: '',
          getSectionInfo: () =>
            ({
              text: ['```notion-embed', invalidSource, '```'].join('\n'),
              lineStart: 1,
              lineEnd: 3,
            }) as never,
        } as never,
      });

      await session.rerender();

      expect(mount.querySelector('.nbe-error')).toBeTruthy();
      const urlInput = mount.querySelector('.nbe-url-input') as HTMLInputElement | null;
      expect(urlInput?.value).toBe(invalidSource);
      expect(mount.querySelector('.nbe-footer')).toBeTruthy();

      urlInput?.dispatchEvent(new FocusEvent('focus'));
      if (urlInput) urlInput.value = validSource;
      urlInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mount.textContent).toContain('Recovered block');
      expect(mount.querySelector('.nbe-error')).toBeFalsy();
      expect(activeView.getViewData()).toContain(validSource);
    } finally {
      raf.mockRestore();
    }
  });

  it('keeps invalid multi-line sources in pure error mode without footer editing', async () => {
    const source = ['url: not-a-valid-url', 'heading: Broken Heading'].join('\n');
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    const repository = {
      getBlockTree: vi.fn(),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn(() => []),
    };

    const session = createRenderSession({
      app: {} as never,
      logger: new Logger(),
      runtime: {
        getSettings: () => DEFAULT_SETTINGS,
        getRepository: () => repository as never,
        getWritebackService: () => ({}) as never,
        invalidateScopes: vi.fn(),
        trackEmbed: vi.fn(),
      },
      imageSizing: {
        getWidthRatio: vi.fn(),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
      editor: { open: vi.fn(), close: vi.fn() } as never,
      notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
      source,
      mount,
      hostEl,
      ctx: {
        getSectionInfo: () => ({}) as never,
      } as never,
    });

    await session.rerender();

    expect(mount.querySelector('.nbe-error')).toBeTruthy();
    expect(mount.querySelector('.nbe-footer')).toBeFalsy();
  });

  it('keeps existing content visible during warm-path rerenders until the next result is ready', async () => {
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    let secondLoadResolve: ((tree: NotionApiBlockTree) => void) | null = null;
    const repository = {
      getBlockTree: vi
        .fn(async (blockId: string) => {
          if (blockId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') {
            return createParagraphTree(blockId, 'Warm first block');
          }
          return new Promise<NotionApiBlockTree>((resolve) => {
            secondLoadResolve = resolve;
          });
        }),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
      isLikelyWarmTarget: vi.fn(() => true),
    };

    const session = createRenderSession({
      app: {} as never,
      logger: new Logger(),
      runtime: {
        getSettings: () => DEFAULT_SETTINGS,
        getRepository: () => repository as never,
        getWritebackService: () => ({}) as never,
        invalidateScopes: vi.fn(),
        trackEmbed: vi.fn(),
      },
      imageSizing: {
        getWidthRatio: vi.fn(),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
      editor: { open: vi.fn(), close: vi.fn() } as never,
      notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
      source: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      mount,
      hostEl,
      ctx: {
        getSectionInfo: () => null,
      } as never,
    });

    await session.rerender();
    expect(mount.textContent).toContain('Warm first block');

    const rerenderPromise = session.rerender({
      nextSource: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#cccccccccccccccccccccccccccccccc',
    });

    expect(mount.textContent).toContain('Warm first block');
    expect(mount.textContent).not.toContain('Loading Notion content...');

    secondLoadResolve?.(createParagraphTree('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Warm second block'));
    await rerenderPromise;

    expect(mount.textContent).toContain('Warm second block');
  });

  it('still shows loading immediately for cold-path rerenders', async () => {
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    let secondLoadResolve: ((tree: NotionApiBlockTree) => void) | null = null;
    const repository = {
      getBlockTree: vi
        .fn(async (blockId: string) => {
          if (blockId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') {
            return createParagraphTree(blockId, 'Cold first block');
          }
          return new Promise<NotionApiBlockTree>((resolve) => {
            secondLoadResolve = resolve;
          });
        }),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
      isLikelyWarmTarget: vi.fn(() => false),
    };

    const session = createRenderSession({
      app: {} as never,
      logger: new Logger(),
      runtime: {
        getSettings: () => DEFAULT_SETTINGS,
        getRepository: () => repository as never,
        getWritebackService: () => ({}) as never,
        invalidateScopes: vi.fn(),
        trackEmbed: vi.fn(),
      },
      imageSizing: {
        getWidthRatio: vi.fn(),
        rememberWidthRatio: vi.fn(),
        resetWidthRatio: vi.fn(),
        touch: vi.fn(),
        flush: vi.fn(async () => undefined),
      },
      editor: { open: vi.fn(), close: vi.fn() } as never,
      notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
      source: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      mount,
      hostEl,
      ctx: {
        getSectionInfo: () => null,
      } as never,
    });

    await session.rerender();
    expect(mount.textContent).toContain('Cold first block');

    const rerenderPromise = session.rerender({
      nextSource: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#cccccccccccccccccccccccccccccccc',
    });

    expect(mount.textContent).toContain('Loading Notion content...');

    secondLoadResolve?.(createParagraphTree('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cold second block'));
    await rerenderPromise;

    expect(mount.textContent).toContain('Cold second block');
  });

  it('keeps the footer visible for invalid single-line sources inside Canvas so users can repair them in place', async () => {
    const invalidSource = 'not-a-valid-embed-url';
    const validSource =
      'obsidian://notion-block-embed?vault=My%20Vault&action=open-ref&nbe=p20260328153045-k7_b7k2m9';
    const canvasFile = { path: 'Board.canvas', extension: 'canvas' };
    const canvasData = {
      nodes: [
        {
          id: 'node-1',
          type: 'text',
          text: ['```notion-embed', invalidSource, '```'].join('\n'),
        },
      ],
      edges: [],
    };
    const mount = document.createElement('div');
    const hostEl = document.createElement('div');
    hostEl.appendChild(mount);
    const repository = {
      getBlockTree: vi.fn(async () => createParagraphTree('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Recovered from canvas')),
      getBlockTreeByNbeRef: vi.fn(async () => ({
        tree: createParagraphTree('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Recovered from canvas'),
        pageId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        blockId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      })),
      getPageSectionByHeading: vi.fn(),
      cacheScopesForTarget: vi.fn((target) => [{ kind: 'block_tree' as const, blockId: target.blockId }]),
    };

    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });

    try {
      const session = createRenderSession({
        app: {
          workspace: {
            getActiveViewOfType: vi.fn(() => null),
            getActiveFile: vi.fn(() => canvasFile),
            iterateAllLeaves: vi.fn(),
            activeLeaf: {
              view: {
                getViewType: vi.fn(() => 'canvas'),
                canvas: {
                  selection: [{ id: 'node-1' }],
                },
              },
            },
          },
          vault: {
            getFileByPath: vi.fn(() => canvasFile),
            read: vi.fn(async () => JSON.stringify(canvasData, null, 2)),
            modify: vi.fn(async (_file, nextContent: string) => {
              Object.assign(canvasData, JSON.parse(nextContent));
            }),
          },
        } as never,
        logger: new Logger(),
        runtime: {
          getSettings: () => DEFAULT_SETTINGS,
          getRepository: () => repository as never,
          getWritebackService: () => ({}) as never,
          invalidateScopes: vi.fn(),
          trackEmbed: vi.fn(),
        },
        imageSizing: {
          getWidthRatio: vi.fn(),
          rememberWidthRatio: vi.fn(),
          resetWidthRatio: vi.fn(),
          touch: vi.fn(),
          flush: vi.fn(async () => undefined),
        },
        editor: { open: vi.fn(), close: vi.fn() } as never,
        notionWebHost: { openUrl: vi.fn(), dispose: vi.fn(), handleWorkspaceWindowClose: vi.fn() } as never,
        source: invalidSource,
        mount,
        hostEl,
        ctx: {
          sourcePath: 'Board.canvas',
          getSectionInfo: () => null,
        } as never,
      });

      await session.rerender();

      expect(mount.querySelector('.nbe-error')).toBeTruthy();
      const urlInput = mount.querySelector('.nbe-url-input') as HTMLInputElement | null;
      expect(urlInput?.value).toBe(invalidSource);
      expect(mount.querySelector('.nbe-footer')).toBeTruthy();

      urlInput?.dispatchEvent(new FocusEvent('focus'));
      if (urlInput) urlInput.value = validSource;
      urlInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mount.textContent).toContain('Recovered from canvas');
      expect(mount.querySelector('.nbe-error')).toBeFalsy();
      expect(canvasData.nodes[0].text).toContain(validSource);
    } finally {
      raf.mockRestore();
    }
  });
});
