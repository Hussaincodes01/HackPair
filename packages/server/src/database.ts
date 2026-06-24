import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.HACKSYNC_DATA_DIR 
  ? path.resolve(process.env.HACKSYNC_DATA_DIR)
  : path.resolve(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "hacksync.db");

let db: SqlJsDatabase;

function saveDatabase() {
  if (!db) return;
  try {
    const tempPath = DB_PATH + ".tmp";
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.error("Failed to save database:", err);
  }
}

export async function createDatabase(): Promise<SqlJsDatabase> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(name) <= 100),
      invite_code TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      display_name TEXT NOT NULL CHECK(length(display_name) <= 50),
      colour TEXT NOT NULL,
      token TEXT NOT NULL DEFAULT '',
      joined_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  try { db.run("ALTER TABLE members ADD COLUMN token TEXT NOT NULL DEFAULT ''"); } catch { /* column may already exist */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('file_created', 'file_modified', 'file_deleted')),
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_reports (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      agent_type TEXT NOT NULL CHECK(agent_type IN ('structure', 'progress')),
      output_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS progress (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      percentage INTEGER NOT NULL DEFAULT 0 CHECK(percentage >= 0 AND percentage <= 100),
      tasks_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_members_room ON members(room_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_room ON events(room_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_agent_reports_room ON agent_reports(room_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_progress_room ON progress(room_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_rooms_invite ON rooms(invite_code)");

  saveDatabase();
  console.log("Database initialized");

  return db;
}

function parseRows(result: any): any[] {
  if (result.length === 0 || result[0].values.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map((vals: any[]) => {
    const row: any = {};
    cols.forEach((c: string, i: number) => (row[c] = vals[i]));
    return row;
  });
}

function parseRow(result: any): any | null {
  if (result.length === 0 || result[0].values.length === 0) return null;
  const cols = result[0].columns;
  const vals = result[0].values[0];
  const row: any = {};
  cols.forEach((c: string, i: number) => (row[c] = vals[i]));
  return row;
}

export const stmts = {
  insertRoom(id: string, name: string, inviteCode: string, expiresAt: string) {
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO rooms (id, name, invite_code, created_at, last_active_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, name, inviteCode, now, now, expiresAt]
    );
    saveDatabase();
  },

  getRoom(id: string): any {
    return parseRow(db.exec(
      "SELECT * FROM rooms WHERE id = ? AND expires_at > ?",
      [id, new Date().toISOString()]
    ));
  },

  getRoomByInviteCode(code: string): any {
    return parseRow(db.exec(
      "SELECT * FROM rooms WHERE invite_code = ? AND expires_at > ?",
      [code, new Date().toISOString()]
    ));
  },

  updateRoomActivity(id: string) {
    db.run("UPDATE rooms SET last_active_at = ? WHERE id = ?", [
      new Date().toISOString(),
      id,
    ]);
  },

  deleteExpiredRooms() {
    db.run("DELETE FROM rooms WHERE expires_at < ?", [new Date().toISOString()]);
    saveDatabase();
  },

  listRooms(): any[] {
    const result = db.exec(
      "SELECT id, name, invite_code, created_at FROM rooms WHERE expires_at > ? ORDER BY created_at DESC",
      [new Date().toISOString()]
    );
    const rooms = parseRows(result);
    return rooms.map((row: any) => {
      const countResult = db.exec(
        "SELECT COUNT(*) as cnt FROM members WHERE room_id = ?",
        [row.id]
      );
      row.member_count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
      return row;
    });
  },

  insertMember(id: string, roomId: string, displayName: string, colour: string, token: string) {
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO members (id, room_id, display_name, colour, token, joined_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, roomId, displayName, colour, token, now, now]
    );
    saveDatabase();
  },

  getMember(id: string): any {
    return parseRow(db.exec("SELECT * FROM members WHERE id = ?", [id]));
  },

  getRoomMembers(roomId: string): any[] {
    return parseRows(
      db.exec("SELECT * FROM members WHERE room_id = ? ORDER BY joined_at", [roomId])
    );
  },

  removeMember(id: string) {
    db.run("DELETE FROM members WHERE id = ?", [id]);
    saveDatabase();
  },

  insertEvent(id: string, roomId: string, memberId: string, type: string, filePath: string) {
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO events (id, room_id, member_id, type, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, roomId, memberId, type, filePath, now]
    );
    saveDatabase();
  },

  getRoomEvents(roomId: string, limit: number = 20, offset: number = 0): any[] {
    return parseRows(
      db.exec(
        "SELECT e.*, m.display_name as member_name FROM events e LEFT JOIN members m ON e.member_id = m.id WHERE e.room_id = ? ORDER BY e.created_at DESC LIMIT ? OFFSET ?",
        [roomId, limit, offset]
      )
    );
  },

  countRoomEvents(roomId: string): number {
    const result = db.exec("SELECT COUNT(*) as cnt FROM events WHERE room_id = ?", [roomId]);
    if (result.length === 0) return 0;
    return result[0].values[0][0] as number;
  },

  insertAgentReport(id: string, roomId: string, agentType: string, outputText: string) {
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO agent_reports (id, room_id, agent_type, output_text, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, roomId, agentType, outputText, now]
    );
    saveDatabase();
  },

  getRoomAgentReports(roomId: string, limit: number = 10): any[] {
    return parseRows(
      db.exec(
        "SELECT * FROM agent_reports WHERE room_id = ? ORDER BY created_at DESC LIMIT ?",
        [roomId, limit]
      )
    );
  },

  // Atomic upsert using INSERT OR REPLACE
  upsertProgress(id: string, roomId: string, memberId: string, percentage: number, tasksJson: string) {
    const now = new Date().toISOString();
    db.run(
      "INSERT OR REPLACE INTO progress (id, room_id, member_id, percentage, tasks_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, roomId, memberId, percentage, tasksJson, now]
    );
    saveDatabase();
  },

  getRoomProgress(roomId: string): any[] {
    return parseRows(
      db.exec(
        "SELECT p.*, m.display_name FROM progress p LEFT JOIN members m ON p.member_id = m.id WHERE p.room_id = ?",
        [roomId]
      )
    );
  },
};
