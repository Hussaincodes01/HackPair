const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const extDir = __dirname;

// Step 1: build shared + server + extension
execSync("npm run build", { cwd: root, stdio: "inherit" });

// Step 2: sanity-check that the build produced everything the runtime needs.
// vsce is run with --no-dependencies, so anything left in node_modules is NOT
// shipped — every runtime asset has to be inside dist/.
const required = ["extension.js", "server.js", "sql-wasm.wasm"];
const missing = required.filter((f) => !fs.existsSync(path.join(extDir, "dist", f)));
if (missing.length) {
  console.error(`Missing build output: ${missing.join(", ")}. Run the build first.`);
  process.exit(1);
}

const executable = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
if (!fs.existsSync(path.join(extDir, "dist", "bin", executable))) {
  console.warn(`Warning: no bundled ${executable}; the extension will download it on first use.`);
}

// Step 3: package with vsce (generates marketplace-compatible manifest)
execSync("npx --yes @vscode/vsce package --no-dependencies", {
  cwd: extDir,
  stdio: "inherit",
});

console.log("Done! Upload the .vsix to the VS Code Marketplace.");
