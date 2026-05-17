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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function updatePackageLock(nextVersion) {
  const lockPath = path.join(process.cwd(), "package-lock.json");
  const lock = await readJson(lockPath);
  lock.version = nextVersion;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = nextVersion;
  }
  await writeJson(lockPath, lock);
}

async function updateVersionsJson(minAppVersion, nextVersion) {
  const versionsPath = path.join(process.cwd(), "versions.json");
  let versions;
  try {
    versions = await readJson(versionsPath);
  } catch {
    versions = {};
  }
  versions[nextVersion] = minAppVersion;
  await writeJson(versionsPath, versions);
}

async function main() {
  const root = process.cwd();
  const packagePath = path.join(root, "package.json");
  const manifestPath = path.join(root, "manifest.json");

  const pkg = await readJson(packagePath);
  const manifest = await readJson(manifestPath);
  const current = String(pkg.version ?? "");
  const next = bumpPatch(current);

  pkg.version = next;
  manifest.version = next;

  await writeJson(packagePath, pkg);
  await writeJson(manifestPath, manifest);
  await updatePackageLock(next);
  await updateVersionsJson(manifest.minAppVersion, next);

  // eslint-disable-next-line no-console
  console.log(`Bumped version: ${current} -> ${next}`);
  // eslint-disable-next-line no-console
  console.log(`Updated files: package.json, manifest.json, package-lock.json, versions.json`);
}

await main();
