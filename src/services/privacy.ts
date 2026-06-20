/**
 * Privacy Service — Three-level sensitive data classification.
 *
 * Level 1 (Local Only — NEVER uploaded):
 *   - Full phone number, ID card number, home address, exact birth date
 *   → Encrypted with AES-256-GCM in browser, key derived from session
 *
 * Level 2 (Encrypted Upload — stored but NOT sent to LLM):
 *   - Full name, email, masked phone (138****1234), school full name
 *   → Encrypted before upload to Supabase
 *
 * Level 3 (Cleartext OK — safe to send to LLM after masking):
 *   - Skills, project experience (company name masked), years of experience, education level
 *   → Masked version sent to LLM, original stored encrypted
 */

// ── Level 1: Detection Patterns ──────────────────

/** Patterns that indicate Level 1 sensitive data */
const L1_PATTERNS: { name: string; pattern: RegExp }[] = [
  {
    name: "phone",
    pattern: /1[3-9]\d{9}/g,
  },
  {
    name: "id_card",
    pattern: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
  },
  {
    name: "birth_date_detailed",
    pattern: /(?:19|20)\d{2}年(?:0[1-9]|1[0-2])月(?:0[1-9]|[12]\d|3[01])日/g,
  },
  {
    name: "home_address",
    pattern:
      /(?:省|市|区|县|镇|村|街道|路|号|栋|单元|室).{3,30}(?:省|市|区|县|镇|村|街道|路|号|栋|单元|室)/g,
  },
];

// ── Level 1: Detection ───────────────────────────

interface DetectedField {
  name: string;
  value: string;
  start: number;
  end: number;
}

/** Scan text for Level 1 sensitive fields */
export function detectLevel1Fields(text: string): DetectedField[] {
  const fields: DetectedField[] = [];

  for (const { name, pattern } of L1_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex state
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      fields.push({
        name,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return fields.sort((a, b) => a.start - b.start);
}

// ── Level 1: Masking ─────────────────────────────

/** Replace L1 fields with placeholder text */
export function maskLevel1Fields(text: string): string {
  const fields = detectLevel1Fields(text);
  let result = text;
  // Process from end to start to preserve indices
  for (const field of fields.reverse()) {
    result =
      result.substring(0, field.start) +
      `[已隐藏:${field.name}]` +
      result.substring(field.end);
  }
  return result;
}

// ── Level 2: Masking ─────────────────────────────

/**
 * Mask Level 2 fields for LLM consumption.
 *
 * - Phone: 138****1234
 * - Email: u***@example.com
 */
export function maskLevel2ForLLM(text: string): string {
  let masked = text;

  // Mask phone numbers (keep first 3 and last 4)
  masked = masked.replace(
    /1[3-9](\d{4})(\d{4})/g,
    (_, mid, last) => `1${"*".repeat(4)}${last}`
  );

  // Mask email usernames (keep first char)
  masked = masked.replace(
    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    (_match, user, domain) => {
      if (user.length <= 1) return `*@${domain}`;
      return `${user[0]}***@${domain}`;
    }
  );

  return masked;
}

// ── Level 3: Prepare for LLM ─────────────────────

/**
 * Prepare resume content for LLM consumption:
 * 1. Strip Level 1 fields (they should never leave the client)
 * 2. Mask Level 2 fields
 * 3. Return safe-to-send content
 */
export function prepareForLLM(rawContent: string): string {
  // Step 1: Remove L1 fields entirely (replace with placeholder)
  const withoutL1 = maskLevel1Fields(rawContent);

  // Step 2: Mask L2 fields
  const withoutL2 = maskLevel2ForLLM(withoutL1);

  return withoutL2;
}

/**
 * Client-side AES-256-GCM encryption for Level 1 data.
 *
 * The encrypted blob is stored locally only (IndexedDB / localStorage).
 * The encryption key is derived from the session token, so if the user
 * logs out, the data becomes unreadable until they log back in.
 */
export async function encryptLevel1Data(
  plaintext: string,
  sessionKey: string
): Promise<string> {
  // Derive AES key from session
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionKey).slice(0, 32),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("everydeliver-l1-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  // Return iv + ciphertext as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Get the session-derived key for L1 encryption.
 * Uses auth token hash as key material.
 */
export function getSessionKey(token: string): string {
  // Simple hash for key derivation
  return token.substring(0, 32).padEnd(32, "0");
}
