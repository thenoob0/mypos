const { ipcRenderer } = require("electron");

let page = 1;
let limit = 10;
let totalPages = 1;

// ================= LOAD =================
async function loadInvoices() {

  const search = document.getElementById("searchInput").value;
  const filter = document.getElementById("filter").value;

  const result = await ipcRenderer.invoke("get-invoices", {
    page,
    limit,
    search,
    filter
  });

  const table = document.getElementById("table");
  table.innerHTML = "";

  if (!result.data.length) {
    table.innerHTML = `
      <tr>
        <td colspan="4" class="text-center p-4 text-gray-500">
          No invoices found
        </td>
      </tr>
    `;
    return;
  }

  result.data.forEach(inv => {

    const tr = document.createElement("tr");
    tr.className = "border-t hover:bg-gray-50";

    tr.innerHTML = `
      <td class="p-3 font-semibold">${inv.invoice_no}</td>

      <td class="p-3 text-gray-600">
        ${formatDateTime(inv.date)}
      </td>

      <td class="p-3 font-bold">Rs ${Number(inv.total).toFixed(0)}</td>

      <td class="p-3 text-center">
        <div class="flex gap-2 justify-center">

          <button onclick="viewInvoice('${inv.invoice_no}')"
            class="bg-blue-500 text-white px-3 py-1 rounded">
            View
          </button>

          <button onclick="printInvoice('${inv.invoice_no}')"
            class="bg-green-500 text-white px-3 py-1 rounded">
            Reprint
          </button>

          <!--<button onclick="downloadPDF('${inv.invoice_no}')"
            class="bg-purple-500 text-white px-3 py-1 rounded">
            PDF
          </button>-->

        </div>
      </td>
    `;

    table.appendChild(tr);
  });

  totalPages = result.totalPages;
  renderPagination();

  updateAnalytics(result.analytics);
}

// ================= DATE FORMAT =================
function formatDateTime(dateStr) {
  const d = new Date(dateStr);

  return d.toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ================= ANALYTICS =================
function updateAnalytics(stats) {

  document.getElementById("todaySales").innerText =
    (stats.totalSales || 0).toFixed(0);

  document.getElementById("totalInvoices").innerText =
    stats.totalInvoices || 0;

  document.getElementById("avgSale").innerText =
    (stats.avgSale || 0).toFixed(0);
}

// ================= PAGINATION =================
function renderPagination() {

  const div = document.getElementById("pages");
  div.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {

    const btn = document.createElement("button");

    btn.innerText = i;

    btn.className = `px-3 py-1 rounded ${
      i === page ? "bg-blue-500 text-white" : "bg-gray-300"
    }`;

    btn.onclick = () => {
      page = i;
      loadInvoices();
    };

    div.appendChild(btn);
  }
}

// ================= ACTIONS =================
async function viewInvoice(no) {
  const data = await ipcRenderer.invoke("get-invoice", no);
  if (!data) return alert("Not found");

  const html = generateReceiptHTML(data);

  const win = window.open("", "_blank");
  win.document.write(html);
}

async function printInvoice(no) {
  const data = await ipcRenderer.invoke("get-invoice", no);
  if (!data) return alert("Not found");

  const html = generateReceiptHTML(data);
  await ipcRenderer.invoke("print-bill", html);
}

/*async function downloadPDF(no) {
  const data = await ipcRenderer.invoke("get-invoice", no);
  if (!data) return alert("Not found");

  const html = generateReceiptHTML(data);

  const win = window.open("", "_blank");
  win.document.write(html);

  setTimeout(() => win.print(), 500);
}*/

// ================= RECEIPT =================
function generateReceiptHTML(data) {

  const date = new Date(data.date);

  return `
  <html>
  <body style="font-family:monospace;width:280px">
    <center>
      <b>UNITED SHOES</b><br/>
    </center>

    <hr/>

    Invoice: ${data.invoice_no}<br/>
    Date: ${date.toLocaleDateString()}<br/>
    Time: ${date.toLocaleTimeString()}<br/>

    <hr/>

    ${data.items.map(i => `
      <div>
        <b>${i.name}</b><br/>
        ${i.size} | ${i.color}<br/>
        ${i.qty} x ${i.price} = ${i.qty * i.price}
      </div>
      <hr/>
    `).join("")}

    <b>Total: ${data.total}</b>

    <br/><br/>
    <center>Thank you</center>
  </body>
  </html>
  `;
}

// ================= SEARCH =================
function handleSearch() {
  page = 1;
  loadInvoices();
}

function goBack() {
  window.location.href = "index.html";
}

// INIT
loadInvoices();