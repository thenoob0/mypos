const { app, BrowserWindow, ipcMain } = require('electron');
const { dialog } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

//barcode printing
const { exec } = require("child_process");
const fs = require("fs");


const escpos = require('@node-escpos/core');
const USB = require('@node-escpos/usb-adapter');
const { Image } = require("@node-escpos/core");



let db;
let dbPath; // ✅ GLOBAL
// ================= DB INIT =================
function initDB() {
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");
    console.log("Initializing DB...");

    // PRODUCTS
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        article TEXT UNIQUE
      )
    `);
    
    
    // VARIANTS
    db.run(`
      CREATE TABLE IF NOT EXISTS variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        size TEXT,
        color TEXT,
        cost_price REAL,
        sale_price REAL,
        barcode TEXT UNIQUE,
        stock INTEGER DEFAULT 0
      )
    `);

    // SALES
    db.run(`
      CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT,
      date TEXT,
      subtotal REAL,
      discount REAL,
      total REAL
      )
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT UNIQUE,
    type TEXT, -- sale | return | exchange
    items TEXT,
    return_items TEXT,
    subtotal REAL,
    discount REAL,
    total REAL,
    date TEXT
  )
`);

    // SALE ITEMS
    db.run(`
      CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER,
      product_id INTEGER,
      variant_id INTEGER,
      name TEXT,
      article TEXT,
      price REAL,
      cost REAL,
      qty INTEGER,
      size TEXT,
      color TEXT
      )
   `);

   // EXPENSES
    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      amount REAL,
      date TEXT
      )
  `);
  
  // SETTINGS
  db.run(`
      CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER,
    price REAL,        
    qty INTEGER,
    cost REAL,
    total REAL,      
    date TEXT
)
  `);

    // INDEXES (🔥 performance boost)
    db.run(`CREATE INDEX IF NOT EXISTS idx_barcode ON variants(barcode)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoice ON invoices(invoice_no)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_date ON invoices(date)`);
    initSettings();
  });
}

//For Dynamic Label
function initSettings() {

  const defaults = {
    label_width: "800",
    label_height: "260",

    barcode_width: "2",
    barcode_height: "55",

    barcode_text_x: "50",
    barcode_text_y: "240",
    barcode_text_font_size: "3",

    shop_name: "UNITED SHOES",
    shop_x: "2",
    shop_y: "2",
    shop_font_size: "3",

    // NAME
    name_x: "20",
    name_y: "20",
    name_font_size: "4",

    // ARTICLE
    article_x: "20",
    article_y: "60",
    article_font_size: "3",

    // SIZE
    size_x: "20",
    size_y: "90",
    size_font_size: "3",

    // COLOR
    color_x: "20",
    color_y: "120",
    color_font_size: "3",

    // PRICE
    price_x: "20",
    price_y: "160",
    price_font_size: "5",

    // BARCODE
    barcode_x: "50",
    barcode_y: "190",

    auto_backup: "false",
    backup_time: "02:00"
  };

  for (let key in defaults) {
    db.get("SELECT value FROM settings WHERE key = ?", [key], (err, row) => {
      if (!row) {
        db.run(
          "INSERT INTO settings (key, value) VALUES (?, ?)",
          [key, defaults[key]]
        );
      }
    });
  }
}
ipcMain.handle("save-return", async (event, items) => {

  const date = new Date().toISOString();
  const invoiceNo = await generateInvoiceNumber("return");

  return new Promise(async (resolve, reject) => {

    try {

      for (let item of items) {

        const soldQty = await new Promise((res, rej) => {
          db.get(`
            SELECT COALESCE(SUM(qty),0) as total
            FROM sale_items
            WHERE variant_id = ?
          `, [item.variant_id], (err, row) => {
            if (err) return rej(err);
            res(row.total);
          });
        });

        const returnedQty = await new Promise((res, rej) => {
          db.get(`
            SELECT COALESCE(SUM(qty),0) as total
            FROM return_items
            WHERE variant_id = ?
          `, [item.variant_id], (err, row) => {
            if (err) return rej(err);
            res(row.total);
          });
        });

        if ((returnedQty + item.qty) > soldQty) {
          return reject(new Error(`Return limit exceeded for ${item.name} ❌`));
        }
      }

      const stmt = db.prepare(`
        INSERT INTO return_items (variant_id, cost, price, qty, total, date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      items.forEach(item => {

        const total = item.price * item.qty;

        stmt.run(item.variant_id, item.cost, item.price, item.qty, total, date);

        db.run(`
          UPDATE variants 
          SET stock = stock + ?
          WHERE id = ?
        `, [item.qty, item.variant_id]);

      });

      stmt.finalize();

      // 🔥 SAVE INVOICE
      const totalAmount = items.reduce((s, i) => s + i.price * i.qty, 0);

      db.run(`
        INSERT INTO invoices 
        (invoice_no, type, items, return_items, subtotal, discount, total, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        invoiceNo,
        "return",
        JSON.stringify([]),
        JSON.stringify(items),
        0,
        0,
        totalAmount,
        date
      ]);

      resolve({ success: true, invoiceNo });

    } catch (err) {
      reject(err);
    }

  });

});

