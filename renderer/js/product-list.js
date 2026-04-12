const { ipcRenderer } = require("electron");

let page = 1;
let limit = 10;
let totalPages = 1;

async function loadProducts() {

  const search = document.getElementById("search").value;
  const sort = document.getElementById("sort").value;
  const filter = document.getElementById("filter").value;

  const result = await ipcRenderer.invoke("get-products", {
    page,
    limit,
    search,
    sort,
    filter
  });

  const table = document.getElementById("productTable");
  table.innerHTML = "";

  if (!result.products.length) {
    showToast("Product not found ❌", "error");
    return;
  }

  result.products.forEach(p => {

    const tr = document.createElement("tr");
    tr.className = "border-t";

    tr.innerHTML = `
  <td class="p-3">${p.name}</td>
  <td class="p-3">${p.article}</td>
  <td class="p-3 ${p.stock <= 2 ? 'text-red-500 font-bold' : ''}">
    ${p.stock || 0}
  </td>
  <td class="p-3">${p.variantCount}</td>

  <td class="p-3 text-center">
    <div class="flex justify-center gap-2">
      <button onclick="editProduct(${p.id})"
        class="bg-blue-500 text-white px-3 py-1 rounded">
        Edit
      </button>
      <button onclick="openDetail(${p.id})"
        class="bg-green-500 text-white px-3 py-1 rounded">
        Barcode
      </button>
      <button onclick="deleteProduct(${p.id})"
        class="bg-red-500 text-white px-3 py-1 rounded">
        Delete
      </button>
    </div>
  </td>
`;

    table.appendChild(tr);
  });

  totalPages = result.totalPages;
  renderPages();
}

// PAGINATION BUTTONS
function renderPages() {
  const div = document.getElementById("pages");
  div.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.innerText = i;
    btn.className = `px-3 py-1 rounded ${i === page ? 'bg-blue-500 text-white' : 'bg-gray-300'}`;
    btn.onclick = () => {
      page = i;
      loadProducts();
    };
    div.appendChild(btn);
  }
}

function nextPage() {
  if (page < totalPages) {
    page++;
    loadProducts();
  }
}

function prevPage() {
  if (page > 1) {
    page--;
    loadProducts();
  }
}

function changeLimit() {
  limit = Number(document.getElementById("limit").value);
  page = 1;
  loadProducts();
}

// DELETE
async function deleteProduct(id) {
  if (!confirm("Delete product?")) return;

  await ipcRenderer.invoke("delete-product", id);
  showToast("Deleted ✅", "success");
  loadProducts();
}

// EDIT
function editProduct(id) {
  window.location.href = `edit-product.html?id=${id}`;
}
function openDetail(id) {
  window.location.href = `product-detail.html?id=${id}`;
}
function goBack() {
  window.location.href = "index.html"; // ya jo tumhari main screen hai
}
loadProducts();