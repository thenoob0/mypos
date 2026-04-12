const { ipcRenderer } = require("electron");

const nameInput = document.getElementById("name");
const articleInput = document.getElementById("article");

let variants = [];
let productId = new URLSearchParams(window.location.search).get("id");

// ✅ SAME barcode generator
function generateBarcode() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

async function loadProduct() {
  const data = await ipcRenderer.invoke("get-product-by-id", productId);

  nameInput.value = data.name || "";
  articleInput.value = data.article || "";

  variants = (data.variants || []).map(v => ({
    id: v.id,
    size: v.size || "",
    color: v.color || "",
    cost: v.cost_price || 0,
    price: v.sale_price || 0,
    stock: v.stock || 0,
    barcode: v.barcode || ""
  }));

  renderVariants();
}

function addVariant() {
  variants.push({
    id: Date.now(),
    size: "",
    color: "",
    cost: 0,
    price: 0,
    stock: 0,
    barcode: generateBarcode() // ✅ only here
  });
  renderVariants();
}

function deleteVariant(id) {
  if (!confirm("Delete variant?")) return;
  variants = variants.filter(v => v.id !== id);
  showToast("Variant removed", "error");
  renderVariants();
}

function updateVariant(id, field, value) {

  const v = variants.find(v => v.id == id);

  v[field] = (field === "cost" || field === "price" || field === "stock")
    ? Number(value)
    : value;

  // ❌ barcode untouched
}

function renderVariants() {
  const container = document.getElementById("variants");
  container.innerHTML = "";

  variants.forEach(v => {
    const div = document.createElement("div");
    div.className = "grid grid-cols-7 gap-2 mb-2";

    div.innerHTML = `
      <input value="${v.size}" placeholder="Size" onchange="updateVariant(${v.id}, 'size', this.value)" class="p-2 border rounded"/>
      <input value="${v.color}" placeholder="Color" onchange="updateVariant(${v.id}, 'color', this.value)" class="p-2 border rounded"/>
      <input type="number" value="${v.cost}" onchange="updateVariant(${v.id}, 'cost', this.value)" class="p-2 border rounded"/>
      <input type="number" value="${v.price}" onchange="updateVariant(${v.id}, 'price', this.value)" class="p-2 border rounded"/>
      <input type="number" value="${v.stock}" onchange="updateVariant(${v.id}, 'stock', this.value)" class="p-2 border rounded"/>
      <input value="${v.barcode}" readonly class="p-2 border bg-gray-100 rounded"/>
      <button onclick="deleteVariant(${v.id})" class="bg-red-500 text-white rounded">X</button>
    `;

    container.appendChild(div);
  });
}

function validate() {

  if (!nameInput.value.trim()) return "Product name required";

  const barcodes = new Set();

  for (let v of variants) {

    if (!v.size || !v.color) return "Size & Color required";

    if (!v.barcode) return "Barcode missing";

    if (v.stock < 0) return "Stock cannot be negative";

    if (barcodes.has(v.barcode)) return "Duplicate barcode";

    barcodes.add(v.barcode);
  }

  return null;
}

async function updateProduct() {
  const error = validate();
  if (error) return showToast(error, "error");

  const btn = document.getElementById("saveBtn");
  btn.innerText = "Saving...";
  btn.disabled = true;

  try {
    await ipcRenderer.invoke("update-product", {
      id: productId,
      name: nameInput.value.trim(),
      article: articleInput.value.trim(),
      variants
    });

    showToast("Product updated ✅", "success");

    setTimeout(() => {
      window.location.href = "product-list.html";
    }, 1000);

  } catch (err) {
    showToast("Error saving product", "error");
  }

  btn.innerText = "Save Changes";
  btn.disabled = false;
}

function goBack() {
  window.location.href = "product-list.html";
}

loadProduct();