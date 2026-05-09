import { MarkdownRenderChild } from "obsidian";
import { CACHE_TTL_MS, REFRESH_ALL_CONCURRENCY, TREE_CACHE_MAX_ENTRIES } from "./constants";
import { PluginError } from "./errors";
import { Logger } from "./logger";
import { PersistedDataStore } from "./persisted-data-store";
import { EmbedCacheScope, NotionApiBlockTree } from "./models";
import { DEFAULT_SETTINGS, NotionBlockEmbedSettings, tokenFingerprint } from "./settings";
import { AsyncTtlCache } from "../embed/cache";
import { EmbedInstanceStore } from "../embed/instance-store";
import { RefreshScheduler } from "../embed/refresh-scheduler";
import { clearSharedEmbedLoadTasks } from "../embed/source-loader";
import { NotionClient } from "../notion/client";
import { NbeResolutionCacheStore, NotionRepository } from "../notion/repository";
import { WritebackService } from "../writeback/service";
import { RenderSessionHandle } from "../embed/types";

export class PluginRuntime {
  private settings: NotionBlockEmbedSettings = DEFAULT_SETTINGS;
  private token = "";
  private fingerprint = "no-token";
  private client: NotionClient | null = null;
  private repository: NotionRepository | null = null;
  private writebackService: WritebackService | null = null;
  private persistedDataStore: PersistedDataStore | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly cache: AsyncTtlCache<NotionApiBlockTree>,
    private readonly instanceStore: EmbedInstanceStore,
    private readonly refreshScheduler: RefreshScheduler,
  ) {}

  applySettings(next: NotionBlockEmbedSettings): void {
    const nextToken = next.notionToken.trim();
    const tokenChanged = nextToken !== this.token;
    const conflictChanged = next.writebackConflictPolicy !== this.settings.writebackConflictPolicy;

    this.settings = next;

    if (tokenChanged) {
      this.token = nextToken;
      this.fingerprint = tokenFingerprint(nextToken);
      this.client = null;
      this.repository = null;
      this.writebackService = null;
      this.clearContentCache();
    } else if (conflictChanged) {
      this.writebackService = null;
    }

    this.configureRefreshScheduler();
  }

  getSettings(): NotionBlockEmbedSettings {
    return this.settings;
  }

  trackEmbed(
    container: HTMLElement,
    registerChild: (child: MarkdownRenderChild) => void,
    session: RenderSessionHandle,
  ): string {
    return this.instanceStore.track(container, registerChild, session);
  }

  getRepository(): NotionRepository {
    this.assertToken();
    if (!this.client) {
      this.client = new NotionClient(this.token, this.logger);
    }
    if (!this.repository) {
      this.repository = new NotionRepository(
        this.client,
        this.cache,
        this.logger,
        this.fingerprint,
        this.createNbeResolutionCacheStore(),
      );
    }
    return this.repository;
  }

  attachPersistedDataStore(store: PersistedDataStore): void {
    this.persistedDataStore = store;
    this.repository = null;
  }

  getWritebackService(): WritebackService {
    this.assertToken();
    if (!this.client) {
      this.client = new NotionClient(this.token, this.logger);
    }
    if (!this.writebackService) {
      this.writebackService = new WritebackService(
        this.client,
        this.logger,
        this.settings.writebackConflictPolicy,
        (scopes) => this.invalidateScopes(scopes),
      );
    }
    return this.writebackService;
  }

  clearContentCache(): void {
    clearSharedEmbedLoadTasks();
    if (this.repository) {
      this.repository.clearContentCache();
      return;
    }
    this.cache.clearAll();
  }

  clearAllCache(): void {
    clearSharedEmbedLoadTasks();
    if (this.repository) {
      this.repository.clearCache();
      return;
    }
    this.cache.clearAll();
    void this.persistedDataStore?.clearNbeResolutionCache(this.fingerprint);
    void this.persistedDataStore?.clearNbeResolvedTargetCache(this.fingerprint);
  }

  invalidateScopes(scopes: EmbedCacheScope[]): void {
    if (scopes.length === 0) return;
    if (!this.repository) return;
    this.repository.invalidateScopes(scopes);
  }

  async refreshAllEmbeds(options?: { forceGlobal?: boolean; concurrency?: number }): Promise<void> {
    if (options?.forceGlobal) {
      this.clearContentCache();
    }
    await this.instanceStore.refreshAll({
      concurrency: options?.concurrency ?? REFRESH_ALL_CONCURRENCY,
    });
  }

  dispose(): void {
    this.refreshScheduler.stop();
    this.instanceStore.clear();
    clearSharedEmbedLoadTasks();
    this.clearContentCache();
  }

  private assertToken(): void {
    if (!this.token) {
      throw new PluginError("CONFIG_MISSING_TOKEN", "Notion Integration Token is required.");
    }
  }

  private configureRefreshScheduler(): void {
    this.refreshScheduler.configure({
      policy: this.settings.refreshPolicy,
      intervalSec: this.settings.refreshIntervalSec,
      task: async () => {
        if (!this.instanceStore.hasActiveEmbeds()) {
          return;
        }
        await this.refreshAllEmbeds({
          forceGlobal: true,
          concurrency: REFRESH_ALL_CONCURRENCY,
        });
      },
    });
  }

  private createNbeResolutionCacheStore(): NbeResolutionCacheStore | undefined {
    if (!this.persistedDataStore) return undefined;
    return {
      getPageIndex: (tokenFingerprint, pageNbeId) =>
        this.persistedDataStore?.getNbeResolutionPageIndex(tokenFingerprint, pageNbeId) ?? null,
      setPageIndex: async (tokenFingerprint, pageIndex) => {
        await this.persistedDataStore?.setNbeResolutionPageIndex(tokenFingerprint, pageIndex);
      },
      deletePageIndex: async (tokenFingerprint, pageNbeId) => {
        await this.persistedDataStore?.deleteNbeResolutionPageIndex(tokenFingerprint, pageNbeId);
      },
      getResolvedTarget: (tokenFingerprint, ref) =>
        this.persistedDataStore?.getNbeResolvedTarget(tokenFingerprint, ref) ?? null,
      setResolvedTarget: async (tokenFingerprint, target) => {
        await this.persistedDataStore?.setNbeResolvedTarget(tokenFingerprint, target);
      },
      deleteResolvedTarget: async (tokenFingerprint, ref) => {
        await this.persistedDataStore?.deleteNbeResolvedTarget(tokenFingerprint, ref);
      },
      clearNamespace: async (tokenFingerprint) => {
        await this.persistedDataStore?.clearNbeResolutionCache(tokenFingerprint);
        await this.persistedDataStore?.clearNbeResolvedTargetCache(tokenFingerprint);
      },
    };
  }
}

export function createRuntime(logger: Logger): PluginRuntime {
  const cache = new AsyncTtlCache<NotionApiBlockTree>(CACHE_TTL_MS, TREE_CACHE_MAX_ENTRIES);
  const store = new EmbedInstanceStore(logger);
  const scheduler = new RefreshScheduler(logger);
  return new PluginRuntime(logger, cache, store, scheduler);
}
