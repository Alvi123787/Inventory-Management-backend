const crypto = require("crypto");

// Prefer ENCRYPTION_KEY but fallback to SHARED_SECRET
const secret =
  process.env.ENCRYPTION_KEY ||
  process.env.SHARED_SECRET ||
  "default_temp_secret_1234567890123456"; // fallback 32 chars

let key;

try {
  key = Buffer.from(secret, "utf8");
  if (key.length !== 32) {
    console.warn("⚠️ ENCRYPTION_KEY should be exactly 32 characters long for AES-256-GCM");
  }
} catch (err) {
  console.error("❌ Failed to create encryption key:", err.message);
  key = Buffer.alloc(32); // fallback to zeroed key
}

// Encrypt text
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

// Decrypt text
function decrypt(enc) {
  try {
    const data = Buffer.from(enc, "base64");
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const text = data.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(text, undefined, "utf8") + decipher.final("utf8");
  } catch (e) {
    console.error("❌ Decryption failed:", e.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };
