const { ipcRenderer } = require('electron');

let items = JSON.parse(localStorage.getItem("cart")) || [];
let discountValue = 0;
let discountType = "fixed";

let isPrinting = false;

const input = document.getElementById("searchInput");

// ================= SAVE CART =================
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(items));
}

// ================= LOAD =================

// ================= SEARCH =================
input.addEventListener("input", async () => {

  const value = input.value.trim();

  if (value.length >= 8) {

    const results = await ipcRenderer.invoke("search-product", value);

    if (results && results.length > 0) {

      addItem(results[0]);

      // 🔊 beep
      //document.getElementById("beep").play();
      const beep = document.getElementById("beep");
if (beep) beep.play();
      input.value = "";

    } else {
      showToast("Product not found ❌", "error");
    }
  }
});

// ================= ADD ITEM =================
function addItem(product) {

  const existing = items.find(i =>
  i.id === product.variant_id &&
  i.size === product.size &&
  i.color === product.color
  );

  if (existing) {
    existing.qty += 1;
  } else {
    items.push({
      id: product.variant_id,
      name: product.name || "No Name",
      price: Number(product.price) || 0,
      cost: Number(product.cost_price), // 🔥 ADD THIS
      qty: 1,
      size: product.size || "-",
      color: product.color || "-"
    });
  }

  saveCart();
  renderItems();
}

// ================= REMOVE ITEM =================
function removeItem(id) {
  items = items.filter(i => i.id !== id);
  saveCart();
  renderItems();
}

// ================= CHANGE QTY =================
function changeQty(id, change) {
  const item = items.find(i => i.id === id);
  item.qty += change;

  if (item.qty <= 0) {
    removeItem(id);
    return;
  }

  saveCart();
  renderItems();
}

// ================= RENDER =================
function renderItems() {

  const container = document.getElementById("items");
  container.innerHTML = "";

  items.forEach(item => {

    const div = document.createElement("div");

    div.className = "flex justify-between items-center bg-white p-4 rounded-xl shadow";

    div.innerHTML = `
      <div>
        <div class="text-xl font-bold">${item.name}</div>

        <div class="text-gray-500 text-sm">
          Size: ${item.size} | Color: ${item.color}
        </div>

        <div class="text-gray-500 text-sm">
          ${item.price} × ${item.qty}
        </div>
      </div>

      <div class="flex items-center gap-3">

        <button onclick="changeQty(${item.id}, -1)" 
          class="bg-gray-200 px-3 py-1 rounded text-xl">-</button>

        <span class="text-xl font-bold">${item.qty}</span>

        <button onclick="changeQty(${item.id}, 1)" 
          class="bg-gray-200 px-3 py-1 rounded text-xl">+</button>

        <button onclick="removeItem(${item.id})" 
          class="bg-red-500 text-white px-3 py-1 rounded text-xl">
          ✕
        </button>

      </div>

      <div class="text-2xl font-bold">
        ${item.price * item.qty}
      </div>
    `;

    container.appendChild(div);
  });

  calculateTotals();
}

// ================= TOTALS =================
function calculateTotals() {

  let subtotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0);

  let discount = discountType === "percent"
    ? subtotal * (discountValue / 100)
    : discountValue;

  if (discount > subtotal) discount = subtotal;

  let total = subtotal - discount;

  document.getElementById("subtotal").innerText = subtotal;
  document.getElementById("discount").innerText = discount;
  document.getElementById("total").innerText = total;
}

// ================= DISCOUNT =================
function handleDiscountInput() {
  const value = parseFloat(document.getElementById("discountInput").value);
  const type = document.getElementById("discountType").value;

  discountValue = isNaN(value) ? 0 : value;
  discountType = type;

  calculateTotals();
}

// ================= SAVE SALE =================

async function saveSale() {

  let subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  let discount = discountType === "percent"
    ? subtotal * (discountValue / 100)
    : discountValue;

  if (discount > subtotal) discount = subtotal;

  let total = subtotal - discount;

  const res = await ipcRenderer.invoke("save-sale", {
    items,
    subtotal,
    discount,
    total
  });

  return res.invoiceNo;
}

// ================= PRINT =================//

async function printBill() {

  console.log("🔥 PRINT BUTTON CLICKED");

  if (isPrinting) return;
  isPrinting = true;

  if (items.length === 0) {
    showToast("No items ❌", "error");
    isPrinting = false;
    return;
  }

  const invoiceNo = await saveSale();

  let subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  let discount = discountType === "percent"
    ? subtotal * (discountValue / 100)
    : discountValue;

  if (discount > subtotal) discount = subtotal;

  let total = subtotal - discount;

  const billData = { items, subtotal, discount, total, invoiceNo };

  console.log("📤 Sending to thermal printer...");

  try {
    await ipcRenderer.invoke("print-thermal", billData);

    showToast("Printed 🖨️", "success");

    items = [];
    localStorage.removeItem("cart");
    renderItems();

  } catch (err) {
    console.log("❌ PRINT ERROR:", err);
    showToast("Print failed ❌", "error");
  }

  isPrinting = false;
}



