import esbuild from "esbuild";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deployRuntimeArtifacts } from "./scripts/deploy-dev.mjs";

const watch = process.argv.includes("--watch");
const deploy = process.argv.includes("--deploy");
const deployTarget = process.env.OBSIDIAN_NOTION_EMBED_PLUGIN_DIR;
const sourceDir = fileURLToPath(new URL(".", import.meta.url));

if (deploy && !deployTarget) {
  throw new Error("Set OBSIDIAN_NOTION_EMBED_PLUGIN_DIR before using --deploy.");
}

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  target: "es2021",
  platform: "node",
  external: ["obsidian", "electron"],
  sourcemap: false,
  logLevel: "info",
  plugins: deploy
    ? [
        {
          name: "deploy-to-obsidian-vault",
          setup(build) {
            build.onEnd(async (result) => {
              if (result.errors.length > 0) return;
              try {
                const deployment = await deployRuntimeArtifacts({
                  sourceDir,
                  targetDir: deployTarget,
                });
                console.log(`[notion-block-embed] deployed to ${deployment.targetDir}`);
              } catch (error) {
                return {
                  errors: [
                    {
                      text: error instanceof Error ? error.message : String(error),
                    },
                  ],
                };
              }
            });
          },
        },
      ]
    : [],
});

if (watch) {
  await ctx.watch();
  // eslint-disable-next-line no-console
  console.log("[notion-block-embed] watching...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
