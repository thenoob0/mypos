const { contextBridge } = require('electron');
const productController = require('./src/controllers/product.controller');

console.log("Preload loaded ✅");

contextBridge.exposeInMainWorld('api', {
  getProductByBarcode: (barcode) => productController.getByBarcode(barcode)
});