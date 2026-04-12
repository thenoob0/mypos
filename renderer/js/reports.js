const { ipcRenderer } = require('electron');

async function loadReports() {

  const filter = document.getElementById("filter").value;

  const data = await ipcRenderer.invoke("get-sales-summary", filter);

  document.getElementById("totalSales").innerText =
    Number(data.totalSales).toFixed(0);

  document.getElementById("totalInvoices").innerText =
    data.totalInvoices;

  document.getElementById("avgSale").innerText =
    Number(data.avgSale).toFixed(0);

  document.getElementById("totalDiscount").innerText =
    Number(data.totalDiscount).toFixed(0);
  document.getElementById("profit").innerText =
    Number(data.profit).toFixed(0);  
}

function goBack() {
  window.location.href = "index.html";
}

// INIT
loadReports();