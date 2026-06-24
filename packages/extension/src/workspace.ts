import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const IGNORED_DIRS = [
  "node_modules", ".git", ".svn", ".hg", "dist", "build",
  "__pycache__", ".next", ".nuxt", ".cache", "coverage",
  ".idea", ".vscode", ".DS_Store", "Thumbs.db"
];

const IGNORED_FILES = [
  ".gitignore", ".DS_Store", "Thumbs.db", "package-lock.json",
  "yarn.lock", "pnpm-lock.yaml"
];

export interface FileTreeItem {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeItem[];
}

function safeResolve(folderPath: string, relativePath: string): string | null {
  const resolved = path.resolve(folderPath, relativePath);
  const normalizedRoot = path.resolve(folderPath) + path.sep;
  if (!resolved.startsWith(normalizedRoot)) return null;
  return resolved;
}

export { safeResolve };

export function scanWorkspace(folderPath: string): FileTreeItem[] {
  try {
    return scanDir(folderPath, folderPath);
  } catch {
    return [];
  }
}

function scanDir(dirPath: string, rootPath: string): FileTreeItem[] {
  const items: FileTreeItem[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (IGNORED_DIRS.includes(entry.name)) continue;
      if (IGNORED_FILES.includes(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        const children = scanDir(fullPath, rootPath);
        if (children.length > 0) {
          items.push({
            name: entry.name,
            path: relativePath,
            type: "directory",
            children,
          });
        }
      } else {
        const stat = fs.statSync(fullPath);
        if (stat.size > 1024 * 1024) continue; // Skip files > 1MB
        items.push({
          name: entry.name,
          path: relativePath,
          type: "file",
        });
      }
    }
  } catch {}

  return items;
}

export function readFileContent(folderPath: string, relativePath: string): string {
  try {
    const fullPath = safeResolve(folderPath, relativePath);
    if (!fullPath) return "// File not found";
    const stat = fs.statSync(fullPath);
    if (stat.size > 512 * 1024) return "// File too large to display (>512KB)";
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return "// File not found";
  }
}

export function watchWorkspace(
  folderPath: string,
  callback: (event: string, relativePath: string) => void
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folderPath, "**/*")
  );

  watcher.onDidCreate((uri) => {
    callback("created", path.relative(folderPath, uri.fsPath));
  });

  watcher.onDidDelete((uri) => {
    callback("deleted", path.relative(folderPath, uri.fsPath));
  });

  watcher.onDidChange((uri) => {
    callback("changed", path.relative(folderPath, uri.fsPath));
  });

  return watcher;
}
