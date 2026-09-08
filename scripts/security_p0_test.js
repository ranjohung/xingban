const assert = require('assert');
process.env.SENSITIVE_DATA_KEY = 'test-only-key-with-at-least-32-characters-long';
const { encryptJson, decryptJson, randomPublicId, randomToken, hashToken } = require('../backend/services/sensitiveData');

const source = { warning: '连续少睡', medication: '仅按医嘱', nested: { level: 2 } };
const encryptedA = encryptJson(source);
const encryptedB = encryptJson(source);
assert.notStrictEqual(encryptedA.ciphertext, encryptedB.ciphertext, '每次加密必须使用不同IV');
assert.deepStrictEqual(decryptJson(encryptedA), source, '密文必须能正确解密');
assert.throws(() => decryptJson({ ...encryptedA, tag: Buffer.alloc(16).toString('base64') }), '篡改认证标签必须失败');
assert.match(randomPublicId(), /^[0-9a-f-]{36}$/i);
const token = randomToken();
assert(token.length >= 40);
assert.match(hashToken(token), /^[0-9a-f]{64}$/);
assert(!JSON.stringify(encryptedA).includes(source.warning), '密文不得包含明文');
console.log('P0安全单元测试通过：随机IV、认证加密、防篡改、UUID与令牌哈希。');