// GET SETTINGS
ipcMain.handle("get-settings", async () => {

  return new Promise((resolve) => {

    db.all("SELECT key, value FROM settings", [], (err, rows) => {

      const settings = {};

      rows.forEach(r => {
        settings[r.key] = r.value;
      });

      resolve(settings);
    });

  });
});


// SAVE SETTINGS
ipcMain.handle("save-settings", async (event, data) => {

  return new Promise((resolve) => {

    const keys = Object.keys(data);

    keys.forEach(key => {
      db.run(
        "UPDATE settings SET value = ? WHERE key = ?",
        [data[key], key]
      );
    });

    resolve(true);
  });
});

//Backup Db
ipcMain.handle("backup-db", async () => {

  const save = await dialog.showSaveDialog({
    title: "Save Backup",
    defaultPath: `backup-${Date.now()}.sqlite`
  });

  if (save.canceled) return false;

  return new Promise((resolve, reject) => {

    fs.copyFile(dbPath, save.filePath, (err) => {
      if (err) return reject(err);

      resolve(save.filePath); // 👈 path return
    });

  });

});

//Restroe DB
ipcMain.handle("restore-db", async () => {

  const result = await dialog.showOpenDialog({
    title: "Select Backup File",
    filters: [{ name: "SQLite DB", extensions: ["sqlite"] }],
    properties: ["openFile"]
  });

  if (result.canceled) return false;

  return new Promise((resolve, reject) => {
    fs.copyFile(result.filePaths[0], dbPath, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });

});

ipcMain.handle("restart-app", () => {
  app.relaunch();
  app.exit();
});

// Get Invoice No.
async function generateInvoiceNumber(type = "sale") {
  return new Promise((resolve, reject) => {

    const today = new Date().toISOString().slice(0, 10);

    db.get(
      `SELECT COUNT(*) as count FROM invoices WHERE date LIKE ?`,
      [`${today}%`],
      (err, row) => {

        if (err) return reject(err);

        const number = row.count + 1;
        const formatted = String(number).padStart(3, '0');
        const datePart = today.replace(/-/g, "");

        let prefix = "INV";
        if (type === "return") prefix = "RET";
        if (type === "exchange") prefix = "EXC";

        resolve(`${prefix}-${datePart}-${formatted}`);
      }
    );

  });
}

// ================= WINDOW =================
async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
    nodeIntegration: true,
    contextIsolation: false
    }
  });

  win.loadFile('renderer/index.html');

  const printers = await win.webContents.getPrintersAsync();

  console.log("🖨️ Available Printers:");
  printers.forEach(p => {
    console.log("👉", p.name);
  });
}

// ================= APP READY =================
app.whenReady().then(() => {
    const userDataPath = app.getPath('userData');
    dbPath = path.join(userDataPath, 'pos.db'); // ✅ GLOBAL assign

  console.log("✅ DB PATH:", dbPath);

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("❌ DB OPEN ERROR:", err);
    } else {
      console.log("✅ Database connected");
    }
  });

let lastBackupDate = "";

setInterval(() => {

  const now = new Date();
  const today = now.toDateString();
  const currentTime = now.toTimeString().slice(0, 5);

  db.get("SELECT value FROM settings WHERE key = 'auto_backup'", (err, row) => {

    if (!row || row.value !== "true") return;

    db.get("SELECT value FROM settings WHERE key = 'backup_time'", (err, row2) => {

      if (!row2) return;

      if (currentTime === row2.value && lastBackupDate !== today) {

        const backupPath = path.join(
          app.getPath("documents"),
          `auto-backup-${Date.now()}.sqlite`
        );

        fs.copyFile(dbPath, backupPath, () => {
          console.log("✅ Auto backup done");
          lastBackupDate = today; // 🔥 prevent duplicate
        });

      }

    });

  });

}, 60000);

  // ================= IPC HANDLERS =================

