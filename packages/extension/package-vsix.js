const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const extDir = __dirname;

// Step 1: build shared + server + extension
execSync("npm run build", { cwd: root, stdio: "inherit" });

// Step 2: bundle cloudflared into extension node_modules for vsix distribution
const cfSource = path.join(root, "node_modules", "cloudflared");
const cfTarget = path.join(extDir, "node_modules", "cloudflared");
if (fs.existsSync(cfSource) && !fs.existsSync(cfTarget)) {
  fs.cpSync(cfSource, cfTarget, { recursive: true, force: true });
  console.log("cloudflared bundled into extension node_modules");
}

// Step 3: package with vsce (generates marketplace-compatible manifest)
execSync("npx --yes @vscode/vsce package --no-dependencies", {
  cwd: extDir,
  stdio: "inherit",
});

console.log("Done! Upload the .vsix to the VS Code Marketplace.");
