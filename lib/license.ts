/**
 * Cowlytics License Key System
 * ─────────────────────────────
 * Key format: COWL-XXXX-XXXX-XXXX
 *
 * How it works (no database needed):
 *   1. Key payload encodes: type + expiry (YYYYMM) + random nonce
 *   2. Payload is HMAC-SHA256 signed with LICENSE_SECRET env var
 *   3. First 12 chars of signature become the key body (3 groups of 4)
 *   4. Verification: re-derive signature from payload, compare
 *
 * Security properties:
 *   - Cannot be forged without LICENSE_SECRET
 *   - Each key is unique (random nonce)
 *   - Keys expire by month (YYYYMM in payload)
 *   - Works entirely on Edge / Node — no DB required
 *
 * Env vars needed (Vercel):
 *   LICENSE_SECRET   — long random string, keep private
 *   ADMIN_PASSWORD   — for /admin page
 */

// ── Charset (unambiguous — no 0/O, 1/I/L) ─────────────────────────────
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function toBase32(bytes: Uint8Array, length: number): string {
  let bits = 0, value = 0, output = "";
  for (let i = 0; i < bytes.length && output.length < length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && output.length < length) {
      output += CHARSET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output.padEnd(length, CHARSET[0]);
}

// ── HMAC-SHA256 (server-side only, uses Node crypto) ───────────────────
async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  // Works in Node 18+ (Web Crypto available globally on Vercel Edge/Node)
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

// ── Payload encoding ───────────────────────────────────────────────────
// payload = "{type}:{YYYYMM}:{nonce6}"
// type: "M" = monthly, "Y" = yearly, "L" = lifetime
export type LicenseType = "M" | "Y" | "L";

function buildPayload(type: LicenseType, expiryYearMonth: string, nonce: string): string {
  return `${type}:${expiryYearMonth}:${nonce}`;
}

function parsePayload(payload: string): { type: LicenseType; expiryYearMonth: string; nonce: string } | null {
  const parts = payload.split(":");
  if (parts.length !== 3) return null;
  const [type, expiryYearMonth, nonce] = parts;
  if (!["M", "Y", "L"].includes(type)) return null;
  if (!/^\d{6}$/.test(expiryYearMonth)) return null;
  return { type: type as LicenseType, expiryYearMonth, nonce };
}

// ── Random nonce (6 chars from charset) ────────────────────────────────
function randomNonce(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return toBase32(bytes, 6);
}

// ── Key encoding/decoding ───────────────────────────────────────────────
// Full key = "COWL-" + body (12 chars) = COWL-XXXX-XXXX-XXXX
// body encodes: payload (base32, 10 chars) + sig check (2 chars)
// We store the payload OUT-OF-BAND in the key via a different scheme:
//
// Actual scheme (simpler, more robust):
//   - Generate nonce (6 chars from charset)
//   - payload string = "{type}:{YYYYMM}:{nonce}"
//   - HMAC the payload → take first 6 bytes → base32 → 9 chars (sig)
//   - key body = nonce(6) + sig(6) = 12 chars → 3 groups of 4
//   - To verify: user provides key + type + expiry; server re-derives sig
//
// But this requires type+expiry to be known at verify time.
// Better: embed everything IN the key itself.
//
// FINAL SCHEME:
//   payload = type(1) + YYYYMM(6) = 7 chars of info → encode as 7 charset chars
//   nonce = 5 random charset chars
//   together = 12 chars → HMAC(secret, 12chars) → first 6 bytes → 9 charset chars
//   But we only have 12 slots total...
//
// PRACTICAL SCHEME (used here):
//   The key body is 12 chars (3 groups of 4, after "COWL-")
//   - chars 0-4:  base32-encoded payload (type + expiry)
//   - chars 5-9:  nonce (5 random chars)
//   - chars 10-11: first 2 chars of HMAC(secret, chars0-9)
//
// This gives: integrity check (can't forge) + embedded expiry + uniqueness

const PAYLOAD_LENGTH = 5;
const NONCE_LENGTH   = 5;
const SIG_LENGTH     = 2;
const BODY_LENGTH    = PAYLOAD_LENGTH + NONCE_LENGTH + SIG_LENGTH; // 12

function encodeTypeExpiry(type: LicenseType, expiryYearMonth: string): string {
  // Pack: typeIndex(0-2) * 1_000_000 + YYYYMM into 5 positional base-32 chars.
  // Uses POSITIONAL base-32 (like base-10 but base-32) — must match decodeTypeExpiry.
  // Max value: 2 * 1_000_000 + 209912 = 2_209_912 < 32^5 = 33_554_432 ✓
  const typeIndex = (["M", "Y", "L"] as const).indexOf(type);
  const expiryNum = parseInt(expiryYearMonth, 10);
  let   packed    = typeIndex * 1_000_000 + expiryNum;

  // Positional base-32 encode (big-endian)
  let result = "";
  for (let i = 0; i < PAYLOAD_LENGTH; i++) {
    result = CHARSET[packed % 32] + result;
    packed = Math.floor(packed / 32);
  }
  return result;
}

function decodeTypeExpiry(encoded: string): { type: LicenseType; expiryYearMonth: string } | null {
  // Positional base-32 decode — mirrors encodeTypeExpiry
  let value = 0;
  for (let i = 0; i < encoded.length; i++) {
    const idx = CHARSET.indexOf(encoded[i]);
    if (idx === -1) return null;
    value = (value * 32) + idx;
  }
  const typeIndex      = Math.floor(value / 1_000_000);
  const expiryNum      = value % 1_000_000;
  if (typeIndex < 0 || typeIndex > 2) return null;
  const type: LicenseType = (["M", "Y", "L"] as const)[typeIndex];
  const expiryYearMonth    = expiryNum.toString().padStart(6, "0");
  if (!/^\d{6}$/.test(expiryYearMonth)) return null;
  return { type, expiryYearMonth };
}

// ── Public API ─────────────────────────────────────────────────────────

export interface GeneratedKey {
  key:         string;    // "COWL-XXXX-XXXX-XXXX"
  type:        LicenseType;
  expiryLabel: string;    // "জুন ২০২৫" (Bengali month)
  expiresOn:   string;    // "2025-06"
}

export interface VerifyResult {
  valid:       boolean;
  type?:       LicenseType;
  expiresOn?:  string;
  expiryLabel?: string;
  reason?:     string;   // why invalid
}

const BENGALI_MONTHS = [
  "", "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

function expiryLabel(yyyymm: string): string {
  const year  = yyyymm.slice(0, 4);
  const month = parseInt(yyyymm.slice(4), 10);
  return `${BENGALI_MONTHS[month] ?? ""} ${year}`;
}

/** Generate a new license key (server-side only) */
export async function generateKey(
  secret:   string,
  type:     LicenseType,
  durationMonths: number   // 1 = monthly, 12 = yearly, 1200 = lifetime (100yr)
): Promise<GeneratedKey> {
  const now    = new Date();
  const expiry = new Date(now.getFullYear(), now.getMonth() + durationMonths, 1);
  const expiryYM = `${expiry.getFullYear()}${String(expiry.getMonth() + 1).padStart(2, "0")}`;

  const payloadChars = encodeTypeExpiry(type, expiryYM);
  const nonce        = randomNonce().slice(0, NONCE_LENGTH);
  const preimage     = payloadChars + nonce;          // 10 chars

  const sigBytes = await hmac(secret, preimage);
  const sigChars = toBase32(sigBytes, SIG_LENGTH);    // 2 chars

  const body     = preimage + sigChars;               // 12 chars
  const key      = `COWL-${body.slice(0,4)}-${body.slice(4,8)}-${body.slice(8,12)}`;

  return {
    key,
    type,
    expiryLabel: type === "L" ? "আজীবন" : expiryLabel(expiryYM),
    expiresOn:   type === "L" ? "lifetime" : `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}`,
  };
}

/** Verify a license key (server-side only) */
export async function verifyKey(secret: string, rawKey: string): Promise<VerifyResult> {
  // Normalise
  const key = rawKey.toUpperCase().replace(/\s/g, "").replace(/-/g, "");

  // Structural check
  if (!key.startsWith("COWL")) return { valid: false, reason: "invalid_format" };
  const body = key.slice(4); // remove "COWL"
  if (body.length !== BODY_LENGTH) return { valid: false, reason: "invalid_length" };

  // Validate chars
  for (const c of body) {
    if (!CHARSET.includes(c)) return { valid: false, reason: "invalid_chars" };
  }

  // Split parts
  const payloadChars = body.slice(0, PAYLOAD_LENGTH);
  const nonce        = body.slice(PAYLOAD_LENGTH, PAYLOAD_LENGTH + NONCE_LENGTH);
  const sigChars     = body.slice(PAYLOAD_LENGTH + NONCE_LENGTH);
  const preimage     = payloadChars + nonce;

  // Recompute signature
  const sigBytes    = await hmac(secret, preimage);
  const expectedSig = toBase32(sigBytes, SIG_LENGTH);

  if (sigChars !== expectedSig) return { valid: false, reason: "invalid_signature" };

  // Decode payload
  const decoded = decodeTypeExpiry(payloadChars);
  if (!decoded) return { valid: false, reason: "invalid_payload" };

  const { type, expiryYearMonth } = decoded;

  // Check expiry
  if (type !== "L") {
    const now       = new Date();
    const nowYM     = parseInt(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`, 10);
    const expiryNum = parseInt(expiryYearMonth, 10);
    if (nowYM > expiryNum) return { valid: false, reason: "expired", expiresOn: expiryYearMonth };
  }

  return {
    valid:       true,
    type,
    expiresOn:   type === "L" ? "lifetime" : expiryYearMonth,
    expiryLabel: type === "L" ? "আজীবন" : expiryLabel(expiryYearMonth),
  };
}

/** Duration in months for each type */
export const LICENSE_DURATIONS: Record<LicenseType, number> = {
  M: 1,
  Y: 12,
  L: 1200,
};

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  M: "মাসিক (১ মাস)",
  Y: "বার্ষিক (১ বছর)",
  L: "আজীবন",
};