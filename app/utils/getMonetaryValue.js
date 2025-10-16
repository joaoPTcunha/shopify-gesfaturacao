export function getMonetaryValue(value, fieldName = "unknown") {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "object" && "amount" in value) {
    return parseFloat(value.amount) || 0;
  }
  if (typeof value === "string" || typeof value === "number") {
    return parseFloat(value) || 0;
  }

  return 0;
}
