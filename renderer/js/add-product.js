const { ipcRenderer } = require('electron');

let variants = [];

// ✅ NEW BARCODE (independent)
function generateBarcode() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

function showMessage(text, type = "error") {
  const box = document.getElementById("messageBox");

  box.innerText = text;

  box.className = type === "error"
    ? "p-3 rounded mb-3 text-white bg-red-500"
    : "p-3 rounded mb-3 text-white bg-green-500";

  box.classList.remove("hidden");

  setTimeout(() => {
    box.classList.add("hidden");
  }, 2500);
}

function addVariant() {
  const id = Date.now();

  variants.push({
    id,
    size: "",
    color: "",
    cost: 0,
    price: 0,
    stock: 0,
    barcode: generateBarcode() // ✅ generate instantly
  });

  renderVariants();
}

function renderVariants() {

  const container = document.getElementById("variants");
  container.innerHTML = "";

  variants.forEach(v => {

    const div = document.createElement("div");

    div.className = "grid grid-cols-7 gap-3 items-center bg-gray-50 p-3 rounded-xl shadow-sm";

    div.innerHTML = `
      <input value="${v.size || ''}" placeholder="Size"
        oninput="updateVariant(${v.id}, 'size', this.value)"
        class="p-3 border rounded-lg" />

      <input value="${v.color || ''}" placeholder="Color"
        oninput="updateVariant(${v.id}, 'color', this.value)"
        class="p-3 border rounded-lg" />

      <input type="number" value="${v.cost || ''}" placeholder="Cost"
        oninput="updateVariant(${v.id}, 'cost', this.value)"
        class="p-3 border rounded-lg" />

      <input type="number" value="${v.price || ''}" placeholder="Price"
        oninput="updateVariant(${v.id}, 'price', this.value)"
        class="p-3 border rounded-lg" />

      <input type="number" value="${v.stock || ''}" placeholder="Stock"
        oninput="updateVariant(${v.id}, 'stock', this.value)"
        class="p-3 border rounded-lg" />

      <input value="${v.barcode}" readonly
        class="p-3 border bg-gray-100 rounded-lg text-sm" />

      <button onclick="deleteVariant(${v.id})"
        class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg">
        ✕
      </button>
    `;

    container.appendChild(div);
  });
}

function updateVariant(id, field, value) {

  const v = variants.find(v => v.id === id);
  if (!v) return;

  v[field] = (field === "cost" || field === "price" || field === "stock")
    ? Number(value)
    : value;
}

function deleteVariant(id) {
  variants = variants.filter(v => v.id !== id);
  renderVariants();
}

async function saveProduct() {

  const name = document.getElementById("name").value.trim();
  const article = document.getElementById("article").value.trim();

  if (!name) {
    showMessage("Product name required ❌");
    return;
  }

  if (variants.length === 0) {
    showMessage("Add at least one variant ❌");
    return;
  }

  for (let v of variants) {

    if (!v.size || !v.color) {
      showMessage("Size & Color required ❌");
      return;
    }

    if (!v.price || v.price <= 0) {
      showMessage("Invalid price ❌");
      return;
    }

    if (!v.barcode) {
      v.barcode = generateBarcode();
    }
  }

  await ipcRenderer.invoke("add-product", {
    name,
    article,
    variants
  });

  showMessage("Saved successfully ✅", "success");

  document.getElementById("name").value = "";
  document.getElementById("article").value = "";
  variants = [];
  renderVariants();
}

function goBack() {
  window.location.href = "index.html";
}