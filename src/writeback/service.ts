import { PluginError } from "../core/errors";
import { Logger } from "../core/logger";
import { EmbedBlockNode, EmbedCacheScope, NotionApiBlock } from "../core/models";
import { WritebackConflictPolicy } from "../core/settings";
import { hasWriteConflict } from "./conflict";
import {
  buildInsertSiblingBelowChildren,
  buildTodoCheckedPayload,
  buildUpdatePayload,
} from "./patchers";

interface WritebackClient {
  getBlock(blockId: string): Promise<NotionApiBlock>;
  updateBlock(blockId: string, payload: Record<string, unknown>): Promise<NotionApiBlock>;
  appendBlockChildren(
    parentId: string,
    children: Array<Record<string, unknown>>,
    after?: string,
  ): Promise<NotionApiBlock[]>;
  deleteBlock(blockId: string): Promise<NotionApiBlock>;
}

export class WritebackService {
  constructor(
    private readonly client: WritebackClient,
    private readonly logger: Logger,
    private readonly conflictPolicy: WritebackConflictPolicy,
    private readonly invalidateScopes: (scopes: EmbedCacheScope[]) => void,
  ) {}

  private invalidateWritebackScopes(node: EmbedBlockNode): void {
    const scopes: EmbedCacheScope[] = [
      { kind: "block_tree", blockId: node.id },
      { kind: "page_tree", pageId: node.meta.sourcePageId },
      { kind: "page_section", pageId: node.meta.sourcePageId },
    ];
    if (node.meta.parentId && node.meta.parentType === "block_id") {
      scopes.push({ kind: "block_tree", blockId: node.meta.parentId });
    }
    this.invalidateScopes(scopes);
  }

  async updateBlockText(node: EmbedBlockNode, nextText: string): Promise<NotionApiBlock> {
    if (!node.capabilities.writable) {
      throw new PluginError("INVALID_INPUT", `Block type ${node.type} is read-only in limited writeback mode.`);
    }

    if (this.conflictPolicy !== "none") {
      const latest = await this.client.getBlock(node.id);
      if (
        hasWriteConflict({
          policy: this.conflictPolicy,
          localLastEditedTime: node.meta.lastEditedTime,
          remoteLastEditedTime: latest.last_edited_time,
        })
      ) {
        throw new PluginError("WRITE_CONFLICT", "Remote content changed while editing.");
      }
    }

    const payload = buildUpdatePayload(node, nextText);
    const updated = await this.client.updateBlock(node.id, payload);
    this.logger.debug(`writeback success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return updated;
  }

  async insertSiblingBelow(node: EmbedBlockNode): Promise<NotionApiBlock[]> {
    if (!node.capabilities.canInsertSiblingBelow) {
      throw new PluginError("INVALID_INPUT", `Block type ${node.type} does not support sibling insertion.`);
    }
    if (!node.meta.parentId) {
      throw new PluginError("INVALID_INPUT", "Unable to determine the parent list for this block.");
    }

    const children = buildInsertSiblingBelowChildren(node);
    const inserted = await this.client.appendBlockChildren(node.meta.parentId, children, node.id);
    this.logger.debug(`insert sibling below success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return inserted;
  }

  async deleteBlockNode(node: EmbedBlockNode): Promise<NotionApiBlock> {
    if (!node.capabilities.canDeleteSelf) {
      throw new PluginError("INVALID_INPUT", "Only simple leaf list items can be deleted here.");
    }
    if (node.children.length > 0) {
      throw new PluginError("INVALID_INPUT", "Items with children must be deleted from Notion.");
    }

    const deleted = await this.client.deleteBlock(node.id);
    this.logger.debug(`delete block success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return deleted;
  }

  async updateTodoChecked(node: EmbedBlockNode, checked: boolean): Promise<NotionApiBlock> {
    if (!node.capabilities.canToggleTodo || node.type !== "to_do") {
      throw new PluginError("INVALID_INPUT", "Only to-do items support checked-state updates.");
    }

    const payload = buildTodoCheckedPayload(node, checked);
    const updated = await this.client.updateBlock(node.id, payload);
    this.logger.debug(`toggle to_do success ${node.id}`);
    this.invalidateWritebackScopes(node);
    return updated;
  }
}
