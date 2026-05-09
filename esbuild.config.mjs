import esbuild from "esbuild";
import process from "node:process";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  target: "es2021",
  platform: "node",
  external: ["obsidian", "electron"],
  sourcemap: false,
  logLevel: "info"
});

if (watch) {
  await ctx.watch();
  // eslint-disable-next-line no-console
  console.log("[notion-block-embed] watching...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
