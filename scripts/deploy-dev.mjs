import { access, copyFile, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
export const PLUGIN_ID = "notion-block-embed";

async function readManifest(directory) {
  const manifestPath = path.join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(`Expected manifest id ${PLUGIN_ID}, received ${String(manifest.id)}`);
  }
  return manifest;
}

export async function deployRuntimeArtifacts({ sourceDir, targetDir }) {
  const sourceRoot = await realpath(sourceDir);
  const targetRoot = await realpath(targetDir);

  if (sourceRoot === targetRoot) {
    throw new Error("Refusing to deploy to the source directory.");
  }

  await readManifest(sourceRoot);
  await readManifest(targetRoot);
  await Promise.all(RUNTIME_ARTIFACTS.map((artifact) => access(path.join(sourceRoot, artifact))));

  for (const artifact of RUNTIME_ARTIFACTS) {
    await copyFile(path.join(sourceRoot, artifact), path.join(targetRoot, artifact));
  }

  return {
    sourceDir: sourceRoot,
    targetDir: targetRoot,
    artifacts: [...RUNTIME_ARTIFACTS],
  };
}

async function main() {
  const targetDir = process.env.OBSIDIAN_NOTION_EMBED_PLUGIN_DIR;
  if (!targetDir) {
    throw new Error("Set OBSIDIAN_NOTION_EMBED_PLUGIN_DIR before deploying.");
  }

  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const result = await deployRuntimeArtifacts({
    sourceDir: path.resolve(sourceDir, ".."),
    targetDir,
  });
  console.log(`Deployed ${result.artifacts.join(", ")} to ${result.targetDir}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