// ================= ENTER KEY =================
document.addEventListener("keydown", (e) => {

  if (e.key === "Enter") {

    if (document.activeElement.id === "searchInput") return;

    if (document.activeElement.id === "discountInput") {
      handleDiscountInput();
    }

    printBill();
  }
});
async function checkPrinters() {
  const printers = await ipcRenderer.invoke("get-printers");
  console.log("PRINTERS:", printers);
}
/*function generateReceiptHTML(data) {

  const { items, subtotal, discount, total } = data;

  const date = new Date();

  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString();

  const invoiceNo = "INV-" + Date.now().toString().slice(-6);

  let itemsHTML = "";

  items.forEach(i => {
    itemsHTML += `
      <div class="item">
        <div class="name">${i.name}</div>
        <div class="meta">${i.size} | ${i.color}</div>

        <div class="row">
          <span>${i.qty} x ${i.price}</span>
          <span>${i.qty * i.price}</span>
        </div>
      </div>
    `;
  });

  return `
  <html>
  <head>
    <style>
      body {
        font-family: monospace;
        width: 280px;
        margin: 0;
        padding: 10px;
        color: #000;
      }

      .center {
        text-align: center;
      }

      .title {
        font-size: 18px;
        font-weight: bold;
      }

      .small {
        font-size: 12px;
        color: #444;
      }

      .line {
        border-top: 1px dashed black;
        margin: 6px 0;
      }

      .item {
        margin-bottom: 6px;
      }

      .name {
        font-weight: bold;
        font-size: 13px;
      }

      .meta {
        font-size: 11px;
        color: #555;
      }

      .row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
      }

      .total {
        font-weight: bold;
        font-size: 16px;
      }
    </style>
  </head>

  <body>

    <!-- HEADER -->
    <div class="center">
      <div class="title">UNITED SHOES</div>
      <div class="small">Quality Footwear Store</div>
      <div class="small">Ph: 03XX-XXXXXXX</div>
    </div>

    <div class="line"></div>

    <!-- INFO -->
    <div class="small">Invoice: ${invoiceNo}</div>
    <div class="small">Date: ${dateStr}</div>
    <div class="small">Time: ${timeStr}</div>

    <div class="line"></div>

    <!-- ITEMS -->
    ${itemsHTML}

    <div class="line"></div>

    <!-- TOTALS -->
    <div class="row">
      <span>Subtotal</span>
      <span>${subtotal}</span>
    </div>

    <div class="row">
      <span>Discount</span>
      <span>${discount}</span>
    </div>

    <div class="row total">
      <span>TOTAL</span>
      <span>${total}</span>
    </div>

    <div class="line"></div>

    <!-- FOOTER -->
    <div class="center small">
      Thank you for shopping 🙏<br>
      Visit Again
    </div>

  </body>
  </html>
  `;
}*/

function generateReceiptHTML(data) {

  const { items, subtotal, discount, total, invoiceNo } = data;

  const date = new Date();

  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString();

  let itemsHTML = "";

  items.forEach(i => {
    itemsHTML += `
      <div class="item">
        <div class="name">${i.name}</div>
        <div class="meta">${i.size} | ${i.color}</div>

        <div class="row">
          <span>${i.qty} x ${Number(i.price).toFixed(0)}</span>
          <span>${(i.qty * i.price).toFixed(0)}</span>
        </div>
      </div>
    `;
  });

  return `
  <html>
  <head>
    <style>
      body {
        font-family: monospace;
        width: 280px;
        margin: 0;
        padding: 10px;
        color: #000;
      }

      .center {
        text-align: center;
      }

      .title {
        font-size: 18px;
        font-weight: bold;
        letter-spacing: 1px;
      }

      .small {
        font-size: 12px;
        color: #444;
      }

      .line {
        border-top: 1px dashed black;
        margin: 8px 0;
      }

      .item {
        margin-bottom: 8px;
      }

      .name {
        font-weight: bold;
        font-size: 13px;
      }

      .meta {
        font-size: 11px;
        color: #666;
      }

      .row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
      }

      .total {
        font-weight: bold;
        font-size: 16px;
      }
    </style>
  </head>

  <body>

    <!-- HEADER -->
    <div class="center">
      <div class="title">UNITED SHOES</div>
      <div class="small">Quality Footwear Store</div>
      <div class="small">Ph: 03XX-XXXXXXX</div>
    </div>

    <div class="line"></div>

    <!-- INFO -->
    <div class="small">Invoice: ${invoiceNo || "N/A"}</div>
    <div class="small">Date: ${dateStr}</div>
    <div class="small">Time: ${timeStr}</div>

    <div class="line"></div>

    <!-- ITEMS -->
    ${itemsHTML}

    <div class="line"></div>

    <!-- TOTALS -->
    <div class="row">
      <span>Subtotal</span>
      <span>${Number(subtotal).toFixed(0)}</span>
    </div>

    <div class="row">
      <span>Discount</span>
      <span>${Number(discount).toFixed(0)}</span>
    </div>

    <div class="row total">
      <span>TOTAL</span>
      <span>${Number(total).toFixed(0)}</span>
    </div>

    <div class="line"></div>

    <!-- FOOTER -->
    <div class="center small">
      Thank you for shopping 🙏<br>
      Visit Again
    </div>

  </body>
  </html>
  `;
}

// ================= NAVIGATION =================
function goToReports() {
  window.location.href = "reports.html";
}

function goToAddProduct() {
  window.location.href = "add-product.html";
}

function goToProducts() {
  window.location.href = "product-list.html";
}
function goToInvoices() {
  window.location.href = "invoices.html";
}

window.onload = () => {

  const saved = localStorage.getItem("cart");

  if (saved) {
    items = JSON.parse(saved);
  }

  renderItems();
};
window.printBill = printBill;
