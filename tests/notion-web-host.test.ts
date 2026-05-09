import { describe, expect, it, vi } from 'vitest';
import { NotionWebHostService } from '../src/notion-web/host';

type Leaf = {
  id: string;
  setViewState: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
};

function createLeaf(id: string, leaves: Leaf[]): Leaf {
  const leaf: Leaf = {
    id,
    setViewState: vi.fn(async () => undefined),
    detach: vi.fn(() => {
      const index = leaves.indexOf(leaf);
      if (index >= 0) leaves.splice(index, 1);
    }),
  };
  return leaf;
}

function createHostFixture() {
  const leaves: Leaf[] = [];
  const sideLeaf = createLeaf('side', leaves);
  leaves.push(sideLeaf);
  const plugin = {
    enabled: true,
    enable: vi.fn(async () => {
      plugin.enabled = true;
    }),
  };
  const app = {
    workspace: {
      getViewCreatorByType: vi.fn((type: string) => (type === 'webviewer' ? {} : null)),
      getLeavesOfType: vi.fn(() => [...leaves]),
      ensureSideLeaf: vi.fn(async () => {
        return sideLeaf;
      }),
      getRightLeaf: vi.fn(() => sideLeaf),
      openPopoutLeaf: vi.fn(async () => {
        const leaf = createLeaf(`floating-${leaves.length + 1}`, leaves);
        leaves.push(leaf);
        return leaf;
      }),
    },
    internalPlugins: {
      getPluginById: vi.fn(() => plugin),
    },
  };

  return { app, plugin, sideLeaf, leaves };
}

describe('NotionWebHostService', () => {
  it('opens the url in the external browser without touching webviewer state', async () => {
    const { app, plugin, sideLeaf } = createHostFixture();
    const openExternal = vi.fn(async () => undefined);
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ shell: { openExternal } })),
    });
    const host = new NotionWebHostService(app as never);

    await host.openUrl('https://www.notion.so/page#block', 'external_browser');

    expect(openExternal).toHaveBeenCalledWith('https://www.notion.so/page#block');
    expect(plugin.enable).not.toHaveBeenCalled();
    expect(sideLeaf.setViewState).not.toHaveBeenCalled();
  });

  it('auto-enables the official webviewer plugin before opening', async () => {
    const { app, plugin, sideLeaf } = createHostFixture();
    plugin.enabled = false;
    const host = new NotionWebHostService(app as never);

    await host.openUrl('https://www.notion.so/page#block', 'side_panel');

    expect(plugin.enable).toHaveBeenCalledTimes(1);
    expect(sideLeaf.setViewState).toHaveBeenCalledTimes(1);
  });

  it('reuses the same side panel webviewer leaf', async () => {
    const { app, sideLeaf } = createHostFixture();
    const host = new NotionWebHostService(app as never);

    await host.openUrl('https://www.notion.so/page#block-1', 'side_panel');
    await host.openUrl('https://www.notion.so/page#block-2', 'side_panel');

    expect(app.workspace.ensureSideLeaf).toHaveBeenCalledTimes(1);
    expect(sideLeaf.setViewState).toHaveBeenCalledTimes(2);
  });

  it('reuses the same floating window leaf', async () => {
    const { app, leaves } = createHostFixture();
    const host = new NotionWebHostService(app as never);

    await host.openUrl('https://www.notion.so/page#block-1', 'floating_window');
    const firstFloatingLeaf = leaves.find((leaf) => leaf.id.startsWith('floating-'))!;
    await host.openUrl('https://www.notion.so/page#block-2', 'floating_window');

    expect(app.workspace.openPopoutLeaf).toHaveBeenCalledTimes(1);
    expect(firstFloatingLeaf.setViewState).toHaveBeenCalledTimes(2);
  });

  it('switches modes by closing the previous mode leaf and opening the new one', async () => {
    const { app, sideLeaf, leaves } = createHostFixture();
    const host = new NotionWebHostService(app as never);

    await host.openUrl('https://www.notion.so/page#side', 'side_panel');
    await host.openUrl('https://www.notion.so/page#floating', 'floating_window');

    const floatingLeaf = leaves.find((leaf) => leaf.id.startsWith('floating-'));
    expect(sideLeaf.detach).not.toHaveBeenCalled();
    expect(floatingLeaf).toBeTruthy();
    expect(floatingLeaf?.setViewState).toHaveBeenCalledTimes(1);
  });

  it('drops stale floating references after the popout window closes', async () => {
    const { app, leaves } = createHostFixture();
    const host = new NotionWebHostService(app as never);

    await host.openUrl('https://www.notion.so/page#floating-1', 'floating_window');
    const firstFloatingLeaf = leaves.find((leaf) => leaf.id.startsWith('floating-'))!;
    firstFloatingLeaf.detach();
    host.handleWorkspaceWindowClose();

    await host.openUrl('https://www.notion.so/page#floating-2', 'floating_window');
    const secondFloatingLeaf = leaves.find((leaf) => leaf.id.startsWith('floating-'))!;

    expect(app.workspace.openPopoutLeaf).toHaveBeenCalledTimes(2);
    expect(secondFloatingLeaf).not.toBe(firstFloatingLeaf);
  });

  it('does not detach a reused side panel leaf on dispose', async () => {
    const { app, sideLeaf } = createHostFixture();
    const host = new NotionWebHostService(app as never);

    await host.openUrl('https://www.notion.so/page#side', 'side_panel');
    host.dispose();

    expect(sideLeaf.detach).not.toHaveBeenCalled();
  });
});
