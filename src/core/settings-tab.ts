import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { NotionBlockEmbedSettings } from "./settings";

interface SettingsTabDeps {
  getSettings: () => NotionBlockEmbedSettings;
  saveSettings: (next: NotionBlockEmbedSettings, options?: { debounceMs?: number }) => Promise<void>;
  onManualRefresh: () => Promise<void>;
  onClearCache: () => void;
  onClearImageSizes: () => Promise<void>;
}

const SETTINGS_DEBOUNCE_MS = 250;

export class NotionBlockEmbedSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly deps: SettingsTabDeps,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const settings = this.deps.getSettings();

    new Setting(containerEl)
      .setName("Notion Integration Token")
      .setDesc("Required for reading and optional limited writeback via Notion API.")
      .addText((text) =>
        text
          .setPlaceholder("secret_xxx")
          .setValue(settings.notionToken)
          .onChange(async (value) => {
            await this.updateSettings({ notionToken: value.trim() }, { debounceMs: SETTINGS_DEBOUNCE_MS });
          }),
      );

    new Setting(containerEl)
      .setName("Show child blocks")
      .setDesc("Render the target block with its children.")
      .addToggle((toggle) =>
        toggle.setValue(settings.showChildren).onChange(async (value) => {
          await this.updateSettings({ showChildren: value });
        }),
      );

    new Setting(containerEl)
      .setName("Toggle default expanded")
      .setDesc("When enabled, toggle blocks start in expanded state.")
      .addToggle((toggle) =>
        toggle.setValue(settings.toggleDefaultExpanded).onChange(async (value) => {
          await this.updateSettings({ toggleDefaultExpanded: value });
        }),
      );

    new Setting(containerEl)
      .setName("Max render height")
      .setDesc("Maximum height of the rendered content area.")
      .addSlider((slider) =>
        slider
          .setLimits(240, 1200, 20)
          .setValue(settings.maxHeight)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.updateSettings({ maxHeight: value }, { debounceMs: SETTINGS_DEBOUNCE_MS });
          }),
      );

    new Setting(containerEl)
      .setName("Enable limited writeback")
      .setDesc("Allow editable text blocks to update Notion via API.")
      .addToggle((toggle) =>
        toggle.setValue(settings.allowWriteback).onChange(async (value) => {
          await this.updateSettings({ allowWriteback: value });
        }),
      );

    new Setting(containerEl)
      .setName("Writeback conflict policy")
      .setDesc("Behavior when remote content changed before saving.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("none", "Ignore conflict")
          .addOption("fail_on_conflict", "Fail on conflict")
          .setValue(settings.writebackConflictPolicy)
          .onChange(async (value) => {
            await this.updateSettings({
              writebackConflictPolicy: value as NotionBlockEmbedSettings["writebackConflictPolicy"],
            });
          }),
      );

    new Setting(containerEl)
      .setName("Debug logs")
      .setDesc("Print debug logs to developer console.")
      .addToggle((toggle) =>
        toggle.setValue(settings.debugLogs).onChange(async (value) => {
          await this.updateSettings({ debugLogs: value });
        }),
      );

    new Setting(containerEl)
      .setName("Refresh policy")
      .setDesc("Manual refresh only, or periodic background refresh.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", "Manual")
          .addOption("interval", "Interval")
          .setValue(settings.refreshPolicy)
          .onChange(async (value) => {
            await this.updateSettings({ refreshPolicy: value as NotionBlockEmbedSettings["refreshPolicy"] });
          }),
      );

    new Setting(containerEl)
      .setName("Refresh interval (seconds)")
      .setDesc("Used only when refresh policy is set to interval.")
      .addSlider((slider) =>
        slider
          .setLimits(30, 3600, 30)
          .setValue(settings.refreshIntervalSec)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.updateSettings({ refreshIntervalSec: value }, { debounceMs: SETTINGS_DEBOUNCE_MS });
          }),
      );

    new Setting(containerEl)
      .setName("Open Notion in")
      .setDesc("Choose how internal Notion web editing opens inside Obsidian.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("side_panel", "Fixed side panel")
          .addOption("floating_window", "Floating window")
          .addOption("external_browser", "External default browser")
          .setValue(settings.notionOpenMode)
          .onChange(async (value) => {
            await this.updateSettings({ notionOpenMode: value as NotionBlockEmbedSettings["notionOpenMode"] });
          }),
      );

    new Setting(containerEl)
      .setName("Manual refresh")
      .setDesc("Refresh all active notion-embed blocks in current views.")
      .addButton((button) =>
        button.setButtonText("Refresh now").onClick(async () => {
          await this.deps.onManualRefresh();
        }),
      );

    new Setting(containerEl)
      .setName("Clear cache")
      .setDesc("Clear in-memory embed cache.")
      .addButton((button) =>
        button.setButtonText("Clear cache").onClick(() => {
          this.deps.onClearCache();
        }),
      );

    new Setting(containerEl)
      .setName("Clear remembered image sizes")
      .setDesc("Reset all remembered image widths back to default.")
      .addButton((button) =>
        button.setButtonText("Clear image sizes").onClick(async () => {
          await this.deps.onClearImageSizes();
        }),
      );
  }

  private async updateSettings(
    partial: Partial<NotionBlockEmbedSettings>,
    options?: { debounceMs?: number },
  ): Promise<void> {
    const merged = { ...this.deps.getSettings(), ...partial };
    await this.deps.saveSettings(merged, options);
  }
}
