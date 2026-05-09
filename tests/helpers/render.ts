import { vi } from 'vitest';
import { EmbedBlockNode } from '../../src/core/models';
import { RenderOptions, renderEmbed } from '../../src/render/renderer';

export function renderTestEmbed(root: EmbedBlockNode, overrides: Partial<RenderOptions> = {}) {
  const container = document.createElement('div');
  const cleanup = renderEmbed(container, root, {
    maxHeight: 400,
    showChildren: true,
    toggleDefaultExpanded: true,
    currentUrl: 'https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    onRefresh: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  });
  return { container, cleanup };
}
