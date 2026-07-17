import { MAX_TREE_DEPTH, REPOSITORY_TREE_CONCURRENCY } from "../core/constants";
import { Logger } from "../core/logger";
import { NotionApiBlock, NotionApiBlockTree, NotionApiDatabase, NotionApiPage } from "../core/models";
import { mapWithConcurrency } from "../embed/concurrency";
import { getUnsupportedBlockType } from "./unsupported-block";

export interface NotionReadClient {
  getBlock(blockId: string): Promise<NotionApiBlock>;
  listBlockChildren(blockId: string): Promise<NotionApiBlock[]>;
  searchDatabases(): Promise<NotionApiDatabase[]>;
  queryDatabaseByNbeId(databaseId: string, nbeId: string): Promise<NotionApiPage[]>;
}

export class NotionChildrenHydrator {
  constructor(
    private readonly client: NotionReadClient,
    private readonly logger: Logger,
  ) {}

  async loadChildren(parentId: string, depth: number): Promise<NotionApiBlockTree[]> {
    if (depth > MAX_TREE_DEPTH) return [];
    const children = await this.client.listBlockChildren(parentId);
    return mapWithConcurrency(children, REPOSITORY_TREE_CONCURRENCY, async (child) => ({
      block: child,
      children: child.has_children ? await this.loadChildrenForBlock(child, depth + 1) : [],
    }));
  }

  async loadChildrenForBlock(block: NotionApiBlock, depth: number): Promise<NotionApiBlockTree[]> {
    if (!block.has_children || depth > MAX_TREE_DEPTH) return [];
    const unsupportedType = getUnsupportedBlockType(block);
    if (unsupportedType) {
      this.logger.debug(`repository hydration skipped unsupported block=${block.id} type=${unsupportedType}`);
      return [];
    }
    if (block.type !== "synced_block") {
      return this.loadChildren(block.id, depth);
    }
    return this.loadSyncedChildren(block, depth);
  }

  private async loadSyncedChildren(block: NotionApiBlock, depth: number): Promise<NotionApiBlockTree[]> {
    if (depth > MAX_TREE_DEPTH) return [];

    const listedChildren = await this.loadChildren(block.id, depth);
    if (listedChildren.length > 0) {
      return listedChildren;
    }

    const syncedData = this.getSyncedBlockData(block);
    const inlineChildren = this.getInlineSyncedChildren(syncedData);
    if (inlineChildren.length > 0) {
      return this.mapInlineChildren(inlineChildren, depth);
    }

    const sourceBlockId = this.getSyncedSourceBlockId(syncedData);
    if (!sourceBlockId || sourceBlockId === block.id || depth >= MAX_TREE_DEPTH) {
      return [];
    }

    try {
      return await this.loadChildren(sourceBlockId, depth + 1);
    } catch (error) {
      this.logger.debug(
        `repository synced_block fallback failed block=${block.id} source=${sourceBlockId} error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private async mapInlineChildren(children: NotionApiBlock[], depth: number): Promise<NotionApiBlockTree[]> {
    return mapWithConcurrency(children, REPOSITORY_TREE_CONCURRENCY, async (child) => {
      const inlineGrandChildren = this.getInlineChildChildren(child);
      let grandChildren: NotionApiBlockTree[] = [];

      if (inlineGrandChildren.length > 0 && depth < MAX_TREE_DEPTH) {
        grandChildren = await this.mapInlineChildren(inlineGrandChildren, depth + 1);
      } else if (child.has_children && depth < MAX_TREE_DEPTH) {
        grandChildren = await this.loadChildrenForBlock(child, depth + 1);
      }

      return {
        block: child,
        children: grandChildren,
      };
    });
  }

  private getSyncedBlockData(block: NotionApiBlock): Record<string, unknown> {
    const value = block.synced_block;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  private getInlineSyncedChildren(data: Record<string, unknown>): NotionApiBlock[] {
    const value = data.children;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is NotionApiBlock => Boolean(item && typeof item === "object"));
  }

  private getSyncedSourceBlockId(data: Record<string, unknown>): string | null {
    const syncedFrom = data.synced_from;
    if (!syncedFrom || typeof syncedFrom !== "object") return null;
    return typeof (syncedFrom as { block_id?: unknown }).block_id === "string"
      ? (syncedFrom as { block_id: string }).block_id
      : null;
  }

  private getInlineChildChildren(block: NotionApiBlock): NotionApiBlock[] {
    const typeData = block[block.type];
    if (!typeData || typeof typeData !== "object") return [];
    const children = (typeData as Record<string, unknown>).children;
    if (!Array.isArray(children)) return [];
    return children.filter((item): item is NotionApiBlock => Boolean(item && typeof item === "object"));
  }
}
