const { ipcRenderer } = require("electron");
const bwipjs = require("bwip-js");

let productId = new URLSearchParams(window.location.search).get("id");
let product = null;
let variants = [];

// LOAD PRODUCT
async function loadProduct() {

  const data = await ipcRenderer.invoke("get-product-by-id", productId);

  product = data;
  variants = data.variants || [];

  document.getElementById("title").innerText =
    `${data.name} (${data.article})`;

  renderTable();
}

// TABLE
function renderTable() {

  const table = document.getElementById("table");
  table.innerHTML = "";

  variants.forEach(v => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="p-3">
        <input type="checkbox" class="chk" data-id="${v.id}">
      </td>

      <td class="p-3">${v.size}</td>
      <td class="p-3">${v.color}</td>
      <td class="p-3">${v.sale_price}</td>
      <td class="p-3">${v.stock}</td>

      <td class="p-3">${v.barcode}</td>

      <td class="p-3">
        <input type="number" value="1" class="qty border p-1 w-16" data-id="${v.id}">
      </td>
    <td class="p-3">
        <div id="label-${v.id}"></div>
    </td>
      <td class="p-3 text-center">
        <button onclick="printSingle(${v.id})"
          class="bg-blue-500 text-white px-3 py-1 rounded">
          Print
        </button>
      </td>
    `;

    table.appendChild(tr);
  });

variants.forEach(v => {
  generateLabelPreview(v);
});

}

// SELECT ALL
function toggleAll(el) {
  document.querySelectorAll(".chk").forEach(c => {
    c.checked = el.checked;
  });
}

// PRINT SINGLE
function printSingle(id) {

  const v = variants.find(x => x.id == id);
  const qty = document.querySelector(`.qty[data-id='${id}']`).value;

  printLabels([v], qty);
}

// PRINT SELECTED
function printSelected() {

  const selected = [];

  document.querySelectorAll(".chk:checked").forEach(c => {
    const id = c.dataset.id;
    const v = variants.find(x => x.id == id);
    const qty = document.querySelector(`.qty[data-id='${id}']`).value;

    selected.push({ ...v, qty });
  });

  if (selected.length === 0) {
    alert("Select at least one variant");
    return;
  }

  printLabels(selected);
}

// MAIN PRINT
async function printLabels(list, forceQty = null) {

  const showShop = document.getElementById("showShop").checked;
  const showPrice = document.getElementById("showPrice").checked;
  const showSize = document.getElementById("showSize").checked;
  const showColor = document.getElementById("showColor").checked;

  let html = `
<div style="
  display:flex;
  flex-wrap:wrap;
  gap:5px;
  width:100%;
">
`;

  for (let item of list) {

    const qty = forceQty || item.qty || 1;

    for (let i = 0; i < qty; i++) {

      // 🔥 FIX: buffer instead of canvas
      const png = await bwipjs.toBuffer({
        bcid: "code128",
        text: item.barcode,
        scale: 2,
        height: 10,
        includetext: true
      });

      const base64 = png.toString("base64");

      html += `
        <div style="
  width:180px;
  height:90px;
  border:1px solid #000;
  padding:4px;
  text-align:center;
  font-size:10px;
">
          ${showShop ? `<div style="font-size:10px;font-weight:bold">UNITED SHOES</div>` : ""}
          <div style="font-size:10px">${product.name}</div>
          ${showSize ? `<div style="font-size:10px">Size: ${item.size}</div>` : ""}
          ${showColor ? `<div style="font-size:10px">${item.color}</div>` : ""}
          ${showPrice ? `<div style="font-size:10px">Rs ${item.sale_price}</div>` : ""}
          
          <img src="data:image/png;base64,${base64}" style="width:100%; height:auto;" />
        </div>
      `;
    }
  }

  html += `</div>`;

  await ipcRenderer.invoke("print-bill", html);
}

async function generateBarcodeImage(barcode, id) {

  try {

    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: barcode,
      scale: 2,
      height: 8,
      includetext: false
    });

    const base64 = png.toString("base64");

    const img = document.getElementById(`img-${id}`);
    if (img) {
      img.src = `data:image/png;base64,${base64}`;
    }

  } catch (err) {
    console.error("Barcode error:", err);
  }
}

async function generateLabelPreview(v) {

  try {

    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: v.barcode,
      scale: 2,
      height: 10,
      includetext: true
    });

    const base64 = png.toString("base64");

    const html = `
      <div style="
        width:140px;
        border:1px solid #ddd;
        padding:5px;
        text-align:center;
        background:white;
        font-family:monospace;
      ">
        <div style="font-size:10px;font-weight:bold">
          UNITED SHOES
        </div>

        <div style="font-size:10px">
          ${product.name}
        </div>

        <div style="font-size:10px">
          ${v.size} | ${v.color}
        </div>

        <div style="font-size:10px">
          Rs ${v.sale_price}
        </div>

        <img src="data:image/png;base64,${base64}" style="width:100%" />
      </div>
    `;

    const div = document.getElementById(`label-${v.id}`);
    if (div) div.innerHTML = html;

  } catch (err) {
    console.error(err);
  }
}
// BACK
function goBack() {
  window.location.href = "product-list.html";
}

loadProduct();