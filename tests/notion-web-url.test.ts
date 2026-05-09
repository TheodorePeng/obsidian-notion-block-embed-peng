import { describe, expect, it } from 'vitest';
import { buildNotionBlockUrl, resolveNotionOpenUrl } from '../src/notion-web/url';
import { EmbedBlockNode } from '../src/core/models';

function createNode(id: string, canOpenInNotion = true): EmbedBlockNode {
  return {
    id,
    type: 'paragraph',
    richText: [{ plainText: 'Row' }],
    children: [],
    props: {},
    meta: {
      sourcePageId: '11111111-1111-1111-1111-111111111111',
      notionTypeData: {},
    },
    capabilities: {
      writable: false,
      canOpenInNotion,
    },
  };
}

describe('notion open URL helpers', () => {
  it('preserves host, path, and query while replacing the hash with the target block id', () => {
    const originalUrl =
      'https://www.notion.so/Workspace/Page-Title-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?source=copy_link#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    expect(buildNotionBlockUrl(originalUrl, 'cccccccc-cccc-cccc-cccc-cccccccccccc')).toBe(
      'https://www.notion.so/Workspace/Page-Title-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?source=copy_link#cccccccccccccccccccccccccccccccc',
    );
  });

  it('appends a block hash for page-heading mode urls without an existing hash', () => {
    const originalUrl = 'https://myteam.notion.site/Page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?source=copy_link';

    expect(buildNotionBlockUrl(originalUrl, 'dddddddd-dddd-dddd-dddd-dddddddddddd')).toBe(
      'https://myteam.notion.site/Page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?source=copy_link#dddddddddddddddddddddddddddddddd',
    );
  });

  it('falls back to the root embed url when the node cannot open in Notion', () => {
    const originalUrl = 'https://www.notion.so/Page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    expect(resolveNotionOpenUrl(originalUrl, createNode('cccccccc-cccc-cccc-cccc-cccccccccccc', false))).toBe(
      originalUrl,
    );
  });

  it('resolves the current row block url when the node is openable', () => {
    const originalUrl = 'https://www.notion.so/Page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    expect(resolveNotionOpenUrl(originalUrl, createNode('cccccccc-cccc-cccc-cccc-cccccccccccc'))).toBe(
      'https://www.notion.so/Page-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#cccccccccccccccccccccccccccccccc',
    );
  });
});
