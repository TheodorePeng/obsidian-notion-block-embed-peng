import { App, MarkdownPostProcessorContext } from 'obsidian';
import { Logger } from '../core/logger';
import { EmbedCacheScope, EmbedLoadResult } from '../core/models';
import { NotionBlockEmbedSettings } from '../core/settings';
import { ImageSizeAccess } from '../image/contracts';
import { NotionWebHostService } from '../notion-web/host';
import { NotionRepository } from '../notion/repository';
import { FloatingEditorController } from '../writeback/editor-controller';
import { WritebackService } from '../writeback/service';

export interface RenderInput {
  invalidateScopes?: EmbedCacheScope[];
  nextSource?: string;
}

export interface RenderSessionHandle {
  rerender: (input?: RenderInput) => Promise<void>;
  dispose: () => void;
}

export interface RuntimeAccessor {
  getSettings: () => NotionBlockEmbedSettings;
  getRepository: () => NotionRepository;
  getWritebackService: () => WritebackService;
  invalidateScopes: (scopes: EmbedCacheScope[]) => void;
  trackEmbed: (
    container: HTMLElement,
    registerChild: (child: import('obsidian').MarkdownRenderChild) => void,
    session: RenderSessionHandle,
  ) => string;
}

export interface ProcessorDependencies {
  app: App;
  logger: Logger;
  runtime: RuntimeAccessor;
  imageSizing: ImageSizeAccess;
  editor: FloatingEditorController;
  notionWebHost: NotionWebHostService;
}

export interface RenderLoadedInput {
  mount: HTMLElement;
  hostEl: HTMLElement;
  ctx: MarkdownPostProcessorContext;
  loaded: EmbedLoadResult;
  currentSource: string;
  rerender: (input?: RenderInput) => Promise<void>;
}
