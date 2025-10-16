export function clampDiscount(value, context = "unknown") {
  if (value < 0 || value > 100) {
    throw new Error(
      `Invalid discount in ${context}: ${value}%. Discounts must be between 0% and 100%.`,
    );
  }
  return parseFloat(value.toFixed(4));
}
