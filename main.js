const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const escpos = require('@node-escpos/core');
const USB = require('@node-escpos/usb-adapter');

const dbPath = path.join(__dirname, 'database', 'pos.db');
const db = new sqlite3.Database(dbPath);

// ================= DB INIT =================
function initDB() {
  db.serialize(() => {

    console.log("Initializing DB...");

    // PRODUCTS
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        article TEXT
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
      items TEXT,
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
      name TEXT,
      price REAL,
      cost REAL,
      qty INTEGER,
      size TEXT,
      color TEXT
      )
   `);
    

  });
}

function generateInvoiceNumber() {
  return new Promise((resolve, reject) => {

    const today = new Date().toISOString().slice(0, 10);

    db.get(
      `SELECT COUNT(*) as count FROM sales WHERE date LIKE ?`,
      [`${today}%`],
      (err, row) => {

        if (err) return reject(err);

        const number = row.count + 1;
        const formatted = String(number).padStart(3, '0');
        const datePart = today.replace(/-/g, "");

        resolve(`INV-${datePart}-${formatted}`);
      }
    );

  });
}

// ================= WINDOW =================
async function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('renderer/index.html');

  // ✅ YAHAN ADD KARO
  const printers = await win.webContents.getPrintersAsync();

  console.log("🖨️ Available Printers:");
  printers.forEach(p => {
    console.log("👉", p.name);
  });
}

// ================= APP READY =================
app.whenReady().then(() => {

  initDB();

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

        const { items, subtotal, discount, total, invoiceNo } = data;

        const safeInvoice = (invoiceNo || "INV000001").toString().trim();
        const barcodeData = String(safeInvoice || "INV000001")
        .replace(/\s/g, '')
        .trim();

        const WIDTH = 42;

        const line = (left, right) => {
          left = String(left || "");
          right = String(right || "");

          if (left.length > 26) left = left.slice(0, 26);

          const spaces = WIDTH - (left.length + right.length);
          return left + " ".repeat(spaces > 0 ? spaces : 1) + right;
        };

        const divider = "=".repeat(WIDTH);
        const smallDivider = "-".repeat(WIDTH);
        
        const now = new Date();

        // ================= HEADER =================
        printer
          .align('CT')
          .style('B')
          .size(2, 1)
          .text('UNITED SHOES')

          .size(1, 1)
          .style('NORMAL')
          .text('Premium Footwear')

          .align('CT') // ✅ FIX
          .text(divider);

        // ================= INFO =================
        printer
          .align('CT')
          .text(line("Invoice", safeInvoice))
          .text(line("Date", now.toLocaleDateString()))
          .text(line("Time", now.toLocaleTimeString()))

          .align('CT') // ✅ FIX
          .text(divider);

        // ================= ITEMS =================
        items.forEach(i => {

          const name = (i.name || "Item").toString();
          const size = i.size || "-";
          const color = i.color || "-";
          const qty = i.qty || 0;
          const price = i.price || 0;
          
          printer
            .align('CT')
            .style('B')
            .text(name.slice(0, 30));

          printer
            .style('NORMAL')
            .align('CT') // ✅ FIX (center meta)
            .text(`${size} | ${color}`);

          printer
            .align('CT')
            .text(line(`${qty} x ${price}`, `${qty * price}`));

          printer.feed(1);
        });

        printer
          .align('CT') // ✅ FIX
          .text(divider);

        // ================= TOTAL =================
        printer
          .align('CT')
          .text(line("Subtotal", subtotal))
          .text(line("Discount", discount))

          .align('CT') // ✅ FIX
          .text(smallDivider);

        printer
          .align('CT')
          .style('B')
          .size(2, 2)
          .text(`Rs ${total}`);

        printer
          .size(1, 1)
          .style('NORMAL')

          .align('CT') // ✅ FIX
          .text(divider);

        // ================= BARCODE =================
        printer
          .align('CT')
          .text('SCAN FOR INVOICE')
          .feed(1)
          
          .barcode(barcodeData, 'CODE128', {
            width: 2,
            height: 60,
            position: 'BELOW'
          });

        // ================= FOOTER =================
        printer
          .feed(1)
          .align('CT') // ✅ FIX
          .text('Thank you for shopping')

          .style('B')
          .text('UNITED SHOES')

          .style('NORMAL')
          .text('Quality - Comfort - Style')

          .feed(1)
          .text('Exchange within 7 days')

          .feed(4)
          .cut()
          .close();

        resolve(true);

      } catch (err) {
        console.error("Print error:", err);
        reject(err);
      }

    });

  });

});

//barcode
ipcMain.handle("print-bill", async (event, html) => {

  const printWin = new BrowserWindow({
    show: false
  });

  // ❗ IMPORTANT: encodeURIComponent NA use karo
  await printWin.loadURL(
    "data:text/html;charset=utf-8," + html
  );

  // render wait
  await new Promise(resolve => setTimeout(resolve, 500));

  return new Promise((resolve) => {

    printWin.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: "BIXOLON SLP-T400" // 👈 yahan apna label printer name daalna
    }, (success, error) => {

      console.log("🖨️ LABEL PRINT:", success, error);

      printWin.close();
      resolve(success);

    });

  });

});



  // 🔍 SEARCH PRODUCT
  ipcMain.handle("search-product", (event, value) => {
    return new Promise((resolve, reject) => {

      db.all(
        `SELECT 
          variants.id as variant_id,
          products.name,
          products.article,
          variants.size,
          variants.color,
          variants.sale_price as price,
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

  // ✏️ UPDATE PRODUCT
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
});

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

  // 💰 SAVE SALE
