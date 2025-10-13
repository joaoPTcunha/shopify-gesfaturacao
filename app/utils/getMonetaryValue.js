// money.js
export function getMonetaryValue(value, fieldName = "unknown") {
  if (value === null || value === undefined) {
    console.warn(
      `[generateInvoice] ${fieldName} is null or undefined, defaulting to 0`,
    );
    return 0;
  }
  if (typeof value === "object" && "amount" in value) {
    return parseFloat(value.amount) || 0;
  }
  if (typeof value === "string" || typeof value === "number") {
    return parseFloat(value) || 0;
  }
  console.warn(
    `[generateInvoice] Invalid ${fieldName} format: ${JSON.stringify(value)}, defaulting to 0`,
  );
  return 0;
}