ipcMain.handle("print-thermal", async (event, data) => {

  return new Promise((resolve, reject) => {

    const device = new USB();

    const printer = new escpos.Printer(device, {
      encoding: "CP437"
    });

    device.open(async (error) => {

      if (error) {
        console.error("Printer error:", error);
        return reject(error);
      }

      try {

        // ================= LOAD LOGO =================
        let logo = null;
        try {
          logo = await Image.load(__dirname + "/assets/logo.png");
        } catch (e) {
          console.log("Logo not found, skipping...");
        }

        // 🔥 UPDATED DATA (IMPORTANT)
        const {
          items = [],
          returnItems = [],
          subtotal = 0,
          discount = 0,
          total = 0,
          invoiceNo,
          isExchange = false,
          diff = 0
        } = data;

        let safeInvoice = "INV000001";

        // ✅ STRING case
        if (typeof invoiceNo === "string") {
          safeInvoice = invoiceNo.trim();
        }

        // ✅ OBJECT case (🔥 exchange fix)
        else if (typeof invoiceNo === "object" && invoiceNo !== null) {
          safeInvoice = (invoiceNo.invoiceNo || "").toString().trim();
        }

        const WIDTH = 42;

        const line = (left, right) => {
          left = String(left || "");
          right = String(right || "");
          const spaces = WIDTH - (left.length + right.length);
          return left + " ".repeat(spaces > 0 ? spaces : 1) + right;
        };

        const divider = "-".repeat(WIDTH);
        const smallDivider = "-".repeat(WIDTH);

        const now = new Date();

        printer.hardware('init');

        // ================= LOGO =================
        if (logo) {
          await printer.align('CT').image(logo, "s8");
        }

        // ================= HEADER =================
        printer
          .align('CT')
          .style('B')
          .size(3, 2)
          .text('UNITED SHOES')
          .size(1, 1)
          .style('NORMAL')
          .text('Main Market Green Town, Lahore')
          .text('Ph: 0322-9454215, 0300-4525237')
          .text('SINCE 1987')
          .text(divider);

        // 🔥 EXCHANGE TITLE
        if (isExchange) {
          printer
            .style('B')
            .size(2, 2)
            .text("EXCHANGE RECEIPT")
            .size(1, 1)
            .style('NORMAL')
            .text(divider);
        }

        // ================= INFO =================
        printer
          .align('CT')
          .text(line("Invoice", safeInvoice))
          .text(line("Date", now.toLocaleDateString()))
          .text(line("Time", now.toLocaleTimeString()))
          .text(divider);

       

        const COL1 = 18;
        const COL2 = 6;
        const COL3 = 8;
        const COL4 = 8;

        const col = (a, b, c, d) => {
          const article = String(a || "").substring(0, COL1).padEnd(COL1, " ");
          const qty = String(b || "").padStart(COL2, " ");
          const price = String(c || "").padStart(COL3, " ");
          const total = String(d || "").padStart(COL4, " ");
          return article + qty + price + total;
        };

        printer
          .align('CT')
          .style('B')
          .text(col("Article", "Qty", "Price", "Total"))
          .style('NORMAL')
          .text(divider);

         
        // ================= EXCHANGE FLOW =================
        if (isExchange) {

          // 🔴 RETURN TITLE (CENTER)
          if (returnItems.length > 0) {

            printer
              .align('CT')
              .style('B')
              .text("RETURN ITEMS")
              .style('NORMAL')
              .text(divider);

            // 🔴 RETURN ITEMS LIST
            returnItems.forEach(i => {

              const article = i.article?.trim() || i.name || "NO-ARTICLE";
              const qty = i.qty || 0;
              const price = i.price || 0;
              const totalItem = qty * price;

              printer.text(col(article, qty, price, totalItem));
              printer.text((`${i.size || "-"} | ${i.color || "-"}`).padEnd(42, " "));
              printer.feed(1);

            });

            printer.text(divider);
          }

          // 🟢 NEW ITEMS TITLE (CENTER)
          printer
            .align('CT')
            .style('B')
            .text("NEW ITEMS")
            .style('NORMAL')
            .text(divider);

        } 
        // ================= ITEMS =================
        items.forEach(i => {

          const article = i.article?.trim() || "NO-ARTICLE";
          const size = (i.size || "-").trim();
          const color = (i.color || "-").trim();
          const qty = i.qty || 0;
          const price = i.price || 0;
          const totalItem = qty * price;

          const firstLine = ("Article: " + article).substring(0, COL1);
          const secondLine = article.substring(COL1);

          printer.text(col(firstLine, qty, price, totalItem));

          if (secondLine) printer.text(secondLine);

          printer.text((size + " | " + color).padEnd(42, " "));
          printer.text((`${qty} x ${price}`).padEnd(42, " "));

          printer.feed(1);
        });

        printer.text(divider);

        // ================= TOTAL =================
        printer
          .text(line("Subtotal", subtotal))
          .text(line("Discount", discount))
          .text(smallDivider);

        printer
          .style('B')
          .size(2, 2)
          .text(`Rs ${total}`)
          .size(1, 1)
          .style('NORMAL');

        // 🔥 EXCHANGE DIFFERENCE
        if (isExchange) {
          printer.text(divider);

          if (diff > 0) {
            printer.text(`Customer Pays: Rs ${diff}`);
          } else if (diff < 0) {
            printer.text(`Refund: Rs ${Math.abs(diff)}`);
          } else {
            printer.text(`Even Exchange`);
          }
        }

        printer.text(divider);

        // ================= POLICY =================
        printer
          .align('CT')
          .text("Exchange & Return Policy:")
          .text("1) Exchange within 10 days")
          .text("2) Original receipt required")
          .text("3) Item must be unused")
          .text("4) In original condition")
          .text("5) No exchange on sale items")
          .text("6) Size exchange (if available)")
          .text("7) No cash refund")
          .text("8) Damaged items not accepted")
          .text(divider);

        // ================= FOOTER =================
        printer
          .feed(1)
          .align('CT')
          .text('Thank you for shopping')
          .style('B')
          .text('UNITED SHOES')
          .style('NORMAL')
          .text('Quality - Comfort - Style')
          .feed(4)
          .cut()
          try {
            await printer.close();
          } catch (e) {
            console.log("Close error ignored");
          }

        resolve(true);

      } catch (err) {
        console.error("Print error:", err);
        reject(err);
      }

    });

  });

});


