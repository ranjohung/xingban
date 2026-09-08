require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const { securityHeaders, authRateLimit } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');
app.use(securityHeaders);
const allowedOrigins = new Set((process.env.CORS_ORIGINS || 'http://127.0.0.1:8001,http://localhost:8001').split(',').map(v => v.trim()).filter(Boolean));
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.has(origin)) return callback(null, true); callback(new Error('不允许的跨域来源')); }, methods: ['GET','POST','PUT','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization','X-Request-Id'], credentials: false, maxAge: 600 }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb', parameterLimit: 100 }));

db.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err);
    console.log('⚠️  服务将在无数据库模式下启动，部分功能受限');
  } else {
    console.log('✅ 数据库连接成功');
  }
});

app.use('/api/auth', authRateLimit, require('./routes/auth'));
app.use('/api/child', require('./routes/child'));
app.use('/api/behavior', require('./routes/behavior'));
app.use('/api/strategy', require('./routes/strategy'));
app.use('/api/emergency', require('./routes/emergency'));
app.use('/api/report', require('./routes/report'));
app.use('/api/therapist', require('./routes/therapist'));
app.use('/api/family', require('./routes/family'));
app.use('/api/growth', require('./routes/growth'));
app.use('/api/safety', require('./routes/safety'));
app.use('/api/story', require('./routes/story'));
app.use('/api/community', require('./routes/community'));
app.use('/api/notification', require('./routes/notification'));
app.use('/api/career', require('./routes/career'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/sensitive', require('./routes/sensitive'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '星伴后端服务运行正常' });
});

app.use((req, res) => res.status(404).json({ error: '接口不存在', request_id: req.requestId }));
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'test') console.error(`[${req.requestId}] 请求处理失败`);
  res.status(err.message === '不允许的跨域来源' ? 403 : 500).json({ error: err.message === '不允许的跨域来源' ? err.message : '服务暂时不可用', request_id: req.requestId });
});

app.listen(PORT, () => {
  console.log(`🚀 星伴后端服务启动成功，端口: ${PORT}`);
});

module.exports = app;
