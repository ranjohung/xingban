require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

db.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err);
    console.log('⚠️  服务将在无数据库模式下启动，部分功能受限');
  } else {
    console.log('✅ 数据库连接成功');
  }
});

app.use('/api/auth', require('./routes/auth'));
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '星伴后端服务运行正常' });
});

app.listen(PORT, () => {
  console.log(`🚀 星伴后端服务启动成功，端口: ${PORT}`);
});

module.exports = app;