// Label Print
ipcMain.handle("print-label", async (event, zpl) => {

  return new Promise((resolve, reject) => {

    try {

      // ✅ TEMP PATH (IMPORTANT FIX)
      const filePath = require("path").join(app.getPath("temp"), "label.zpl");

      require("fs").writeFileSync(filePath, zpl);

      console.log("FILE PATH:", filePath);

      // ✅ PRINTER NAME (CHECK KARNA)
      const printerName = "BIXOLON";

      const cmd = `COPY /B "${filePath}" "\\\\localhost\\${printerName}"`;

      console.log("CMD:", cmd);

      require("child_process").exec(cmd, (error, stdout, stderr) => {

        if (error) {
          console.error("❌ PRINT ERROR:", error);
          return reject(error);   // ✅ FIX (false hata diya)
        }

        console.log("✅ PRINT SUCCESS");
        resolve(true);
      });

    } catch (err) {
      console.error("❌ EXCEPTION:", err);
      reject(err);
    }

  });

});

  // 🔍 SEARCH PRODUCT
  ipcMain.handle("search-product", (event, value) => {
    return new Promise((resolve, reject) => {

      db.all(
        `SELECT 
          variants.id as variant_id,
          products.id as product_id,
          products.name,
          products.article,
          variants.size,
          variants.color,
          variants.sale_price as price,
          variants.cost_price as cost,
          variants.barcode
        FROM variants
        JOIN products ON variants.product_id = products.id
        WHERE variants.barcode = ?`,
        [value],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );

    });
  });

  // ➕ ADD PRODUCT
