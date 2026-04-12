const db = require('./db');

function initDatabase() {
  db.serialize(() => {

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        article TEXT,
        sale_price REAL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        size TEXT,
        color TEXT,
        barcode TEXT UNIQUE,
        stock INTEGER
      )
    `);
       // 🧾 SALES TABLE
    db.run(`
    CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        subtotal REAL,
        discount REAL,
        total REAL
    )
    `);

    // 📦 SALE ITEMS
    db.run(`
    CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        product_id INTEGER,
        price REAL,
        qty INTEGER
    )
    `);

    // 📦 PRODUCTS (stock add)
    db.run(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        barcode TEXT UNIQUE,
        stock INTEGER DEFAULT 0
    )
    `);

    // ✅ Insert test data (only once)
       db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
  if (row.count === 0) {
    db.run(`
      INSERT INTO products (name, price, barcode, stock)
      VALUES 
      ('Nike Air Max', 5000, '111', 10),
      ('Adidas Runner', 4000, '222', 8),
      ('Puma Classic', 3000, '333', 5)
    `);
  }
});

  });
}

module.exports = initDatabase;