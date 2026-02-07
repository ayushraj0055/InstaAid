// server.js
require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database('instaai.db');

// ---------- DB: tables ----------
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','provider')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS addresses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT,
  line1 TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  pincode TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nurse_bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  area TEXT NOT NULL,
  hours INTEGER NOT NULL,
  rate_per_hour INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('day','night')),
  days INTEGER NOT NULL,
  rate_per_day INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guidance_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ambulance_bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  distance_km REAL NOT NULL,
  pickup_address TEXT NOT NULL,
  rate_per_km INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// ---------- helpers ----------
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
function makeToken(user) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ---------- auth ----------
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !['user','provider'].includes(role)) {
      return res.status(400).json({ error: 'username, password, role(user/provider) required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)');
    const info = stmt.run(username, hash, role);
    const user = { id: info.lastInsertRowid, username, role };
    return res.json({ user, token: makeToken(user) });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    return res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const user = { id: row.id, username: row.username, role: row.role };
  return res.json({ user, token: makeToken(user) });
});

// ---------- addresses (user) ----------
app.post('/addresses', auth, (req, res) => {
  const { label, line1, city, state, pincode } = req.body;
  if (!line1 || !city) return res.status(400).json({ error: 'line1 and city required' });
  const info = db.prepare(
    'INSERT INTO addresses (user_id,label,line1,city,state,pincode) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, label || null, line1, city, state || null, pincode || null);
  const address = db.prepare('SELECT * FROM addresses WHERE id=?').get(info.lastInsertRowid);
  res.json(address);
});
app.get('/addresses', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM addresses WHERE user_id=?').all(req.user.id);
  res.json(rows);
});

// ---------- nurse booking (user) ----------
app.post('/nurse/book', auth, (req, res) => {
  const { area, hours } = req.body;
  const ratePerHour = 200;
  if (!area || !hours || hours <= 0) return res.status(400).json({ error: 'area and positive hours required' });
  const total = Math.round(ratePerHour * Number(hours));
  const info = db.prepare(`
    INSERT INTO nurse_bookings (user_id, area, hours, rate_per_hour, total)
    VALUES (?,?,?,?,?)
  `).run(req.user.id, area, Number(hours), ratePerHour, total);
  const row = db.prepare('SELECT * FROM nurse_bookings WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});
app.get('/nurse/my', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM nurse_bookings WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// ---------- subscriptions (user) ----------
app.post('/subscriptions', auth, (req, res) => {
  const { type, days } = req.body; // type: 'day' | 'night'
  const ratePerDay = 1000;
  if (!['day','night'].includes(type) || !days || days <= 0) {
    return res.status(400).json({ error: 'type(day/night) and positive days required' });
  }
  const total = Math.round(ratePerDay * Number(days));
  const info = db.prepare(`
    INSERT INTO subscriptions (user_id, type, days, rate_per_day, total)
    VALUES (?,?,?,?,?)
  `).run(req.user.id, type, Number(days), ratePerDay, total);
  const row = db.prepare('SELECT * FROM subscriptions WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});
app.get('/subscriptions/my', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM subscriptions WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// ---------- guidance (user)
app.post('/guidance', auth, (req, res) => {
  const { note } = req.body;
  const info = db.prepare(
    'INSERT INTO guidance_requests (user_id, note) VALUES (?,?)'
  ).run(req.user.id, note || null);
  const row = db.prepare('SELECT * FROM guidance_requests WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});
app.get('/guidance/my', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM guidance_requests WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// ---------- ambulance (user)
app.post('/ambulance/book', auth, (req, res) => {
  const { distance_km, pickup_address } = req.body;
  const ratePerKm = 50;
  if (!distance_km || distance_km <= 0 || !pickup_address) {
    return res.status(400).json({ error: 'positive distance_km and pickup_address required' });
  }
  const total = Math.round(ratePerKm * Number(distance_km));
  const info = db.prepare(`
    INSERT INTO ambulance_bookings (user_id, distance_km, pickup_address, rate_per_km, total)
    VALUES (?,?,?,?,?)
  `).run(req.user.id, Number(distance_km), pickup_address, ratePerKm, total);
  const row = db.prepare('SELECT * FROM ambulance_bookings WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});
app.get('/ambulance/my', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ambulance_bookings WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// ---------- provider dashboard examples ----------
app.get('/provider/requests', auth, requireRole('provider'), (req, res) => {
  // Providers can see all open guidance requests (simple example)
  const rows = db.prepare("SELECT * FROM guidance_requests WHERE status='pending' ORDER BY id DESC").all();
  res.json(rows);
});
app.post('/provider/requests/:id/resolve', auth, requireRole('provider'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE guidance_requests SET status='resolved' WHERE id=?").run(id);
  res.json({ ok: true });
});

// ---------- start ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`InstaAi API running on http://localhost:${PORT}`));
