import { NotionApiBlock, NotionApiBlockTree } from "../../../src/core/models";

export const originalSyncedBlock: NotionApiBlock = {
  object: "block",
  id: "synced-original",
  type: "synced_block",
  has_children: true,
  synced_block: {
    synced_from: null,
    children: [
      {
        object: "block",
        id: "synced-inline-child",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", plain_text: "Synced inline child", text: { content: "Synced inline child" } }],
        },
      },
    ],
  },
};

export const duplicateSyncedBlock: NotionApiBlock = {
  object: "block",
  id: "synced-duplicate",
  type: "synced_block",
  has_children: true,
  synced_block: {
    synced_from: {
      block_id: "synced-source",
    },
  },
};

export const syncedSourceChildren: NotionApiBlock[] = [
  {
    object: "block",
    id: "synced-source-child",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", plain_text: "Synced source child", text: { content: "Synced source child" } }],
    },
  },
];

export const syncedBlockTree: NotionApiBlockTree = {
  block: originalSyncedBlock,
  children: [
    {
      block: {
        object: "block",
        id: "synced-rendered-child",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", plain_text: "Synced rendered child", text: { content: "Synced rendered child" } }],
        },
      },
      children: [],
    },
  ],
};
