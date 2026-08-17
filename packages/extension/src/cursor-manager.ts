import * as vscode from "vscode";

interface RemoteCursor {
  displayName: string;
  colour: string;
  fileId: string;
  line: number;
  col: number;
}

interface CursorDecoration {
  line: vscode.TextEditorDecorationType;
  label: vscode.TextEditorDecorationType;
}

export class CursorManager {
  private cursors = new Map<string, RemoteCursor>();
  private decorations = new Map<string, CursorDecoration>();
  private decorationKeys = new Map<string, string>();
  private disposables: vscode.Disposable[] = [];

  /**
   * Maps an open document to the shared-workspace-relative file id peers use.
   * Returns null for documents outside the shared folder (or non-file schemes),
   * which must never match a remote cursor.
   */
  private resolvePath: (doc: vscode.TextDocument) => string | null = () => null;

  constructor() {
    // Decorations are per-editor, so they have to be re-applied whenever the
    // set of visible editors changes — otherwise a teammate's cursor vanishes
    // as soon as you open a second editor or switch tabs.
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.render()),
      vscode.window.onDidChangeActiveTextEditor(() => this.render())
    );
  }

  setPathResolver(fn: (doc: vscode.TextDocument) => string | null) {
    this.resolvePath = fn;
  }

  updateCursor(memberId: string, displayName: string, colour: string, fileId: string, line: number, col: number) {
    if (typeof fileId !== "string" || typeof line !== "number" || typeof col !== "number") return;
    this.cursors.set(memberId, {
      displayName: displayName || "Teammate",
      colour: colour || "#888888",
      fileId,
      line,
      col,
    });
    this.render();
  }

  removeCursor(memberId: string) {
    this.cursors.delete(memberId);
    this.disposeDecoration(memberId);
    this.render();
  }

  clearAllCursors() {
    for (const memberId of Array.from(this.cursors.keys())) {
      this.disposeDecoration(memberId);
    }
    this.cursors.clear();
  }

  dispose() {
    this.clearAllCursors();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  private render() {
    const editors = vscode.window.visibleTextEditors;
    if (editors.length === 0) return;

    // Cache the file id per document so N cursors don't re-resolve N times.
    const pathCache = new Map<vscode.TextDocument, string | null>();
    const fileIdOf = (doc: vscode.TextDocument) => {
      if (!pathCache.has(doc)) pathCache.set(doc, this.resolvePath(doc));
      return pathCache.get(doc)!;
    };

    for (const [memberId, cursor] of this.cursors) {
      const deco = this.ensureDecoration(memberId, cursor);
      for (const editor of editors) {
        if (fileIdOf(editor.document) !== cursor.fileId) {
          // Clearing is required: the teammate may have just moved away.
          editor.setDecorations(deco.line, []);
          editor.setDecorations(deco.label, []);
          continue;
        }

        const lineIdx = Math.max(0, Math.min(cursor.line, editor.document.lineCount - 1));
        const lineLength = editor.document.lineAt(lineIdx).text.length;
        const colIdx = Math.max(0, Math.min(cursor.col, lineLength));
        const pos = new vscode.Position(lineIdx, colIdx);

        editor.setDecorations(deco.line, [new vscode.Range(lineIdx, 0, lineIdx, lineLength)]);
        editor.setDecorations(deco.label, [{ range: new vscode.Range(pos, pos) }]);
      }
    }
  }

  /**
   * Decoration types are expensive VS Code resources. Reuse one pair per member
   * and rebuild only when their name or colour actually changes — the previous
   * implementation created (and leaked) two per cursor event.
   */
  private ensureDecoration(memberId: string, cursor: RemoteCursor): CursorDecoration {
    const key = `${cursor.colour}|${cursor.displayName}`;
    if (this.decorationKeys.get(memberId) === key) {
      return this.decorations.get(memberId)!;
    }

    this.disposeDecoration(memberId);

    const deco: CursorDecoration = {
      line: vscode.window.createTextEditorDecorationType({
        backgroundColor: `${cursor.colour}25`,
        isWholeLine: true,
        overviewRulerColor: cursor.colour,
        overviewRulerLane: vscode.OverviewRulerLane.Full,
      }),
      label: vscode.window.createTextEditorDecorationType({
        after: {
          contentText: ` ${cursor.displayName} `,
          backgroundColor: cursor.colour,
          color: "#fff",
          fontWeight: "bold",
          margin: "0 0 0 4px",
        },
      }),
    };

    this.decorations.set(memberId, deco);
    this.decorationKeys.set(memberId, key);
    return deco;
  }

  private disposeDecoration(memberId: string) {
    const deco = this.decorations.get(memberId);
    if (deco) {
      try { deco.line.dispose(); } catch {}
      try { deco.label.dispose(); } catch {}
    }
    this.decorations.delete(memberId);
    this.decorationKeys.delete(memberId);
  }
}
