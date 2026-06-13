export function maskApiKey(value: string) {
  if (!value) return "";
  if (value.length <= 10) return "********";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
