const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(process.cwd(), 'database', 'pos.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("DB Error:", err);
  else console.log("Database connected ✅");
});

module.exports = db;