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

// Migration: Add unique index to attendance for INSERT OR REPLACE
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date)");

db.exec(`
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
    created_at TEXT NOT NULL,
    completed_at TEXT,
    is_board INTEGER DEFAULT 0,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(assigned_to) REFERENCES members(id)
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
`);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());
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
    const { name, number } = req.body;
    const info = db.prepare("INSERT INTO teams (name, number) VALUES (?, ?)").run(name, number);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/teams/:id", (req, res) => {
    const { name, number } = req.body;
    db.prepare("UPDATE teams SET name = ?, number = ? WHERE id = ?").run(name, number, req.params.id);
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
    res.json(members);
  });

  app.post("/api/members", (req, res) => {
    const { team_id, name, role, email, is_board, scopes } = req.body;
    const info = db.prepare("INSERT INTO members (team_id, name, role, email, is_board, scopes) VALUES (?, ?, ?, ?, ?, ?)")
      .run(team_id, name, role, email, is_board ? 1 : 0, JSON.stringify(scopes || []));
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/members/:id", (req, res) => {
    const { team_id, name, role, email, is_board, scopes } = req.body;
    db.prepare("UPDATE members SET team_id = ?, name = ?, role = ?, email = ?, is_board = ?, scopes = ? WHERE id = ?")
      .run(team_id, name, role, email, is_board ? 1 : 0, JSON.stringify(scopes || []), req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/members/:id", (req, res) => {
    db.prepare("DELETE FROM members WHERE id = ?").run(req.params.id);
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

      const insert = db.prepare("INSERT OR REPLACE INTO attendance (member_id, date, status, reason) VALUES (?, ?, ?, ?)");
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
        createNotification(m.id, `New budget ${type}: $${amount} for ${category}`, 'system');
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
