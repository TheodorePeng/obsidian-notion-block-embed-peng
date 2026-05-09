import type { App, WorkspaceLeaf } from 'obsidian';
import type { NotionOpenMode } from '../core/settings';

const WEBVIEWER_PLUGIN_ID = 'webviewer';
const WEBVIEWER_VIEW_TYPE = 'webviewer';
const FLOATING_WINDOW_SIZE = { width: 1280, height: 900 };

interface WebviewerState {
  type: string;
  active: boolean;
  state: {
    url: string;
    title: string;
    navigate: boolean;
  };
}

type ManagedMode = Exclude<NotionOpenMode, 'external_browser'>;
type WindowKind = 'side' | 'floating';

interface ManagedWebviewerInstance {
  mode: ManagedMode;
  windowKind: WindowKind;
  leaf: WorkspaceLeaf;
  owned: boolean;
}

function createWebviewerState(url: string): WebviewerState {
  return {
    type: WEBVIEWER_VIEW_TYPE,
    active: true,
    state: {
      url,
      title: url,
      navigate: true,
    },
  };
}

export class NotionWebHostService {
  private sideInstance: ManagedWebviewerInstance | null = null;
  private floatingInstance: ManagedWebviewerInstance | null = null;

  constructor(private readonly app: App) {}

  async openUrl(url: string, mode: NotionOpenMode, _anchorEl?: HTMLElement): Promise<void> {
    if (mode === 'external_browser') {
      this.closeSideInstance();
      this.closeFloatingInstance();
      await this.openInExternalBrowser(url);
      return;
    }

    await this.ensureWebviewerEnabled();

    if (mode === 'side_panel') {
      this.closeFloatingInstance();
      this.sideInstance = await this.ensureSideInstance(url);
      return;
    }

    this.closeSideInstance();
    this.floatingInstance = await this.ensureFloatingInstance(url);
  }

  handleWorkspaceWindowClose(): void {
    if (!this.isInstanceAlive(this.floatingInstance)) {
      this.floatingInstance = null;
    }
  }

  dispose(): void {
    this.closeSideInstance();
    this.closeFloatingInstance();
  }

  private async openInExternalBrowser(url: string): Promise<void> {
    const electron = (window as typeof window & { require?: (id: string) => { shell?: { openExternal?: (url: string) => Promise<void> | void } } }).require?.('electron');
    const openExternal = electron?.shell?.openExternal;
    if (typeof openExternal === 'function') {
      await openExternal(url);
      return;
    }

    if (typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    throw new Error('Unable to open Notion in the external browser.');
  }

  private async ensureSideInstance(url: string): Promise<ManagedWebviewerInstance> {
    const state = createWebviewerState(url);
    const workspace = this.app.workspace as App['workspace'] & {
      ensureSideLeaf?: (
        type: string,
        side: 'left' | 'right',
        options?: { active?: boolean; split?: boolean; reveal?: boolean; state?: unknown },
      ) => Promise<WorkspaceLeaf>;
    };

    if (this.isInstanceAlive(this.sideInstance)) {
      await this.sideInstance.leaf.setViewState(state);
      return this.sideInstance;
    }

    if (typeof workspace.ensureSideLeaf === 'function') {
      const existingLeaves = this.app.workspace.getLeavesOfType(WEBVIEWER_VIEW_TYPE);
      const leaf = await workspace.ensureSideLeaf(WEBVIEWER_VIEW_TYPE, 'right', {
        active: true,
        reveal: true,
        state: state.state,
      });
      await leaf.setViewState(state);
      return {
        mode: 'side_panel',
        windowKind: 'side',
        leaf,
        owned: !existingLeaves.includes(leaf),
      };
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      throw new Error('Unable to open the Web viewer in the right sidebar.');
    }
    await leaf.setViewState(state);
    return {
      mode: 'side_panel',
      windowKind: 'side',
      leaf,
      owned: true,
    };
  }

  private async ensureFloatingInstance(url: string): Promise<ManagedWebviewerInstance> {
    const state = createWebviewerState(url);

    if (this.isInstanceAlive(this.floatingInstance)) {
      await this.floatingInstance.leaf.setViewState(state);
      return this.floatingInstance;
    }

    const leaf = await this.app.workspace.openPopoutLeaf({ size: FLOATING_WINDOW_SIZE });
    await leaf.setViewState(state);
    return {
      mode: 'floating_window',
      windowKind: 'floating',
      leaf,
      owned: true,
    };
  }

  private async ensureWebviewerEnabled(): Promise<void> {
    const internalPlugins = (this.app as unknown as {
      internalPlugins?: {
        getPluginById?: (id: string) => {
          enabled?: boolean;
          enable?: () => Promise<void>;
        } | null;
        enablePlugin?: (id: string) => Promise<void>;
        enablePluginAndSave?: (id: string) => Promise<void>;
      };
    }).internalPlugins;

    const plugin = internalPlugins?.getPluginById?.(WEBVIEWER_PLUGIN_ID) ?? null;
    if (!plugin) {
      throw new Error('Obsidian Web viewer core plugin is unavailable.');
    }

    if (plugin.enabled) return;

    if (typeof plugin.enable === 'function') {
      await plugin.enable();
    } else if (typeof internalPlugins?.enablePluginAndSave === 'function') {
      await internalPlugins.enablePluginAndSave(WEBVIEWER_PLUGIN_ID);
    } else if (typeof internalPlugins?.enablePlugin === 'function') {
      await internalPlugins.enablePlugin(WEBVIEWER_PLUGIN_ID);
    }

    const hasWebviewerView = Boolean(
      (this.app.workspace as unknown as { getViewCreatorByType?: (type: string) => unknown }).getViewCreatorByType?.(
        WEBVIEWER_VIEW_TYPE,
      ),
    );
    if (!plugin.enabled && !hasWebviewerView) {
      throw new Error('Failed to enable the Obsidian Web viewer core plugin.');
    }
  }

  private isInstanceAlive(instance: ManagedWebviewerInstance | null): instance is ManagedWebviewerInstance {
    if (!instance) return false;
    return this.app.workspace.getLeavesOfType(WEBVIEWER_VIEW_TYPE).includes(instance.leaf);
  }

  private closeSideInstance(): void {
    this.closeInstance(this.sideInstance);
    this.sideInstance = null;
  }

  private closeFloatingInstance(): void {
    this.closeInstance(this.floatingInstance);
    this.floatingInstance = null;
  }

  private closeInstance(instance: ManagedWebviewerInstance | null): void {
    if (!instance) return;
    if (!instance.owned) return;
    if (this.isInstanceAlive(instance)) {
      instance.leaf.detach();
    }
  }
}
