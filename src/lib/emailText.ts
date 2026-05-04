export function repairMisencodedUtf8(value: string | null | undefined): string {
  if (!value) return "";

  const suspiciousSequences = [
    "Ãƒ",
    "Ã¢â‚¬",
    "Ã¢â‚¬â„¢",
    "Ã¢â‚¬Å“",
    "Ã¢â‚¬â€œ",
    "Ã¢â‚¬â€",
    "Ã‚",
    "Ã¢â‚¬Â¦",
    "Ã¢â‚¬Â¢",
    "Ã¢â€žÂ¢",
    "Ã¢â€šÂ¬",
  ];
  const hasSuspiciousControl = value.includes("Ã¢") && Array.from(value).some((char) => char.charCodeAt(0) < 32);
  const looksBroken = suspiciousSequences.some((fragment) => value.includes(fragment)) || hasSuspiciousControl;

  if (!looksBroken) return value;

  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return repaired.includes("ï¿½") ? value : repaired;
  } catch {
    return value;
  }
}
