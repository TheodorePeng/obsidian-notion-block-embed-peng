import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;
  return `${major}.${minor}.${patch}`;
}

async function updateVersion(filePath, nextVersion) {
  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw);
  json.version = nextVersion;
  await fs.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

async function main() {
  const root = process.cwd();
  const packagePath = path.join(root, "package.json");
  const manifestPath = path.join(root, "manifest.json");

  const pkgRaw = await fs.readFile(packagePath, "utf8");
  const pkg = JSON.parse(pkgRaw);
  const current = String(pkg.version ?? "");
  const next = bumpPatch(current);

  await updateVersion(packagePath, next);
  await updateVersion(manifestPath, next);
  // eslint-disable-next-line no-console
  console.log(`Bumped version: ${current} -> ${next}`);
}

await main();
