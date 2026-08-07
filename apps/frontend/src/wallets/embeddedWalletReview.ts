function serializeForReview(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);
}

export function confirmEmbeddedWalletAction(title: string, payload: unknown): void {
  const confirmAction = globalThis.confirm;
  if (typeof confirmAction !== "function") {
    throw new Error("Embedded wallet confirmation is unavailable; signing was blocked");
  }

  const accepted = confirmAction(
    [
      "Vortex embedded wallet request",
      "",
      title,
      "",
      serializeForReview(payload),
      "",
      "Review every field. Continue only if this is the action you intended."
    ].join("\n")
  );

  if (!accepted) {
    throw new Error("Embedded wallet action was cancelled");
  }
}
