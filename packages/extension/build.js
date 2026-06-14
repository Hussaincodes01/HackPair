const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const outDir = path.join(__dirname, "dist");

fs.mkdirSync(outDir, { recursive: true });

execSync(
  "npx esbuild packages/extension/src/extension.ts --bundle --outfile=packages/extension/dist/extension.js --external:vscode --external:cloudflared --format=cjs --platform=node --minify",
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
