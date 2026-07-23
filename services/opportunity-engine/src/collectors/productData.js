// Placeholder for product/marketplace data integration (e.g. Amazon, Etsy, app stores).
// Future: pull listing counts, price ranges, and review volume for comparable products.
async function collectProductData(idea) {
  return {
    source: 'product-data',
    available: false,
    note: 'Product/marketplace data integration not yet implemented.',
  };
}

module.exports = { collectProductData };
