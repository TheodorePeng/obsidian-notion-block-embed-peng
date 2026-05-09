import { Notice, Plugin, TAbstractFile } from "obsidian";
import { Logger } from "./core/logger";
import { PersistedDataStore } from "./core/persisted-data-store";
import { createRuntime, PluginRuntime } from "./core/runtime";
import { NotionBlockEmbedSettingTab } from "./core/settings-tab";
import { DEFAULT_SETTINGS, NotionBlockEmbedSettings } from "./core/settings";
import { coercePersistedPluginData } from "./core/persisted-data";
import { NotionEmbedProcessor } from "./embed/processor";
import { createQuickInsertNotionEmbedCommand } from "./embed/quick-insert-command";
import { ImageSizeStore } from "./image/size-store";
import { NbeReferenceRegistryService } from "./nbe/registry";
import { normalizeNbeRef, NBE_PROTOCOL_ACTION } from "./nbe/ref";
import { NotionWebHostService } from "./notion-web/host";
import { FloatingEditorController } from "./writeback/editor-controller";

export default class NotionBlockEmbedPlugin extends Plugin {
  private settings: NotionBlockEmbedSettings = DEFAULT_SETTINGS;
  private readonly logger = new Logger();
  private readonly editor = new FloatingEditorController();
  private readonly runtime: PluginRuntime = createRuntime(this.logger);
  private imageSizeStore: ImageSizeStore | null = null;
  private persistedDataStore: PersistedDataStore | null = null;
  private processor: NotionEmbedProcessor | null = null;
  private notionWebHost: NotionWebHostService | null = null;
  private nbeRegistry: NbeReferenceRegistryService | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.logger.setEnabled(this.settings.debugLogs);
    this.runtime.applySettings(this.settings);
    this.imageSizeStore?.pruneExpired();
    this.notionWebHost = new NotionWebHostService(this.app);
    if (this.persistedDataStore) {
      this.nbeRegistry = new NbeReferenceRegistryService(this.app, this.logger, this.persistedDataStore);
    }

    this.registerEvent(
      this.app.workspace.on("window-close", () => {
        this.notionWebHost?.handleWorkspaceWindowClose();
      }),
    );

