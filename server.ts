import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import bcrypt from "bcryptjs";
import multer from "multer";
import { simpleGit, SimpleGit } from "simple-git";

// configuration tweaks for temporary behavior
// set this to true when you want to turn off the news endpoint
const NEWS_DISABLED = false;

const EXA_API_KEY = process.env.EXA_API_KEY;
console.log("EXA_API_KEY present:", !!EXA_API_KEY);

async function searchExa(query: string) {
  if (!EXA_API_KEY) {
    console.warn("EXA_API_KEY not found, falling back to basic prompt.");
    return null;
  }

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': EXA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        category: "news",
        type: "auto",
        num_results: 5,
        contents: {
          highlights: {
            max_characters: 1000
          }
        }
      })
    });
    if (!response.ok) {
      console.error("Exa API error:", response.status, response.statusText);
      return null;
    }

    const data: any = await response.json();
    console.log("Exa API response:", JSON.stringify(data, null, 2));
    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      highlight: r.highlights?.[0] || ""
    }));
  } catch (error) {
    console.error("Error calling Exa:", error);
    return null;
  }
}
// default maximum tokens to generate for any request; can also be overridden via env
const DEFAULT_MAX_TOKENS = parseInt(process.env.MAX_TOKENS_LIMIT || '1024', 10);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3.5';

async function callOllama(prompt: string, stream: boolean, onChunk?: (chunk: string) => void, num_predict?: number) {
  const options: any = {};
  if (num_predict && num_predict > 0) {
    options.num_predict = num_predict;
  } else {
    options.num_predict = DEFAULT_MAX_TOKENS;
  }

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: stream,
      options,
      keep_alive: -1
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  if (stream) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.response) {
                onChunk?.(json.response);
              }
              if (json.done) return;
            } catch (e) {
              console.error('Error parsing Ollama chunk:', e);
            }
          }
        }

        if (done) {
          if (buffer.trim()) {
            try {
              const json = JSON.parse(buffer);
              if (json.response) onChunk?.(json.response);
            } catch (e) {
              // ignore partial
            }
          }
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const json: any = await response.json();
    return json.response;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = new Database("nexus.db");

// Function to ensure database connection is valid and writable
function ensureDbConnection() {
  try {
    // Test if database is writable
    db.exec("PRAGMA query_only=false");
    return true;
  } catch (error: any) {
    if (error.code === 'SQLITE_READONLY' || error.code === 'SQLITE_READONLY_DBMOVED') {
      console.log("[Database] Attempting to reconnect to database...");
      try {
        db.close();
      } catch (e) {
        // Ignore close errors
      }
      // Reconnect
      db = new Database("nexus.db");
      return true;
    }
    throw error;
  }
}

// Initialize Database - Create all tables first
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    number TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    is_setup INTEGER DEFAULT 0,
    is_board INTEGER DEFAULT 0,
    scopes TEXT, -- JSON array
    FOREIGN KEY(team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    assigned_to INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo', -- 'todo', 'in-progress', 'done'
    due_date TEXT,
    is_board INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(assigned_to) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    date TEXT NOT NULL,
    status TEXT NOT NULL, -- 'P', 'A', 'L', 'E', 'U', 'S'
    reason TEXT,
    is_excused INTEGER DEFAULT 0,
    FOREIGN KEY(member_id) REFERENCES members(id),
    UNIQUE(member_id, date)
  );

  CREATE TABLE IF NOT EXISTS hidden_dates (
    date TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    type TEXT NOT NULL, -- 'mention', 'task', 'system'
    is_read INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(sender_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS documentation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'meeting', 'funding', 'milestone'
    title TEXT NOT NULL,
    content TEXT,
    images TEXT, -- JSON array of base64 or URLs
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    type TEXT NOT NULL, -- 'income', 'expense'
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    date TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    hours INTEGER,
    location TEXT
  );

  CREATE TABLE IF NOT EXISTS communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT DEFAULT 'email' -- 'email', 'announcement'
  );

  CREATE TABLE IF NOT EXISTS code_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT DEFAULT 'java',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(created_by) REFERENCES members(id),
    UNIQUE(team_id, file_path)
  );

  CREATE TABLE IF NOT EXISTS code_commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    file_id INTEGER,
    branch TEXT DEFAULT 'main',
    author_id INTEGER,
    message TEXT NOT NULL,
    content TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(file_id) REFERENCES code_files(id),
    FOREIGN KEY(author_id) REFERENCES members(id)
  );
