import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deployRuntimeArtifacts } from "../scripts/deploy-dev.mjs";

const temporaryDirectories: string[] = [];

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "notion-block-embed-deploy-"));
  temporaryDirectories.push(root);
  const sourceDir = path.join(root, "source");
  const targetDir = path.join(root, "target");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(root, "placeholder"), "fixture");
  await writeFile(path.join(sourceDir, "main.js"), "new-main");
  await writeFile(path.join(sourceDir, "manifest.json"), JSON.stringify({ id: "notion-block-embed" }));
  await writeFile(path.join(sourceDir, "styles.css"), "new-styles");
  await writeFile(path.join(targetDir, "main.js"), "old-main");
  await writeFile(path.join(targetDir, "manifest.json"), JSON.stringify({ id: "notion-block-embed" }));
  await writeFile(path.join(targetDir, "styles.css"), "old-styles");
  await writeFile(path.join(targetDir, "data.json"), "secret-and-runtime-state");
  await writeFile(path.join(targetDir, "keep-me.txt"), "unrelated");
  return { sourceDir, targetDir };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("deployRuntimeArtifacts", () => {
  it("copies only runtime artifacts and preserves Vault data", async () => {
    const { sourceDir, targetDir } = await createFixture();

    await deployRuntimeArtifacts({ sourceDir, targetDir });

    await expect(readFile(path.join(targetDir, "main.js"), "utf8")).resolves.toBe("new-main");
    await expect(readFile(path.join(targetDir, "manifest.json"), "utf8")).resolves.toBe(
      JSON.stringify({ id: "notion-block-embed" }),
    );
    await expect(readFile(path.join(targetDir, "styles.css"), "utf8")).resolves.toBe("new-styles");
    await expect(readFile(path.join(targetDir, "data.json"), "utf8")).resolves.toBe("secret-and-runtime-state");
    await expect(readFile(path.join(targetDir, "keep-me.txt"), "utf8")).resolves.toBe("unrelated");
  });

  it("rejects a target directory with the wrong plugin manifest", async () => {
    const { sourceDir, targetDir } = await createFixture();
    await writeFile(path.join(targetDir, "manifest.json"), JSON.stringify({ id: "different-plugin" }));

    await expect(deployRuntimeArtifacts({ sourceDir, targetDir })).rejects.toThrow(
      "Expected manifest id notion-block-embed",
    );
    await expect(readFile(path.join(targetDir, "main.js"), "utf8")).resolves.toBe("old-main");
  });

  it("rejects deploying to the source directory", async () => {
    const { sourceDir } = await createFixture();

    await expect(deployRuntimeArtifacts({ sourceDir, targetDir: sourceDir })).rejects.toThrow(
      "Refusing to deploy to the source directory",
    );
  });
});
