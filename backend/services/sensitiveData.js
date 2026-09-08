const crypto = require('crypto');

function getKey() {
  const raw = process.env.SENSITIVE_DATA_KEY;
  if (!raw) throw new Error('SENSITIVE_DATA_KEY 未配置');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), version: 1 };
}

function decryptJson(record) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function randomPublicId() { return crypto.randomUUID(); }
function randomToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(token) { return crypto.createHash('sha256').update(token, 'utf8').digest('hex'); }

module.exports = { encryptJson, decryptJson, randomPublicId, randomToken, hashToken };
