import * as esbuild                                              from "esbuild";
import { copyFileSync, mkdirSync, watch as fsWatch, cpSync, existsSync } from "fs";

const watch = process.argv.includes("--watch");

const STATIC_FILES = ["index.html", "style.css"];

function copyStatic() {
  for (const file of STATIC_FILES) {
    copyFileSync(file, `dist/${file}`);
  }
  if (existsSync("public")) {
    cpSync("public", "dist", { recursive: true });
  }
}

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "esm",
  target: "es2020",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
});

mkdirSync("dist", { recursive: true });
copyStatic();

if (watch) {
  // Re-copy static files whenever they change
  for (const file of STATIC_FILES) {
    fsWatch(file, () => {
      copyFileSync(file, `dist/${file}`);
      console.log(`Copied ${file}`);
    });
  }
  if (existsSync("public")) {
    fsWatch("public", { recursive: true }, () => {
      cpSync("public", "dist", { recursive: true });
      console.log("Copied public/");
    });
  }

  await ctx.watch();
  const { host, port } = await ctx.serve({ servedir: "dist", port: 3000 });
  console.log(`Dev server → http://${host}:${port}`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Build complete → dist/");
}
