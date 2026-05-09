import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_FILE = fileURLToPath(import.meta.url);
const TEST_DIR = path.dirname(TEST_FILE);
const SRC_DIR = path.resolve(TEST_DIR, "../src");

function listFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

describe("single-pipeline architecture guard", () => {
  it("registers notion-embed processor exactly once", () => {
    const files = listFiles(SRC_DIR).filter((file) => file.endsWith(".ts"));
    const pattern = 'registerMarkdownCodeBlockProcessor("notion-embed"';
    const count = files
      .map((file) => fs.readFileSync(file, "utf8"))
      .reduce((sum, content) => sum + (content.includes(pattern) ? 1 : 0), 0);
    expect(count).toBe(1);
  });

  it("does not introduce canvas-only branching tokens in source", () => {
    const forbidden = [/\bisCanvas\b/, /\bcanvasMode\b/, /\bcanvasOnly\b/];
    const files = listFiles(SRC_DIR).filter((file) => file.endsWith(".ts"));

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(content).not.toMatch(token);
      }
    }
  });

  it("does not contain a dedicated src/canvas module", () => {
    const canvasDir = path.join(SRC_DIR, "canvas");
    expect(fs.existsSync(canvasDir)).toBe(false);
  });
});
