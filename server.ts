import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("nexus.db");

// Initialize Database
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

  -- Migration: Add password and is_setup if they don't exist (for existing DBs)
  PRAGMA table_info(members);
`);

// Check for missing columns manually since PRAGMA doesn't work in exec for conditional logic easily
const columns = db.prepare("PRAGMA table_info(members)").all();
const hasPassword = columns.some((c: any) => c.name === 'password');
const hasIsSetup = columns.some((c: any) => c.name === 'is_setup');

if (!hasPassword) {
  db.exec("ALTER TABLE members ADD COLUMN password TEXT");
}
if (!hasIsSetup) {
  db.exec("ALTER TABLE members ADD COLUMN is_setup INTEGER DEFAULT 0");
}

// Migration: Add is_board to tasks
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all();
if (!taskColumns.some((c: any) => c.name === 'is_board')) {
  db.exec("ALTER TABLE tasks ADD COLUMN is_board INTEGER DEFAULT 0");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    date TEXT NOT NULL,
    status TEXT NOT NULL, -- 'P', 'A', 'L', 'E', 'U', 'S'
    reason TEXT,
    is_excused INTEGER DEFAULT 0,
    FOREIGN KEY(member_id) REFERENCES members(id)
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

  -- Initial settings
  INSERT OR IGNORE INTO settings (key, value) VALUES ('excuse_criteria', 'Excused if for school, family emergency, or illness. Unexcused for gaming, hanging out, or forgetting.');

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo', -- 'todo', 'in-progress', 'done'
    assigned_to INTEGER,
    due_date TEXT,
    is_board INTEGER DEFAULT 0,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(assigned_to) REFERENCES members(id)
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
`);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());
  const PORT = 3000;

  // --- WebSocket Logic ---
  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "chat") {
        const stmt = db.prepare("INSERT INTO messages (sender_id, content, timestamp) VALUES (?, ?, ?)");
        const info = stmt.run(message.sender_id, message.content, new Date().toISOString());
        const broadcast = JSON.stringify({
          type: "chat",
          id: info.lastInsertRowid,
          sender_id: message.sender_id,
          content: message.content,
          timestamp: new Date().toISOString()
        });
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) client.send(broadcast);
        });
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
    const { name, number } = req.body;
    const info = db.prepare("INSERT INTO teams (name, number) VALUES (?, ?)").run(name, number);
    res.json({ id: info.lastInsertRowid });
  });

  // Members
  app.get("/api/members", (req, res) => {
    const members = db.prepare(`
      SELECT m.*, t.name as team_name 
      FROM members m 
      LEFT JOIN teams t ON m.team_id = t.id
    `).all();
    res.json(members);
  });

  app.post("/api/members", (req, res) => {
    const { team_id, name, role, email, is_board, scopes } = req.body;
    const info = db.prepare("INSERT INTO members (team_id, name, role, email, is_board, scopes) VALUES (?, ?, ?, ?, ?, ?)")
      .run(team_id, name, role, email, is_board ? 1 : 0, JSON.stringify(scopes || []));
    res.json({ id: info.lastInsertRowid });
  });

  // Attendance
  app.get("/api/attendance", (req, res) => {
    const records = db.prepare("SELECT * FROM attendance").all();
    res.json(records);
  });

  app.post("/api/attendance/batch", (req, res) => {
    const { date, records } = req.body; // records: [{member_id, status, reason}]
    const insert = db.prepare("INSERT OR REPLACE INTO attendance (member_id, date, status, reason) VALUES (?, ?, ?, ?)");
    const transaction = db.transaction((data) => {
      for (const rec of data) insert.run(rec.member_id, date, rec.status, rec.reason || null);
    });
    transaction(records);
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

  // Settings
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    res.json({ success: true });
  });

  // Tasks
  app.get("/api/tasks", (req, res) => {
    const tasks = db.prepare("SELECT * FROM tasks").all();
    res.json(tasks);
  });

  app.post("/api/tasks", (req, res) => {
    const { team_id, title, description, status, assigned_to, due_date, is_board } = req.body;
    const info = db.prepare("INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, is_board) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(team_id, title, description, status || 'todo', assigned_to, due_date, is_board || 0);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  // Budget
  app.get("/api/budget", (req, res) => {
    const budget = db.prepare("SELECT * FROM budget").all();
    res.json(budget);
  });

  app.post("/api/budget", (req, res) => {
    const { team_id, type, amount, category, description, date } = req.body;
    const info = db.prepare("INSERT INTO budget (team_id, type, amount, category, description, date) VALUES (?, ?, ?, ?, ?, ?)")
      .run(team_id, type, amount, category, description, date);
    res.json({ id: info.lastInsertRowid });
  });

  // Outreach
  app.get("/api/outreach", (req, res) => {
    const outreach = db.prepare("SELECT * FROM outreach").all();
    res.json(outreach);
  });

  app.post("/api/outreach", (req, res) => {
    const { title, description, date, hours, location } = req.body;
    const info = db.prepare("INSERT INTO outreach (title, description, date, hours, location) VALUES (?, ?, ?, ?, ?)")
      .run(title, description, date, hours, location);
    res.json({ id: info.lastInsertRowid });
  });

  // Communications
  app.get("/api/communications", (req, res) => {
    const comms = db.prepare("SELECT * FROM communications ORDER BY date DESC").all();
    res.json(comms);
  });

  app.post("/api/communications", (req, res) => {
    const { recipient, subject, body, date, type } = req.body;
    const info = db.prepare("INSERT INTO communications (recipient, subject, body, date, type) VALUES (?, ?, ?, ?, ?)")
      .run(recipient, subject, body, date, type || 'email');
    res.json({ id: info.lastInsertRowid });
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
