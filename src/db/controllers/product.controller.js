const db = require('../db/db');

function getByBarcode(barcode) {
  return new Promise((resolve, reject) => {

    const query = `
      SELECT 
        p.name,
        p.article,
        v.size,
        v.color,
        p.sale_price as price,
        v.id as variant_id
      FROM variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.barcode = ?
    `;

    db.get(query, [barcode], (err, row) => {
      console.log("DB RESULT:", row);
      if (err) reject(err);
      else resolve(row);
    });

  });
}

module.exports = { getByBarcode };