ipcMain.handle("save-sale", async (event, saleData) => {

  const { items, subtotal, discount, total } = saleData;

  const date = new Date().toISOString();
  const invoiceNo = await generateInvoiceNumber();

  return new Promise((resolve, reject) => {

    db.run(
      `INSERT INTO sales (invoice_no, date, subtotal, discount, total)
       VALUES (?, ?, ?, ?, ?)`,
      [invoiceNo, date, subtotal, discount, total],
      function (err) {

        if (err) return reject(err);

        const saleId = this.lastID;

        const stmt = db.prepare(`
          INSERT INTO sale_items 
          (sale_id, product_id, name, price, cost, qty, size, color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        items.forEach(item => {
          stmt.run(
            saleId,
            item.id,
            item.name,
            item.price,
            item.cost || 0, // ✅ safe
            item.qty,
            item.size,
            item.color
          );

          // stock update
          db.run(`
            UPDATE variants 
            SET stock = CASE 
              WHEN stock >= ? THEN stock - ? 
              ELSE 0 
            END
            WHERE id = ?`,
            [item.qty, item.qty, item.id]
          );
        });

        stmt.finalize();

        resolve({
          success: true,
          invoiceNo
        });

      }
    );

  });

});

//get invoice
ipcMain.handle("get-invoice", (event, invoiceNo) => {
  return new Promise((resolve, reject) => {

    db.get(`SELECT * FROM sales WHERE invoice_no = ?`, [invoiceNo], (err, sale) => {

      if (err) return reject(err);
      if (!sale) return resolve(null);

      db.all(`SELECT * FROM sale_items WHERE sale_id = ?`, [sale.id], (err2, items) => {

        if (err2) return reject(err2);

        resolve({
          ...sale,
          items
        });

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
      `SELECT * FROM sales
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {

        if (err) return reject(err);

        // 📊 COUNT
        db.get(
          `SELECT COUNT(*) as total FROM sales ${where}`,
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
               FROM sales ${where}`,
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



ipcMain.handle("get-sales-summary", (event, filter) => {
  return new Promise((resolve, reject) => {

    let where = "";

    if (filter === "today") {
      where = "WHERE date(date) = date('now')";
    }

    if (filter === "week") {
      where = "WHERE date(date) >= date('now', '-6 day')";
    }

    if (filter === "month") {
      where = "WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')";
    }

    // SALES DATA
    db.get(`
      SELECT 
        COUNT(*) as totalInvoices,
        COALESCE(SUM(total), 0) as totalSales,
        COALESCE(SUM(discount), 0) as totalDiscount,
        COALESCE(AVG(total), 0) as avgSale
      FROM sales
      ${where}
    `, [], (err, salesRow) => {

      if (err) return reject(err);

      // PROFIT DATA
      db.get(`
        SELECT 
          COALESCE(SUM((price - cost) * qty), 0) as profit
        FROM sale_items
      `, [], (err2, profitRow) => {

        if (err2) return reject(err2);

        resolve({
          ...salesRow,
          profit: profitRow.profit
        });

      });

    });

  });
});


  

  createWindow();
});
