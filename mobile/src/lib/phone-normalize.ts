/** Strip to digits for comparison (keeps leading country code as digits only). */
export function phoneDigits(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    return trimmed.slice(1).replace(/\D/g, "");
  }
  return trimmed.replace(/\D/g, "");
}

/** Normalize VN phone to comparable key (0xxxxxxxx or digits). */
export function normalizePhoneKey(raw: string): string {
  let digits = phoneDigits(raw);
  if (digits.startsWith("84") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

/** Compare two phone strings after normalization. */
export function phonesMatch(a: string, b: string): boolean {
  const ka = normalizePhoneKey(a);
  const kb = normalizePhoneKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return ka.endsWith(kb.slice(-9)) || kb.endsWith(ka.slice(-9));
}

/** Display format for VN mobile (090x xxx xxxx). */
export function formatPhoneDisplay(raw: string): string {
  const key = normalizePhoneKey(raw);
  if (key.length === 10 && key.startsWith("0")) {
    return `${key.slice(0, 4)} ${key.slice(4, 7)} ${key.slice(7)}`;
  }
  if (key.length >= 9) {
    return key.replace(/(\d{3,4})(?=\d)/g, "$1 ").trim();
  }
  return raw.trim() || key;
}
