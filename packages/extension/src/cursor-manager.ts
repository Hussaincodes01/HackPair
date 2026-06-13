import * as vscode from "vscode";

export class CursorManager {
  private cursors: Map<string, { decorationType: vscode.TextEditorDecorationType; labelType: vscode.TextEditorDecorationType }> = new Map();

  updateCursor(memberId: string, displayName: string, colour: string, fileId: string, line: number, col: number) {
    // Remove old decorations for this member
    this.removeCursor(memberId);

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const relPath = vscode.workspace.asRelativePath(editor.document.fileName);
    if (relPath !== fileId) return;

    const lineIdx = Math.max(0, Math.min(line, editor.document.lineCount - 1));

    // Line highlight
    const decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: `${colour}25`,
      isWholeLine: true,
      overviewRulerColor: colour,
      overviewRulerLane: vscode.OverviewRulerLane.Full,
    });

    // Cursor label
    const labelType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ${displayName} `,
        backgroundColor: colour,
        color: "#fff",
        fontWeight: "bold",
        fontSize: "10px",
        margin: "0 0 0 4px",
      },
    });

    const lineRange = new vscode.Range(lineIdx, 0, lineIdx, Number.MAX_SAFE_INTEGER);
    editor.setDecorations(decorationType, [lineRange]);

    const pos = new vscode.Position(lineIdx, Math.max(0, col));
    editor.setDecorations(labelType, [{ range: new vscode.Range(pos, pos) }]);

    this.cursors.set(memberId, { decorationType, labelType });
  }

  removeCursor(memberId: string) {
    const cursor = this.cursors.get(memberId);
    if (cursor) {
      try { cursor.decorationType.dispose(); } catch {}
      try { cursor.labelType.dispose(); } catch {}
      this.cursors.delete(memberId);
    }
  }

  clearAllCursors() {
    this.cursors.forEach((c) => {
      try { c.decorationType.dispose(); } catch {}
      try { c.labelType.dispose(); } catch {}
    });
    this.cursors.clear();
  }

  dispose() {
    this.clearAllCursors();
  }
}
