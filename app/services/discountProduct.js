// discountProduct.js
export async function fetchDiscountProductData(order, item) {
  const discountAmount = item.discountAmount || 0;
  const totalOriginalGross = item.quantity * item.unitPrice;
  const discountPercent =
    totalOriginalGross > 0 ? (discountAmount / totalOriginalGross) * 100 : 0;
  return {
    discountPercent: parseFloat(discountPercent.toFixed(2)),
    discountAmount,
    type: "product-specific",
  };
}
