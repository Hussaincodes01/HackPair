const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const outDir = path.join(__dirname, "dist");

fs.mkdirSync(outDir, { recursive: true });

// `cloudflared` is bundled rather than left external: the packaged .vsix
// carries no node_modules, so a runtime require() of it always failed and the
// tunnel never started. It is dependency-free pure JS, so it inlines cleanly.
execSync(
  "npx esbuild packages/extension/src/extension.ts --bundle --outfile=packages/extension/dist/extension.js --external:vscode --format=cjs --platform=node --minify",
  { cwd: root, stdio: "inherit" }
);

execSync(
  "npx esbuild packages/server/src/index.ts --bundle --outfile=packages/extension/dist/server.js --platform=node --format=cjs --minify",
  { cwd: root, stdio: "inherit" }
);

const wasmSource = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const wasmTarget = path.join(outDir, "sql-wasm.wasm");
if (fs.existsSync(wasmSource)) {
  fs.copyFileSync(wasmSource, wasmTarget);
}

// Ship the cloudflared executable inside the extension so creating a room does
// not wait on a download. It is platform-specific — a build made on Windows can
// only bundle the Windows binary — so tunnel.ts falls back to downloading into
// global storage when the bundled one is missing or is for another platform.
const executable = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
const binSource = path.join(root, "node_modules", "cloudflared", "bin", executable);
const binDir = path.join(outDir, "bin");
if (fs.existsSync(binSource)) {
  fs.mkdirSync(binDir, { recursive: true });
  const binTarget = path.join(binDir, executable);
  fs.copyFileSync(binSource, binTarget);
  if (process.platform !== "win32") fs.chmodSync(binTarget, 0o755);
  const mb = (fs.statSync(binTarget).size / 1024 / 1024).toFixed(1);
  console.log(`  bundled ${executable} (${mb} MB)`);
} else {
  console.warn(
    `  cloudflared binary not found at ${binSource} — the .vsix will download it on first use`
  );
}
