/**
 * Browser-generated idempotency keys must also work on ordinary HTTP intranet
 * deployments. randomUUID() requires a secure context; getRandomValues() does
 * not. Both paths use the browser's cryptographically secure random source.
 *
 * Generate once per submission intent and retain the result across retries.
 */
type SecureRandomSource = Pick<Crypto, "getRandomValues"> &
  Partial<Pick<Crypto, "randomUUID">>;

export function newIdempotencyKey(
  source: SecureRandomSource | undefined = globalThis.crypto,
): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function") {
    throw new Error(
      "浏览器不支持安全随机数，请使用现代浏览器后重新提交。 / Secure randomness is unavailable. Please use a modern browser and submit again.",
    );
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 version 4.
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant 10xx.
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
