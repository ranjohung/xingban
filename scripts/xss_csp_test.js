const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8') + fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');
const security = fs.readFileSync(path.join(root, 'backend/middleware/security.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(html.includes('http-equiv="Content-Security-Policy"'), '前端缺少基础 CSP');
assert(html.includes("object-src 'none'"), '前端 CSP 未禁止插件对象');
assert(html.includes("script-src 'self'; script-src-attr 'unsafe-inline'"), '脚本元素未限制为同源外部文件');
assert(!html.includes('<script>'), '页面仍包含内联脚本块');
const inlineHandlers = (html.match(/on(?:click|change|input|submit|keydown|error)="/g) || []).length;
assert(inlineHandlers <= 241, `内联事件属性回升：${inlineHandlers}`);
assert(!html.includes('onclick="closeTopModal()"') && !html.includes("onclick=\"this.closest('.fixed').remove()\"") && !html.includes('onclick="window.print()"'), '已迁移的通用事件处理器发生回退');
assert(html.includes("base-uri 'self'"), '前端 CSP 未限制 base URI');
assert(html.includes("frame-src 'none'"), '前端 CSP 未禁止 frame');
assert(html.includes('value="${escapeText(recordsFilter.search)}"'), '行为搜索词回显未转义');
assert(html.includes('value="${escapeText(communityFilter.search)}"'), '社区搜索词回显未转义');
assert(html.includes('${escapeText(p[id]||\'\')}'), '防走失预案回显未转义');
assert(html.includes('${escapeText(s)}') && html.includes('${escapeText(c)}'), '儿童优势或挑战回显未转义');
assert(security.includes("default-src 'none'"), 'API 缺少拒绝执行内容的 CSP');
assert(security.includes('Strict-Transport-Security'), '生产环境缺少 HSTS');

console.log('XSS/CSP regression checks passed');
