export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const random =
    globalThis.crypto?.getRandomValues
      ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)))
          .map((value) => value.toString(16).padStart(8, "0"))
          .join("")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${random}`;
}