ipcMain.handle("add-product", (event, data) => {
  return new Promise((resolve, reject) => {

    const { name, article, variants } = data;

    // 🔴 CHECK DUPLICATE ARTICLE
    db.get(
      "SELECT id FROM products WHERE article = ?",
      [article],
      (err, row) => {

        if (row) {
          return reject(new Error("Article already exists ❌"));
        }

        // ✅ INSERT
        db.run(
          `INSERT INTO products (name, article) VALUES (?, ?)`,
          [name, article],
          function (err) {

            if (err) return reject(err);

            const productId = this.lastID;

            const stmt = db.prepare(`
              INSERT INTO variants 
              (product_id, size, color, cost_price, sale_price, barcode, stock)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            variants.forEach(v => {
              stmt.run(productId, v.size, v.color, v.cost, v.price, v.barcode, v.stock);
            });

            stmt.finalize();
            resolve(true);
          }
        );

      }
    );

  });
});

// Generate Unique Barcode
ipcMain.handle("generate-barcode", () => {
  return new Promise((resolve, reject) => {

    function makeCode() {
      const code = Math.floor(1000000000 + Math.random() * 9000000000).toString();

      db.get("SELECT id FROM variants WHERE barcode = ?", [code], (err, row) => {
        if (err) return reject(err);

        if (row) {
          makeCode(); // duplicate → دوبارہ try
        } else {
          resolve(code); // unique mil gaya
        }
      });
    }

    makeCode();
  });
});

  // 📦 LIST PRODUCTS
  ipcMain.handle("get-products", (event, { page, limit, search, sort, filter }) => {
    return new Promise((resolve, reject) => {

      const offset = (page - 1) * limit;
      const searchQuery = `%${search || ""}%`;

      let orderBy = "products.id DESC";
      if (sort === "name") orderBy = "products.name ASC";
      if (sort === "stock") orderBy = "stock ASC";

      let having = "";
      if (filter === "low") having = "HAVING stock <= 2 AND stock > 0";
      if (filter === "out") having = "HAVING stock = 0";

      const query = `
        SELECT 
          products.id,
          products.name,
          products.article,
          COALESCE(SUM(variants.stock), 0) as stock,
          COUNT(variants.id) as variantCount
        FROM products
        LEFT JOIN variants ON variants.product_id = products.id
        WHERE 
          products.name LIKE ? 
          OR products.article LIKE ? 
          OR variants.barcode LIKE ?
        GROUP BY products.id
        ${having}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;

      db.all(query, [searchQuery, searchQuery, searchQuery, limit, offset], (err, rows) => {

        if (err) return reject(err);

        db.get(
          `SELECT COUNT(DISTINCT products.id) as total
           FROM products
           LEFT JOIN variants ON variants.product_id = products.id
           WHERE 
             products.name LIKE ? 
             OR products.article LIKE ? 
             OR variants.barcode LIKE ?`,
          [searchQuery, searchQuery, searchQuery],
          (err2, countRow) => {

            if (err2) return reject(err2);

            resolve({
              products: rows,
              totalPages: Math.ceil(countRow.total / limit)
            });

          }
        );

      });

    });
  });

  // 🔍 GET PRODUCT BY ID
  ipcMain.handle("get-product-by-id", (event, id) => {
    return new Promise((resolve, reject) => {

      db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, product) => {

        if (err) return reject(err);
        if (!product) return resolve(null);

        db.all(`SELECT * FROM variants WHERE product_id = ?`, [id], (err2, variants) => {

          if (err2) return reject(err2);

          resolve({
            ...product,
            variants
          });

        });

      });

    });
  });


// ✏️ UPDATE PRODUCT (SAFE)
ipcMain.handle("update-product", (event, data) => {
  return new Promise((resolve, reject) => {

    const { id, name, article, variants } = data;

    db.serialize(() => {

      // ✅ START TRANSACTION
      db.run("BEGIN TRANSACTION");

      // ================= UPDATE PRODUCT =================
      db.run(
        `UPDATE products SET name=?, article=? WHERE id=?`,
        [
          name ? name.trim() : "",
          article ? article.trim() : "",
          id
        ],
        function (err) {

          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }

          // ================= DELETE OLD VARIANTS =================
          db.run(`DELETE FROM variants WHERE product_id=?`, [id], function (err) {

            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }

            // ================= INSERT NEW VARIANTS =================
            const stmt = db.prepare(`
              INSERT INTO variants 
              (product_id, size, color, cost_price, sale_price, barcode, stock)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            let hasError = false;

            for (let v of variants) {

              stmt.run(
                id,
                v.size,
                v.color,
                v.cost,
                v.price,
                v.barcode,
                v.stock,
                function (err) {
                  if (err && !hasError) {
                    hasError = true;
                    stmt.finalize(() => {
                      db.run("ROLLBACK");
                      reject(err);
                    });
                  }
                }
              );

              if (hasError) return;
            }

            // ================= FINALIZE =================
            stmt.finalize((err) => {

              if (err) {
                db.run("ROLLBACK");
                return reject(err);
              }

              // ✅ COMMIT (ALL GOOD)
              db.run("COMMIT", (err) => {

                if (err) {
                  db.run("ROLLBACK");
                  return reject(err);
                }

                resolve(true);
              });

            });

          });

        }
      );

    });

  });
});


  // ✏️ UPDATE PRODUCT
  /*
ipcMain.handle("update-product", (event, data) => {
  return new Promise((resolve, reject) => {

    const { id, name, article, variants } = data;

    db.serialize(() => {

      db.run(
        `UPDATE products SET name=?, article=? WHERE id=?`,
        [
          name ? name.trim() : "",
          article ? article.trim() : "",
          id
        ]
      );

      db.run(`DELETE FROM variants WHERE product_id=?`, [id]);

      const stmt = db.prepare(`
        INSERT INTO variants 
        (product_id, size, color, cost_price, sale_price, barcode, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      variants.forEach(v => {
        stmt.run(
          id,
          v.size,
          v.color,
          v.cost,
          v.price,
          v.barcode,
          v.stock
        );
      });

      stmt.finalize();

      resolve(true);
    });

  });
});*/

  // 🗑 DELETE PRODUCT
  ipcMain.handle("delete-product", (event, id) => {
    return new Promise((resolve, reject) => {

      db.run(`DELETE FROM variants WHERE product_id = ?`, [id]);
      db.run(`DELETE FROM products WHERE id = ?`, [id], function(err) {
        if (err) return reject(err);
        resolve(true);
      });

    });
  });
ipcMain.handle("save-exchange", async (event, data) => {

  const { items, returnItems, subtotal, discount, total } = data;

  const date = new Date().toISOString();
  const invoiceNo = await generateInvoiceNumber("exchange");

  return new Promise(async (resolve, reject) => {

    try {

      // ================= STOCK CHECK (NEW ITEMS) =================
      for (let item of items) {

        const stock = await new Promise((res, rej) => {
          db.get(
            "SELECT stock FROM variants WHERE id = ?",
            [item.variant_id],
            (err, row) => {
              if (err) return rej(err);
              res(row ? row.stock : 0);
            }
          );
        });

        if (item.qty > stock) {
          return reject(new Error(`Not enough stock for ${item.name} ❌`));
        }
      }

      // ================= RETURN LIMIT CHECK =================
      for (let item of returnItems) {

        const soldQty = await new Promise((res, rej) => {
          db.get(`
            SELECT COALESCE(SUM(qty),0) as total
            FROM sale_items
            WHERE variant_id = ?
          `, [item.variant_id], (err, row) => {
            if (err) return rej(err);
            res(row.total);
          });
        });

        const returnedQty = await new Promise((res, rej) => {
          db.get(`
            SELECT COALESCE(SUM(qty),0) as total
            FROM return_items
            WHERE variant_id = ?
          `, [item.variant_id], (err, row) => {
            if (err) return rej(err);
            res(row.total);
          });
        });

        if ((returnedQty + item.qty) > soldQty) {
          return reject(new Error(`Return limit exceeded for ${item.name} ❌`));
        }
      }

      // ================= RETURN SAVE =================
      const returnStmt = db.prepare(`
        INSERT INTO return_items (variant_id, cost, price, qty, total, date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      returnItems.forEach(item => {

        const totalVal = item.price * item.qty;

        returnStmt.run(
          item.variant_id, // ✅ variant_id (IMPORTANT)
          item.cost,
          item.price,
          item.qty,
          totalVal,
          date
        );

        // STOCK +
        db.run(`
          UPDATE variants 
          SET stock = stock + ?
          WHERE id = ?
        `, [item.qty, item.variant_id]); // ✅ variant_id (IMPORTANT)

      });

      returnStmt.finalize();

      // ================= SALES ENTRY =================
      db.run(`
        INSERT INTO sales (invoice_no, date, subtotal, discount, total)
        VALUES (?, ?, ?, ?, ?)
      `, [invoiceNo, date, subtotal, discount, total],
      function (err) {

        if (err) return reject(err);

        const saleId = this.lastID;

        // ================= SALE ITEMS =================
        const saleStmt = db.prepare(`
          INSERT INTO sale_items 
          (sale_id, product_id, variant_id, name, article, price, cost, qty, size, color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        items.forEach(item => {

          saleStmt.run(
            saleId,
            item.product_id,   // ✅ FIXED (product_id)
            item.variant_id,   // ✅ FIXED (variant_id)
            item.name,
            item.article,
            item.price,
            item.cost ?? item.price,
            item.qty,
            item.size,
            item.color
          );

          // STOCK -
          db.run(`
            UPDATE variants 
            SET stock = stock - ?
            WHERE id = ?
          `, [item.qty, item.variant_id]); // ✅ FIXED (variant_id)

        });

        saleStmt.finalize();

        // ================= INVOICE SAVE =================
        db.run(`
          INSERT INTO invoices 
          (invoice_no, type, items, return_items, subtotal, discount, total, date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          invoiceNo,
          "exchange",
          JSON.stringify(items),
          JSON.stringify(returnItems),
          subtotal,
          discount,
          total,
          date
        ]);

        resolve({
          success: true,
          invoiceNo
        });

      });

    } catch (err) {
      reject(err);
    }

  });

});
  // 💰 SAVE SALE
ipcMain.handle("save-sale", async (event, saleData) => {

  const { items, subtotal, discount, total } = saleData;

  const date = new Date().toISOString();
  const invoiceNo = await generateInvoiceNumber();

  return new Promise(async (resolve, reject) => {

    try {

      // ================= STOCK CHECK =================
      for (let item of items) {

        const stock = await new Promise((res, rej) => {
          db.get(
            "SELECT stock FROM variants WHERE id = ?",
            [item.variant_id],
            (err, row) => {
              if (err) return rej(err);
              res(row ? row.stock : 0);
            }
          );
        });

        // ❌ agar stock se zyada qty hui
        if (item.qty > stock) {
          return reject(new Error(`Not enough stock for ${item.name} (${item.size}/${item.color}) ❌`));
        }
      }

      // ================= INSERT SALE =================
      db.run(
        `INSERT INTO sales (invoice_no, date, subtotal, discount, total)
         VALUES (?, ?, ?, ?, ?)`,
        [invoiceNo, date, subtotal, discount, total],
        function (err) {

          if (err) return reject(err);

          const saleId = this.lastID;

          const stmt = db.prepare(`
            INSERT INTO sale_items 
            (sale_id, product_id, variant_id, name, article, price, cost, qty, size, color)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          items.forEach(item => {

            stmt.run(
              saleId,
              item.product_id,   // ✅ product_id (IMPORTANT)
              item.variant_id,   // ✅ variant_id (IMPORTANT)
              item.name,
              item.article,
              item.price,
              item.cost ?? item.price,
              item.qty,
              item.size,
              item.color
            );

            // ================= STOCK UPDATE =================
            db.run(`
              UPDATE variants 
              SET stock = stock - ?
              WHERE id = ?
            `,
            [item.qty, item.variant_id]);

          });

          stmt.finalize();
          db.run(`
            INSERT INTO invoices 
            (invoice_no, type, items, return_items, subtotal, discount, total, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            invoiceNo,
            "sale",
            JSON.stringify(items),
            JSON.stringify([]),
            subtotal,
            discount,
            total,
            date
          ]);
          resolve({
            success: true,
            invoiceNo
          });

        }
      );

    } catch (err) {
      reject(err);
    }

  });

});

//get invoice
ipcMain.handle("get-invoice", (event, invoiceNo) => {
  return new Promise((resolve, reject) => {

    db.get(`SELECT * FROM invoices WHERE invoice_no = ?`, [invoiceNo], (err, row) => {

      if (err) return reject(err);
      if (!row) return resolve(null);

      resolve({
        ...row,
        items: JSON.parse(row.items || "[]"),
        returnItems: JSON.parse(row.return_items || "[]")
      });

    });

  });
});

//  get all invoice 
ipcMain.handle("get-invoices", (event, { page, limit, search, filter }) => {
  return new Promise((resolve, reject) => {

    const offset = (page - 1) * limit;

    let where = `WHERE invoice_no LIKE ?`;
    let params = [`%${search || ""}%`];

    if (filter === "today") {
      where += ` AND date(date) = date('now')`;
    }

    if (filter === "week") {
      where += ` AND date(date) >= date('now', '-7 day')`;
    }

    if (filter === "month") {
      where += ` AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`;
    }

    // 🧾 DATA
    db.all(
      `SELECT * FROM invoices
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {

        if (err) return reject(err);

        // 📊 COUNT
        db.get(
          `SELECT COUNT(*) as total FROM invoices ${where}`,
          params,
          (err2, countRow) => {

            if (err2) return reject(err2);

            const totalPages = Math.ceil(countRow.total / limit);

            // 🔥 ANALYTICS (FULL DATA, NOT PAGINATION)
            db.get(
              `SELECT 
                COUNT(*) as totalInvoices,
                SUM(total) as totalSales,
                AVG(total) as avgSale
               FROM invoices ${where}`,
              params,
              (err3, stats) => {

                if (err3) return reject(err3);

                resolve({
                  data: rows,
                  totalPages,
                  analytics: stats
                });

              }
            );

          }
        );

      }
    );

  });
});

ipcMain.handle("get-sales-summary", (event, params) => {
  return new Promise((resolve, reject) => {

    const { filter, fromDate, toDate } = params;

    let where = "";
    let whereAlias = "";
    let whereReturn = "";

    let queryParams = [];

    // ================= SAFE DATE FILTER =================
    if (fromDate && toDate) {
      where = `WHERE date(date) BETWEEN date(?) AND date(?)`;
      whereAlias = `WHERE date(s.date) BETWEEN date(?) AND date(?)`;
      whereReturn = `WHERE date(date) BETWEEN date(?) AND date(?)`;

      queryParams = [fromDate, toDate];
    } 
    else if (fromDate && !toDate) {
      where = `WHERE date(date) = date(?)`;
      whereAlias = `WHERE date(s.date) = date(?)`;
      whereReturn = `WHERE date(date) = date(?)`;

      queryParams = [fromDate];
    } 
    else if (filter === "today") {
      where = "WHERE date(date) = date('now')";
      whereAlias = "WHERE date(s.date) = date('now')";
      whereReturn = "WHERE date(date) = date('now')";
    } 
    else if (filter === "week") {
      where = "WHERE date(date) >= date('now', '-6 day')";
      whereAlias = "WHERE date(s.date) >= date('now', '-6 day')";
      whereReturn = "WHERE date(date) >= date('now', '-6 day')";
    } 
    else if (filter === "month") {
      where = "WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')";
      whereAlias = "WHERE strftime('%Y-%m', s.date) = strftime('%Y-%m', 'now')";
      whereReturn = "WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')";
    }

    // ================= SALES =================
    db.get(`
      SELECT 
        COUNT(*) as totalInvoices,
        COALESCE(SUM(total), 0) as totalSales,
        COALESCE(SUM(discount), 0) as totalDiscount,
        COALESCE(AVG(total), 0) as avgSale
      FROM sales
      ${where}
    `, queryParams, (err, salesRow) => {

      if (err) return reject(err);

      // RETURNS
      db.get(`
        SELECT 
          COALESCE(SUM(total), 0) as totalReturns,
          COALESCE(SUM(qty), 0) as returnQty
        FROM return_items
        ${whereReturn}
      `, queryParams, (errR, returnRow) => {

        if (errR) return reject(errR);

        // PROFIT
        db.get(`
          SELECT 
            COALESCE(SUM((si.price - COALESCE(si.cost, 0)) * si.qty), 0) as profit
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          ${whereAlias}
        `, queryParams, (err2, profitRow) => {

          if (err2) return reject(err2);

          // RETURN LOSS
          db.get(`
            SELECT 
              COALESCE(SUM((price - COALESCE(cost, 0)) * qty), 0) as returnLoss
            FROM return_items
            ${whereReturn}
          `, queryParams, (errRL, returnLossRow) => {

            if (errRL) return reject(errRL);

            // PRODUCTS
            db.get(`
              SELECT 
                COALESCE(SUM(si.qty), 0) as totalProducts
              FROM sale_items si
              JOIN sales s ON si.sale_id = s.id
              ${whereAlias}
            `, queryParams, (err3, productRow) => {

              if (err3) return reject(err3);

              // EXPENSES
              db.get(`
                SELECT 
                  COALESCE(SUM(amount), 0) as totalExpenses
                FROM expenses
                ${where}
              `, queryParams, (err4, expenseRow) => {

                if (err4) return reject(err4);

                const finalSales = salesRow.totalSales - returnRow.totalReturns;
                const finalProducts = productRow.totalProducts - returnRow.returnQty;
                const finalProfit = profitRow.profit - returnLossRow.returnLoss;

                resolve({
                  totalInvoices: salesRow.totalInvoices,
                  totalSales: finalSales,
                  totalDiscount: salesRow.totalDiscount,
                  avgSale: salesRow.avgSale,
                  profit: finalProfit,
                  totalProducts: finalProducts,
                  returns: returnRow.totalReturns,
                  expenses: expenseRow.totalExpenses,
                  netProfit: finalProfit - expenseRow.totalExpenses
                });

              });

            });

          });

        });

      });

    });

  });
});

// Get Top Selling Products
ipcMain.handle("get-top-products", (event, params) => {
  return new Promise((resolve, reject) => {

    const { filter, fromDate, toDate } = params;

    let where = "";

    if (fromDate && toDate) {
      where = `WHERE date(s.date) BETWEEN date('${fromDate}') AND date('${toDate}')`;
    } 
    else if (fromDate && !toDate) {
      where = `WHERE date(s.date) = date('${fromDate}')`;
    } 
    else if (filter === "today") {
      where = "WHERE date(s.date) = date('now')";
    } 
    else if (filter === "week") {
      where = "WHERE date(s.date) >= date('now', '-6 day')";
    } 
    else if (filter === "month") {
      where = "WHERE strftime('%Y-%m', s.date) = strftime('%Y-%m', 'now')";
    }

    db.all(`
      SELECT 
      si.name,
      si.article,  
      si.size,
      si.color,
      SUM(si.qty) as totalQty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${where}
      GROUP BY si.name, si.article, si.size, si.color
      ORDER BY totalQty DESC
      LIMIT 5
    `, [], (err, rows) => {

      if (err) return reject(err);

      resolve(rows);
    });

  });
});

// ➕ ADD EXPENSE
ipcMain.handle("add-expense", (event, data) => {
  return new Promise((resolve, reject) => {

    const { title, amount } = data;
    const date = new Date().toISOString();

    db.run(
      `INSERT INTO expenses (title, amount, date) VALUES (?, ?, ?)`,
      [title, amount, date],
      (err) => {
        if (err) return reject(err);
        resolve(true);
      }
    );

  });
});

//  Get all expenses
ipcMain.handle("get-expenses", () => {
  return new Promise((resolve, reject) => {

    db.all(`SELECT * FROM expenses ORDER BY id DESC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });

  });
});

// ✏️ UPDATE EXPENSE
ipcMain.handle("update-expense", (event, data) => {
  return new Promise((resolve, reject) => {

    const { id, title, amount } = data;

    db.run(`
      UPDATE expenses 
      SET title = ?, amount = ?
      WHERE id = ?
    `, [title, amount, id], function(err) {

      if (err) return reject(err);

      resolve(true);
    });

  });
});


// 🗑 DELETE EXPENSE
ipcMain.handle("delete-expense", (event, id) => {
  return new Promise((resolve, reject) => {

    db.run(`
      DELETE FROM expenses WHERE id = ?
    `, [id], function(err) {

      if (err) return reject(err);

      resolve(true);
    });

  });
});
  initDB();
  createWindow();
});
