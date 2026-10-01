'use strict';

const crypto = require('crypto');

const SESSION_COOKIE = 'xingban_session';
const CSRF_COOKIE = 'xingban_csrf';

function parseCookies(req) {
  const output = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    try { output[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch (_) {}
  }
  return output;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Strict'}`);
  return parts.join('; ');
}

function cookiePolicy() {
  const production = process.env.NODE_ENV === 'production';
  const configured = String(process.env.COOKIE_SAME_SITE || (production ? 'Strict' : 'Lax')).toLowerCase();
  const sameSite = ({ strict: 'Strict', lax: 'Lax', none: 'None' })[configured] || 'Strict';
  return { secure: production || sameSite === 'None', sameSite, maxAge: Number(process.env.SESSION_MAX_AGE_SECONDS || 7200) };
}

function setSessionCookies(res, token) {
  const policy = cookiePolicy();
  const csrf = crypto.randomBytes(32).toString('base64url');
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { ...policy, path: '/api', httpOnly: true }));
  res.append('Set-Cookie', serializeCookie(CSRF_COOKIE, csrf, { ...policy, path: '/', httpOnly: false }));
  return csrf;
}

function clearSessionCookies(res) {
  const policy = cookiePolicy();
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { ...policy, path: '/api', httpOnly: true, maxAge: 0 }));
  res.append('Set-Cookie', serializeCookie(CSRF_COOKIE, '', { ...policy, path: '/', httpOnly: false, maxAge: 0 }));
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (['/api/auth/login', '/api/auth/register', '/api/auth/sms-login'].includes(req.path)) return next();
  const cookies = parseCookies(req);
  if (!cookies[SESSION_COOKIE]) return next();
  const cookieToken = Buffer.from(String(cookies[CSRF_COOKIE] || ''));
  const headerToken = Buffer.from(String(req.get('X-CSRF-Token') || ''));
  if (!cookieToken.length || cookieToken.length !== headerToken.length || !crypto.timingSafeEqual(cookieToken, headerToken)) {
    return res.status(403).json({ error: 'CSRF校验失败，请刷新登录状态后重试' });
  }
  next();
}

module.exports = { SESSION_COOKIE, CSRF_COOKIE, parseCookies, setSessionCookies, clearSessionCookies, csrfProtection };