    this.registerVaultIndexEvents();
    this.registerObsidianProtocolHandler(NBE_PROTOCOL_ACTION, async (params) => {
      const rawRef = typeof params.nbe === "string" ? params.nbe : "";
      if (!rawRef) {
        new Notice('Missing "nbe" in Obsidian URI.');
        return;
      }
      try {
        const ref = normalizeNbeRef(rawRef).ref;
        await this.nbeRegistry?.openRef(ref);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    });

    this.processor = new NotionEmbedProcessor({
      app: this.app,
      logger: this.logger,
      runtime: {
        getSettings: () => this.runtime.getSettings(),
        getRepository: () => this.runtime.getRepository(),
        getWritebackService: () => this.runtime.getWritebackService(),
        invalidateScopes: (scopes) => this.runtime.invalidateScopes(scopes),
        trackEmbed: (container, registerChild, session) => this.runtime.trackEmbed(container, registerChild, session),
      },
      imageSizing: {
        getWidthRatio: (blockId) => this.imageSizeStore?.getWidthRatio(blockId),
        rememberWidthRatio: (blockId, widthRatio) => this.imageSizeStore?.rememberWidthRatio(blockId, widthRatio),
        resetWidthRatio: (blockId) => this.imageSizeStore?.resetWidthRatio(blockId),
        touch: (blockId) => this.imageSizeStore?.touch(blockId),
        flush: async () => {
          await this.imageSizeStore?.flush();
        },
      },
      editor: this.editor,
      notionWebHost: this.notionWebHost,
    });

    this.registerMarkdownCodeBlockProcessor("notion-embed", async (source, el, ctx) => {
      if (!this.processor) return;
      await this.processor.process(source, el, ctx);
    });

    this.addCommand({
      id: "refresh-all-notion-embeds",
      name: "Refresh all Notion embeds",
      callback: async () => {
        await this.runtime.refreshAllEmbeds({ forceGlobal: true });
        new Notice("Refreshed all Notion embeds.");
      },
    });

    this.addCommand({
      id: "clear-notion-embed-cache",
      name: "Clear Notion embed cache",
      callback: () => {
        this.runtime.clearAllCache();
        new Notice("Notion embed cache cleared.");
      },
    });

    this.addCommand({
      id: "clear-remembered-image-sizes",
      name: "Clear remembered image sizes",
      callback: async () => {
        this.imageSizeStore?.clearAll();
        await this.runtime.refreshAllEmbeds({ forceGlobal: false });
        new Notice("Cleared remembered image sizes.");
      },
    });

    this.addCommand({
      id: "rebuild-nbe-reference-registry",
      name: "Rebuild NBE reference registry",
      callback: async () => {
        await this.nbeRegistry?.rebuild();
        new Notice("Rebuilt NBE reference registry.");
      },
    });

    this.addCommand({
      id: "set-current-nbe-embed-as-primary-reference",
      name: "Set current NBE embed as primary reference",
      callback: async () => {
        const updated = await this.nbeRegistry?.setPrimaryFromActiveContext();
        new Notice(updated ? "Set primary NBE reference." : "Could not resolve the current NBE embed.");
      },
    });

    this.addCommand(createQuickInsertNotionEmbedCommand());

    this.addSettingTab(
      new NotionBlockEmbedSettingTab(this.app, this, {
        getSettings: () => this.settings,
        saveSettings: async (next, options) => {
          await this.updateSettings(next, options);
        },
        onManualRefresh: async () => {
          await this.runtime.refreshAllEmbeds({ forceGlobal: true });
          new Notice("Refreshed all Notion embeds.");
        },
        onClearCache: () => {
          this.runtime.clearAllCache();
          new Notice("Notion embed cache cleared.");
        },
        onClearImageSizes: async () => {
          this.imageSizeStore?.clearAll();
          await this.runtime.refreshAllEmbeds({ forceGlobal: false });
          new Notice("Cleared remembered image sizes.");
        },
      }),
    );
  }

  onunload(): void {
    this.processor?.dispose();
    this.nbeRegistry?.dispose();
    this.editor.close();
    this.notionWebHost?.dispose();
    this.imageSizeStore?.dispose();
    void this.persistedDataStore?.flush();
    this.runtime.dispose();
  }

  private async loadSettings(): Promise<void> {
    const persisted = coercePersistedPluginData(await this.loadData());
    this.persistedDataStore = new PersistedDataStore(persisted, async (next) => {
      await this.saveData(next);
    });
    this.runtime.attachPersistedDataStore(this.persistedDataStore);
    this.settings = persisted.settings;
    this.imageSizeStore = new ImageSizeStore({
      initialMemory: persisted.imageSizeMemory,
      save: async (imageSizeMemory) => {
        await this.persistedDataStore?.setImageSizeMemory(imageSizeMemory);
      },
    });
  }

  private async updateSettings(
    next: NotionBlockEmbedSettings,
    options?: { debounceMs?: number },
  ): Promise<void> {
    this.settings = next;
    this.logger.setEnabled(this.settings.debugLogs);
    await this.persistedDataStore?.setSettings(this.settings, options);
    this.runtime.applySettings(this.settings);
  }

  private registerVaultIndexEvents(): void {
    const schedule = (file: TAbstractFile | null | undefined) => {
      if (!file || !this.isRegistryIndexedFile(file.path)) return;
      this.nbeRegistry?.scheduleRescanPath(file.path);
    };

    this.registerEvent(this.app.vault.on('modify', (file) => schedule(file)));
    this.registerEvent(this.app.vault.on('create', (file) => schedule(file)));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (!file || !this.isRegistryIndexedFile(file.path)) return;
      void this.nbeRegistry?.removePath(file.path);
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      void this.nbeRegistry?.handleRename(oldPath, file.path);
    }));
  }

  private isRegistryIndexedFile(path: string): boolean {
    return path.endsWith('.md') || path.endsWith('.canvas');
  }
}
