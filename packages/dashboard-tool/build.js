const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "../..");

console.log("Building hackpair-server...");

// Bundle server + dashboard into single file
execSync(
  `npx esbuild packages/dashboard-tool/src/index.ts --bundle --outfile=packages/dashboard-tool/dist/index.js --platform=node --format=cjs --minify`,
  { cwd: root, stdio: "inherit" }
);

console.log("");
console.log("Done! Usage:");
console.log("  npx hackpair-server              # Start on port 3001");
console.log("  PORT=4000 npx hackpair-server    # Custom port");
console.log("  Open http://localhost:3001 for dashboard");
console.log("");