`);


// Migrations - Handle structural updates for existing databases
const memberColumns = db.prepare("PRAGMA table_info(members)").all();
if (!memberColumns.some((c: any) => c.name === 'password')) {
  db.exec("ALTER TABLE members ADD COLUMN password TEXT");
}
if (!memberColumns.some((c: any) => c.name === 'is_setup')) {
  db.exec("ALTER TABLE members ADD COLUMN is_setup INTEGER DEFAULT 0");
}

const taskColumns = db.prepare("PRAGMA table_info(tasks)").all();
if (!taskColumns.some((c: any) => c.name === 'is_board')) {
  db.exec("ALTER TABLE tasks ADD COLUMN is_board INTEGER DEFAULT 0");
}

const teamColumns = db.prepare("PRAGMA table_info(teams)").all();
if (!teamColumns.some((c: any) => c.name === 'accent_color')) {
  db.exec("ALTER TABLE teams ADD COLUMN accent_color TEXT");
}
if (!teamColumns.some((c: any) => c.name === 'primary_color')) {
  db.exec("ALTER TABLE teams ADD COLUMN primary_color TEXT");
}
if (!teamColumns.some((c: any) => c.name === 'text_color')) {
  db.exec("ALTER TABLE teams ADD COLUMN text_color TEXT");
}

if (!memberColumns.some((c: any) => c.name === 'accent_color')) {
  db.exec("ALTER TABLE members ADD COLUMN accent_color TEXT");
}
if (!memberColumns.some((c: any) => c.name === 'primary_color')) {
  db.exec("ALTER TABLE members ADD COLUMN primary_color TEXT");
}
if (!memberColumns.some((c: any) => c.name === 'text_color')) {
  db.exec("ALTER TABLE members ADD COLUMN text_color TEXT");
}

// Messages table migrations
const messageColumns = db.prepare("PRAGMA table_info(messages)").all();
if (!messageColumns.some((c: any) => c.name === 'deleted_at')) {
  db.exec("ALTER TABLE messages ADD COLUMN deleted_at TEXT");
}
if (!messageColumns.some((c: any) => c.name === 'file_path')) {
  db.exec("ALTER TABLE messages ADD COLUMN file_path TEXT");
}

// Verify columns exist
const finalMemberColumns = db.prepare("PRAGMA table_info(members)").all();
console.log("[DB Migration] Members table columns:", finalMemberColumns.map((c: any) => c.name).join(", "));

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date)");

// Initial data
db.exec(`
  INSERT OR IGNORE INTO settings (key, value) VALUES ('excuse_criteria', 'Excused if for school, family emergency, or illness. Unexcused for gaming, hanging out, or forgetting.');
