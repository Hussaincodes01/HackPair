const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "../..");
const dist = path.join(__dirname, "dist");

console.log("Building hackpair-server...");
fs.mkdirSync(path.join(dist, "public"), { recursive: true });

// Bundle server + dashboard into single file.
// `cloudflared` resolves its binary path relative to its own package location
// and spawns a child process, so it must stay external (not bundled).
execSync(
  `npx esbuild packages/dashboard-tool/src/index.ts --bundle --outfile=packages/dashboard-tool/dist/index.js --platform=node --format=cjs --minify --external:cloudflared`,
  { cwd: root, stdio: "inherit" }
);

fs.copyFileSync(
  path.join(__dirname, "public", "dashboard.html"),
  path.join(dist, "public", "dashboard.html")
);

// sql.js loads its wasm relative to the bundled script, so ship it alongside.
const wasmSource = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
if (fs.existsSync(wasmSource)) {
  fs.copyFileSync(wasmSource, path.join(dist, "sql-wasm.wasm"));
}

console.log("");
console.log("Done! Usage:");
console.log("  npx hackpair-server              # Start on port 3001");
console.log("  PORT=4000 npx hackpair-server    # Custom port");
console.log("  Open http://localhost:3001 for dashboard");
console.log("");
