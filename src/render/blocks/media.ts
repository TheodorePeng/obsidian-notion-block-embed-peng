import { EmbedBlockNode } from '../../core/models';
import { applyImageWidthRatio } from '../../image/presentation';
import { attachImageResizeController } from '../../image/resize-controller';
import { appendRichTextOrFallback } from '../rich-text';
import { BlockRenderContext } from './types';

export function renderMediaBlockContent(host: HTMLElement, node: EmbedBlockNode, ctx: BlockRenderContext): boolean {
  if (node.type !== 'image') return false;

  const figure = document.createElement('figure');
  figure.className = 'nbe-image';
  const frame = document.createElement('div');
  frame.className = 'nbe-image-frame';
  figure.appendChild(frame);

  if (node.props.imageUrl) {
    const image = document.createElement('img');
    image.className = 'nbe-image-img';
    image.src = node.props.imageUrl;
    image.alt = node.richText.map((item) => item.plainText).join(' ').trim() || 'Notion image';
    image.loading = 'lazy';
    frame.appendChild(image);

    const rememberedRatio = ctx.imageSizing?.getWidthRatio(node.id);
    applyImageWidthRatio(frame, rememberedRatio);
    ctx.imageSizing?.touch(node.id);

    const handle = document.createElement('button');
    handle.className = 'nbe-image-resize-handle';
    handle.type = 'button';
    handle.setAttribute('aria-label', 'Resize image');
    frame.appendChild(handle);

    const resizeSession = attachImageResizeController({
      blockId: node.id,
      targetEl: frame,
      handleEl: handle,
      initialWidthRatio: rememberedRatio,
      watchRoots: [figure, host],
      onCommit: (blockId, widthRatio) => {
        ctx.imageSizing?.rememberWidthRatio(blockId, widthRatio);
      },
      onReset: (blockId) => {
        ctx.imageSizing?.resetWidthRatio(blockId);
      },
      onFlush: () => ctx.imageSizing?.flush(),
    });
    ctx.registerCleanup?.(() => {
      resizeSession.flushPending();
      resizeSession.dispose();
    });
  } else {
    const missing = document.createElement('div');
    missing.className = 'nbe-unsupported';
    missing.textContent = 'Image URL is missing.';
    frame.appendChild(missing);
  }

  if (node.richText.length > 0) {
    const caption = document.createElement('figcaption');
    caption.className = 'nbe-image-caption';
    appendRichTextOrFallback(caption, node.richText);
    figure.appendChild(caption);
  }

  host.appendChild(figure);
  return true;
}