`);

function getNumericSetting(key: string, defaultValue: number): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  if (row && row.value) {
    const val = parseInt(row.value, 10);
    return isNaN(val) ? defaultValue : val;
  }
  return defaultValue;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());
  
  // Configure multer for file uploads
  const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
  
  const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });
  
  app.use('/uploads', express.static(uploadDir));
  
  const PORT = 3000;

  // --- WebSocket Logic ---
  const clients = new Set<WebSocket>();

  const broadcast = (data: any) => {
    const payload = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  };

  const createNotification = (userId: number, content: string, type: string) => {
    const timestamp = new Date().toISOString();
    const info = db.prepare("INSERT INTO notifications (user_id, content, type, timestamp) VALUES (?, ?, ?, ?)")
      .run(userId, content, type, timestamp);

    broadcast({
      type: 'notification',
      notification: {
        id: info.lastInsertRowid,
        user_id: userId,
        content,
        type,
        timestamp,
        is_read: 0
      }
    });
  };

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "chat") {
          const stmt = db.prepare("INSERT INTO messages (sender_id, content, timestamp) VALUES (?, ?, ?)");
          const timestamp = new Date().toISOString();
          const info = stmt.run(message.sender_id, message.content, timestamp);

          // Handle mentions
          const mentions = message.content.match(/@\[([^\]]+)\]/g);
          if (mentions) {
            mentions.forEach((m: string) => {
              const name = m.slice(2, -1);
              const user = db.prepare("SELECT id FROM members WHERE name = ?").get(name) as any;
              if (user) {
                createNotification(user.id, `You were mentioned by ${message.sender_name}: "${message.content}"`, 'mention');
              }
            });
          }

          broadcast({
            type: "chat",
            id: info.lastInsertRowid,
            sender_id: message.sender_id,
            sender_name: message.sender_name,
            content: message.content,
            timestamp
          });
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    });
  });

  // --- Auth Routes ---
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM members WHERE email = ?").get(email) as any;

    if (!user) return res.status(401).json({ error: "User not found" });

    if (!user.password) {
      return res.json({ needsSetup: true, user });
    }

    if (bcrypt.compareSync(password, user.password)) {
      res.json({ user });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  app.post("/api/auth/setup", (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE members SET password = ?, is_setup = 1 WHERE email = ?").run(hashedPassword, email);
    const user = db.prepare("SELECT * FROM members WHERE email = ?").get(email);
    res.json({ user });
  });

  app.post("/api/auth/reset", (req, res) => {
    const { email } = req.body;
    db.prepare("UPDATE members SET password = NULL, is_setup = 0 WHERE email = ?").run(email);
    res.json({ success: true });
  });

  // --- API Routes ---

  // Teams
  app.get("/api/teams", (req, res) => {
    const teams = db.prepare("SELECT * FROM teams").all();
    res.json(teams);
  });

  app.post("/api/teams", (req, res) => {
    const { name, number, accent_color, primary_color, text_color } = req.body;
    const info = db.prepare("INSERT INTO teams (name, number, accent_color, primary_color, text_color) VALUES (?, ?, ?, ?, ?)")
      .run(name, number, accent_color || null, primary_color || null, text_color || null);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/teams/:id", (req, res) => {
    const { name, number, accent_color, primary_color, text_color } = req.body;
    db.prepare("UPDATE teams SET name = ?, number = ?, accent_color = ?, primary_color = ?, text_color = ? WHERE id = ?")
      .run(name, number, accent_color || null, primary_color || null, text_color || null, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/teams/:id", (req, res) => {
    db.prepare("DELETE FROM teams WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Members
  app.get("/api/members", (req, res) => {
    const members = db.prepare(`
      SELECT m.*, t.name as team_name 
      FROM members m 
      LEFT JOIN teams t ON m.team_id = t.id
    `).all();
    console.log("[GET /api/members] Sample member data:", JSON.stringify(members[0] || {}, null, 2));
    res.json(members);
  });

  app.post("/api/members", (req, res) => {
    const { team_id, name, role, email, is_board, scopes, accent_color, primary_color, text_color } = req.body;
    const finalScopes = typeof scopes === 'string' ? scopes : JSON.stringify(scopes || []);
    const info = db.prepare("INSERT INTO members (team_id, name, role, email, is_board, scopes, accent_color, primary_color, text_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(team_id, name, role, email, is_board ? 1 : 0, finalScopes, accent_color || null, primary_color || null, text_color || null);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/members/:id", (req, res) => {
    const { team_id, name, role, email, is_board, scopes, accent_color, primary_color, text_color } = req.body;
    console.log(`[PATCH /api/members] ID: ${req.params.id}`);
    console.log(`[PATCH /api/members] Received colors:`, { accent_color, primary_color, text_color });
    const finalScopes = typeof scopes === 'string' ? scopes : JSON.stringify(scopes || []);

    // Only update color fields if they're explicitly provided (not undefined)
    const updates: any = {
      team_id, name, role, email,
      is_board: is_board ? 1 : 0,
      scopes: finalScopes
    };

    if (accent_color !== undefined) updates.accent_color = accent_color;
    if (primary_color !== undefined) updates.primary_color = primary_color;
    if (text_color !== undefined) updates.text_color = text_color;

    const columns = Object.keys(updates);
    const placeholders = columns.map(() => '?').join(', ');
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    db.prepare(`UPDATE members SET ${setClause} WHERE id = ?`)
      .run(...Object.values(updates), parseInt(req.params.id, 10));

    // Verify what was saved
    const updated = db.prepare("SELECT accent_color, primary_color, text_color FROM members WHERE id = ?").get(parseInt(req.params.id, 10)) as any;
    console.log(`[PATCH /api/members] Verified saved colors:`, updated);

    res.json({ success: true });
  });

  app.delete("/api/members/:id", (req, res) => {
    db.prepare("DELETE FROM members WHERE id = ?").run(parseInt(req.params.id, 10));
    res.json({ success: true });
  });

  // Attendance
  app.get("/api/attendance", (req, res) => {
    try {
      const { date } = req.query;
      let query = "SELECT * FROM attendance";
      let params: any[] = [];
      if (date) {
        query += " WHERE date = ?";
        params.push(date);
      }
      const records = db.prepare(query).all(...params);
      res.json(records);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/attendance/batch", (req, res) => {
    try {
      const { date, records } = req.body;
      if (!date || !Array.isArray(records)) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      console.log(`[Attendance] Updating ${records.length} records for ${date}`);
      
      // Ensure database connection is valid and writable
      ensureDbConnection();

      const insert = db.prepare(`
        INSERT INTO attendance (member_id, date, status, reason) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(member_id, date) DO UPDATE SET
          status = excluded.status,
          reason = COALESCE(excluded.reason, attendance.reason)
      `);
      const deleteStmt = db.prepare("DELETE FROM attendance WHERE member_id = ? AND date = ?");

      const transaction = db.transaction((data) => {
        for (const rec of data) {
          if (rec.status === null || rec.status === '-') {
            deleteStmt.run(rec.member_id, date);
          } else {
            insert.run(rec.member_id, date, rec.status, rec.reason || null);
          }
        }
      });

      transaction(records);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in attendance batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/attendance/summary", (req, res) => {
    try {
      const summary = db.prepare(`
        SELECT 
          m.id as member_id, 
          m.name,
          COUNT(CASE WHEN a.status = 'P' THEN 1 END) as present,
          COUNT(CASE WHEN a.status = 'A' THEN 1 END) as absent,
          COUNT(CASE WHEN a.status = 'L' THEN 1 END) as late,
          COUNT(CASE WHEN a.status = 'E' THEN 1 END) as excused,
          COUNT(a.id) as total
        FROM members m
        LEFT JOIN attendance a ON m.id = a.member_id
        GROUP BY m.id
      `).all();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching attendance summary:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/attendance/sessions", (req, res) => {
    try {
      const sessions = db.prepare(`
        SELECT DISTINCT date 
        FROM attendance 
        ORDER BY date DESC
      `).all();
      res.json(sessions.map((s: any) => s.date));
    } catch (error) {
      console.error("Error fetching attendance sessions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/hidden-dates", (req, res) => {
    try {
      const dates = db.prepare("SELECT date FROM hidden_dates").all();
      res.json(dates.map((d: any) => d.date));
    } catch (error) {
      console.error("Error fetching hidden dates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/hidden-dates", (req, res) => {
    const { date } = req.body;
    db.prepare("INSERT OR IGNORE INTO hidden_dates (date) VALUES (?)").run(date);
    res.json({ success: true });
  });

  app.delete("/api/hidden-dates/:date", (req, res) => {
    db.prepare("DELETE FROM hidden_dates WHERE date = ?").run(req.params.date);
    res.json({ success: true });
  });

  // Messages
  app.get("/api/messages", (req, res) => {
    const msgs = db.prepare(`
      SELECT m.*, mem.name as sender_name 
      FROM messages m 
      JOIN members mem ON m.sender_id = mem.id 
      ORDER BY timestamp ASC LIMIT 100
    `).all();
    res.json(msgs);
  });

  // File upload for messages
  app.post("/api/messages/upload", upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const { sender_id, sender_name, content } = req.body;
    const timestamp = new Date().toISOString();
    const filePath = `/uploads/${req.file.filename}`;
    
    const info = db.prepare(
      "INSERT INTO messages (sender_id, content, timestamp, file_path) VALUES (?, ?, ?, ?)"
    ).run(sender_id, content || '', timestamp, filePath);
    
    broadcast({
      type: "chat",
      id: info.lastInsertRowid,
      sender_id: parseInt(sender_id),
      sender_name,
      content: content || '',
      file_path: filePath,
      timestamp
    });
    
    res.json({ 
      id: info.lastInsertRowid, 
      file_path: filePath,
      sender_id: parseInt(sender_id),
      sender_name,
      content: content || '',
      timestamp
    });
  });

  // Delete message
  app.delete("/api/messages/:id", (req, res) => {
    const messageId = req.params.id;
    const deletedAt = new Date().toISOString();
    
    db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?")
      .run(deletedAt, messageId);
    
    broadcast({
      type: "message_deleted",
      id: parseInt(messageId),
      deleted_at: deletedAt
    });
    
    res.json({ success: true });
  });

  // Notifications
  app.get("/api/notifications/:userId", (req, res) => {
    const notes = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50")
      .all(req.params.userId);
    res.json(notes);
  });

  app.post("/api/notifications/read", (req, res) => {
    const { ids } = req.body;
    const stmt = db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?");
    const transaction = db.transaction((data) => {
      for (const id of data) stmt.run(id);
    });
    transaction(ids);
    res.json({ success: true });
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM settings").all();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/settings", (req, res) => {
    try {
      const { key, value } = req.body;
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Tasks
  app.get("/api/tasks", (req, res) => {
    try {
      const tasks = db.prepare("SELECT * FROM tasks").all();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks", (req, res) => {
    try {
      const { team_id, title, description, status, assigned_to, due_date, is_board } = req.body;
      const createdAt = new Date().toISOString();
      const info = db.prepare("INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, is_board, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(team_id, title, description, status || 'todo', assigned_to, due_date, is_board || 0, createdAt);

      if (assigned_to) {
        createNotification(assigned_to, `New task assigned: ${title}`, 'task');
      }

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/tasks/:id", (req, res) => {
    try {
      const { status } = req.body;
      const completedAt = status === 'done' ? new Date().toISOString() : null;

      if (status === 'done') {
        db.prepare("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?").run(status, completedAt, req.params.id);
      } else {
        db.prepare("UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?").run(status, req.params.id);
      }

      const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) as any;
      if (task && task.assigned_to) {
        createNotification(task.assigned_to, `Task status updated to ${status}: ${task.title}`, 'task');
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Budget
  app.get("/api/budget", (req, res) => {
    try {
      const budget = db.prepare("SELECT * FROM budget").all();
      res.json(budget);
    } catch (error) {
      console.error("Error fetching budget:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/budget", (req, res) => {
    try {
      const { team_id, type, amount, category, description, date } = req.body;
      const info = db.prepare("INSERT INTO budget (team_id, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?)")
        .run(team_id, type, amount, category, description, date);

      // Notify board members of budget changes
      const boardMembers = db.prepare("SELECT id FROM members WHERE is_board = 1").all();
      boardMembers.forEach((m: any) => {
        createNotification(m.id, `New budget ${type}: $$${amount} for ${category}`, 'system');
      });

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating budget item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/budget/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM budget WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting budget item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Outreach
  app.get("/api/outreach", (req, res) => {
    try {
      const outreach = db.prepare("SELECT * FROM outreach").all();
      res.json(outreach);
    } catch (error) {
      console.error("Error fetching outreach:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/outreach", (req, res) => {
    try {
      const { title, description, date, hours, location } = req.body;
      const info = db.prepare("INSERT INTO outreach (title, description, date, hours, location) VALUES (?, ?, ?, ?, ?)")
        .run(title, description, date, hours, location);

      // Notify everyone of new outreach
      const allMembers = db.prepare("SELECT id FROM members").all();
      allMembers.forEach((m: any) => {
        createNotification(m.id, `New outreach event: ${title} at ${location}`, 'system');
      });

      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating outreach event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/outreach/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM outreach WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting outreach event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Documentation
  app.get("/api/documentation", (req, res) => {
    try {
      const docs = db.prepare("SELECT * FROM documentation ORDER BY date DESC").all();
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/documentation", (req, res) => {
    try {
      const { type, title, content, images, date } = req.body;
      const info = db.prepare("INSERT INTO documentation (type, title, content, images, date, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(type, title, content, JSON.stringify(images || []), date, new Date().toISOString());
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/documentation/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM documentation WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- AI endpoints using the local llama model ---

  app.post("/api/ai/fetch-news", async (req, res) => {
    try {
      // temporarily disabled? respond with static message
      if (NEWS_DISABLED) {
        const msg = "News service is currently disabled.";
        if (req.query.stream === 'true') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Transfer-Encoding', 'chunked');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders();
          res.write(msg);
          res.end();
          return;
        } else {
          return res.json({ result: msg });
        }
      }

      const { stream } = req.query;

      // 1. Search Exa for fresh info
      const searchResults = await searchExa("latest FIRST Tech Challenge (FTC) robotics news and updates not including gameplay, unique ideas from team websites, portfolios, hardware news, etc");

      let prompt = "Search for the latest FIRST Tech Challenge (FTC) news, REV Robotics updates, and interesting engineering tips for robotics teams. Summarize the top 5 most relevant items for a high school robotics club. Include *full* links including protocol (http/https).";

      if (searchResults && searchResults.length > 0) {
        const context = searchResults.map(r => `Title: ${r.title}\nURL: ${r.url}\nSummary: ${r.highlight}`).join("\n\n");
        prompt = `Based on these recent search results, summarize the top 5 most relevant FTC/Robotics news items for a high school club. Include the links to the sources provided.\n\nSearch Results:\n${context}`;
      }

      if (stream === 'true') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const numPredict = getNumericSetting('max_tokens_news', DEFAULT_MAX_TOKENS);
        await callOllama(prompt, true, (chunk) => {
          res.write(chunk);
        }, numPredict);
        res.end();
      } else {
        const numPredict = getNumericSetting('max_tokens_news', DEFAULT_MAX_TOKENS);
        const response = await callOllama(prompt, false, undefined, numPredict);
        res.json({ result: response });
      }
    } catch (error) {
      console.error("Error AI fetching news:", error);
      res.status(500).json({ error: "AI error" });
    }
  });

  app.post("/api/ai/attendance", async (req, res) => {
    try {
      const { records, members } = req.body;
      const data = JSON.stringify({ records, members });
      const prompt =
        `Analyze this attendance data for a robotics club and provide 3 key insights or suggestions for the leadership team. Keep it concise and suitable for the general population.\n\nData: ${data}`;

      if (req.query.stream === 'true') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const numPredict = getNumericSetting('max_tokens_attendance', DEFAULT_MAX_TOKENS);
        await callOllama(prompt, true, (chunk) => {
          res.write(chunk);
        }, numPredict);
        res.end();
      } else {
        const numPredict = getNumericSetting('max_tokens_attendance', DEFAULT_MAX_TOKENS);
        const response = await callOllama(prompt, false, undefined, numPredict);
        res.json({ result: response });
      }
    } catch (error) {
      console.error("Error AI attendance insights:", error);
      res.status(500).json({ error: "AI error" });
    }
  });

  app.post("/api/ai/check-excuse", async (req, res) => {
    try {
      const { reason, criteria } = req.body;
      const prompt =
        `Based on these criteria: "${criteria}", is my following reason for absence excused? ` +
        `Respond with "EXCUSED" or "UNEXCUSED" and give me a very brief explanation. (One sentence)\n\nReason: "${reason}"`;

      if (req.query.stream === 'true') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const numPredict = getNumericSetting('max_tokens_excuse', DEFAULT_MAX_TOKENS);
        await callOllama(prompt, true, (chunk) => {
          res.write(chunk);
        }, numPredict);
        res.end();
      } else {
        const numPredict = getNumericSetting('max_tokens_excuse', DEFAULT_MAX_TOKENS);
        const response = await callOllama(prompt, false, undefined, numPredict);
        res.json({ result: response });
      }
    } catch (error) {
      console.error("Error AI excuse check:", error);
      res.status(500).json({ error: "AI error" });
    }
  });

  app.post("/api/ai/activity-summary", async (req, res) => {
    try {
      const { tasks, messages, budget, userScope } = req.body;
      const payload = JSON.stringify({ tasks, messages, budget });
      const prompt =
        `Provide a concise summary of the recent club activity based on the following data. ` +
        `I have the following role/scope: ${JSON.stringify(userScope)}. ` +
        `Only include information that would be relevant or accessible to me. ` +
        `Highlight progress, concerns, and upcoming deadlines, if any. Keep it short and scannable, bullet point format. Even though there are IDs and programmatic details, do not include those in summary. ` +
        `EXAMPLE: 1) Johanna messaged you in chat to see if you were up for a meeting.` +
        `\n2) It looks like you have not completed the task "Design CAD model. It's due tomorrow."` +
        `\n3) Bob finished the task "Build chassis."` +
        `\n4) There are no outreach logs yet. Go see if you can fix that."` +

        `\n\nData: ${payload}`;

      if (req.query.stream === 'true') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const numPredict = getNumericSetting('max_tokens_summary', DEFAULT_MAX_TOKENS);
        await callOllama(prompt, true, (chunk) => {
          res.write(chunk);
        }, numPredict);
        res.end();
      } else {
        const numPredict = getNumericSetting('max_tokens_summary', DEFAULT_MAX_TOKENS);
        const response = await callOllama(prompt, false, undefined, numPredict);
        res.json({ result: response });
      }
    } catch (error) {
      console.error("Error AI activity summary:", error);
      res.status(500).json({ error: "AI error" });
    }
  });
  app.get("/api/communications", (req, res) => {
    try {
      const comms = db.prepare("SELECT * FROM communications ORDER BY date DESC").all();
      res.json(comms);
    } catch (error) {
      console.error("Error fetching communications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/communications", (req, res) => {
    try {
      const { recipient, subject, body, date, type } = req.body;
      const info = db.prepare("INSERT INTO communications (recipient, subject, body, date, type) VALUES (?, ?, ?, ?, ?)")
        .run(recipient, subject, body, date, type || 'email');
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating communication:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/communications/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM communications WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting communication:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- Code Management Endpoints ---
  console.log("[Code Manager] Initializing code management endpoints...");
  const codeRepoDir = path.join(__dirname, "code_repos");
  
  if (!fs.existsSync(codeRepoDir)) {
    fs.mkdirSync(codeRepoDir, { recursive: true });
  }
  console.log("[Code Manager] Repository directory:", codeRepoDir);

  // Helper to get team repo path
  const getTeamRepoPath = (teamId: number) => path.join(codeRepoDir, `team_${teamId}`);
  
  // Helper to get git instance for team
  const getGitInstance = (teamId: number): SimpleGit => {
    const repoPath = getTeamRepoPath(teamId);
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }
    return simpleGit(repoPath);
  };

  // Initialize team repo
  const initTeamRepo = async (teamId: number) => {
    const git = getGitInstance(teamId);
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        await git.init();
        await git.addConfig('user.email', 'robot@team.local');
        await git.addConfig('user.name', 'FTC Robot');
      }
    } catch (e) {
      console.error("Error initializing repo:", e);
    }
  };

  // POST: Get all code files for a team
  app.get("/api/code/files/:teamId", (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId, 10);
      console.log("[Code Endpoint] GET /api/code/files/:teamId called with teamId:", teamId);
      if (isNaN(teamId)) {
        return res.status(400).json({ error: "Invalid team ID" });
      }
      const files = db.prepare("SELECT * FROM code_files WHERE team_id = ? ORDER BY updated_at DESC")
        .all(teamId);
      console.log("[Code Endpoint] Found", files.length, "files for team", teamId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching code files:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  console.log("[Code Manager] GET /api/code/files/:teamId registered");

  // POST: Create/upload code file
  app.post("/api/code/files", (req, res) => {
    try {
      const { team_id, file_name, file_path, language = 'java', content, author_id } = req.body;
      
      console.log("[Code Endpoint] POST /api/code/files called with:", { team_id, file_name, file_path, language, author_id });
      
      if (!team_id || !file_name || !file_path || !author_id) {
        console.log("[Code Endpoint] Missing required fields");
        return res.status(400).json({ error: "Missing required fields: team_id, file_name, file_path, author_id" });
      }

      const now = new Date().toISOString();
      const fileInfo = db.prepare(`
        INSERT OR REPLACE INTO code_files (team_id, file_name, file_path, language, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(team_id, file_name, file_path, language, author_id, now, now);

      const fileId = fileInfo.lastInsertRowid as number;

      // Create initial commit to drafts
      const hash = `draft_${Date.now()}`;
      db.prepare(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(team_id, fileId, 'drafts', author_id, `Created ${file_name}`, content || '', hash, now);

      console.log("[Code Endpoint] File created successfully. ID:", fileId);
      res.json({ id: fileId, file_name, file_path, language });
    } catch (error) {
      console.error("Error creating code file:", error);
      res.status(500).json({ error: "Internal server error", details: String(error) });
    }
  });
  console.log("[Code Manager] POST /api/code/files registered");

  // GET: Get code file content with history
  app.get("/api/code/files/:fileId/content", (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const file = db.prepare("SELECT * FROM code_files WHERE id = ?").get(fileId) as any;
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const commits = db.prepare(`
        SELECT cc.*, m.name as author_name 
        FROM code_commits cc
        LEFT JOIN members m ON cc.author_id = m.id
        WHERE cc.file_id = ?
        ORDER BY cc.created_at DESC
      `).all(fileId);

      // Get drafts content
      const draftCommit = db.prepare(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = 'drafts'
        ORDER BY created_at DESC LIMIT 1
      `).get(fileId) as any;

      // Get main content
      const mainCommit = db.prepare(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = 'main'
        ORDER BY created_at DESC LIMIT 1
      `).get(fileId) as any;

      res.json({
        file,
        content: {
          drafts: draftCommit?.content || '',
          main: mainCommit?.content || ''
        },
        commits
      });
    } catch (error) {
      console.error("Error fetching code content:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST: Save draft
  app.post("/api/code/files/:fileId/draft", (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const { content, author_id } = req.body;
      
      const now = new Date().toISOString();
      const hash = `draft_${Date.now()}`;

      const info = db.prepare(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (
          (SELECT team_id FROM code_files WHERE id = ?),
          ?, 'drafts', ?, 'Auto-save draft', ?, ?, ?
        )
      `).run(fileId, fileId, author_id, content, hash, now);

      // Update file's updated_at
      db.prepare("UPDATE code_files SET updated_at = ? WHERE id = ?").run(now, fileId);

      res.json({ success: true, id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving draft:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST: Commit to main (publish)
  app.post("/api/code/files/:fileId/commit", async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const { message, author_id } = req.body;

      const file = db.prepare("SELECT * FROM code_files WHERE id = ?").get(fileId) as any;
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Get latest draft content
      const draft = db.prepare(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = 'drafts'
        ORDER BY created_at DESC LIMIT 1
      `).get(fileId) as any;

      const now = new Date().toISOString();
      const hash = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const info = db.prepare(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (?, ?, 'main', ?, ?, ?, ?, ?)
      `).run(file.team_id, fileId, author_id, message || 'Commit to main', draft?.content || '', hash, now);

      // Update file's updated_at
      db.prepare("UPDATE code_files SET updated_at = ? WHERE id = ?").run(now, fileId);

      // Broadcast to WebSocket clients
      broadcast({
        type: 'code_commit',
        file_id: fileId,
        team_id: file.team_id,
        message: message || 'New commit',
        hash,
        timestamp: now
      });

      res.json({ success: true, hash });
    } catch (error) {
      console.error("Error committing code:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET: Get commit history
  app.get("/api/code/files/:fileId/history", (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const branch = (req.query.branch as string) || 'main';

      const commits = db.prepare(`
        SELECT cc.*, m.name as author_name 
        FROM code_commits cc
        LEFT JOIN members m ON cc.author_id = m.id
        WHERE cc.file_id = ? AND cc.branch = ?
        ORDER BY cc.created_at DESC
      `).all(fileId, branch);

      res.json(commits);
    } catch (error) {
      console.error("Error fetching commit history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET: Get specific commit
  app.get("/api/code/commits/:commitId", (req, res) => {
    try {
      const commit = db.prepare(`
        SELECT cc.*, m.name as author_name, cf.file_name
        FROM code_commits cc
        LEFT JOIN members m ON cc.author_id = m.id
        LEFT JOIN code_files cf ON cc.file_id = cf.id
        WHERE cc.id = ?
      `).get(req.params.commitId) as any;

      if (!commit) {
        return res.status(404).json({ error: "Commit not found" });
      }

      res.json(commit);
    } catch (error) {
      console.error("Error fetching commit:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST: Revert a commit by creating a new commit on the chosen branch (main or drafts)
  app.post("/api/code/commits/:commitId/revert", (req, res) => {
    try {
      const commitId = parseInt(req.params.commitId, 10);
      if (isNaN(commitId)) return res.status(400).json({ error: "Invalid commit ID" });

      const { branch = 'main', author_id } = req.body as any;

      const commit = db.prepare("SELECT * FROM code_commits WHERE id = ?").get(commitId) as any;
      if (!commit) return res.status(404).json({ error: 'Commit not found' });

      const file = db.prepare("SELECT * FROM code_files WHERE id = ?").get(commit.file_id) as any;
      if (!file) return res.status(404).json({ error: 'File not found for commit' });

      const now = new Date().toISOString();
      const hash = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      db.prepare(`
        INSERT INTO code_commits (team_id, file_id, branch, author_id, message, content, hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(file.team_id, file.id, branch, author_id || null, `Revert to commit ${commit.hash}`, commit.content, hash, now);

      db.prepare("UPDATE code_files SET updated_at = ? WHERE id = ?").run(now, file.id);

      broadcast({
        type: 'code_revert',
        file_id: file.id,
        team_id: file.team_id,
        branch,
        hash,
        timestamp: now
      });

      res.json({ success: true, hash });
    } catch (error) {
      console.error('Error reverting commit:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST: Download code file
  app.post("/api/code/files/:fileId/download", (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      const { branch = 'main' } = req.body;

      const file = db.prepare("SELECT * FROM code_files WHERE id = ?").get(fileId) as any;
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const commit = db.prepare(`
        SELECT content FROM code_commits 
        WHERE file_id = ? AND branch = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(fileId, branch) as any;

      if (!commit) {
        return res.status(404).json({ error: "No content found for this branch" });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
      res.send(commit.content);
    } catch (error) {
      console.error("Error downloading code:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE: Delete code file
  app.delete("/api/code/files/:fileId", (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId, 10);
      if (isNaN(fileId)) {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      db.prepare("DELETE FROM code_commits WHERE file_id = ?").run(fileId);
      db.prepare("DELETE FROM code_files WHERE id = ?").run(fileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting code file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
