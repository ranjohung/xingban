const errorHandler = (err, req, res, next) => {
  console.error('错误:', err.message, err.stack);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: '数据验证失败',
      details: Object.values(err.errors).map(e => e.message)
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: '无效的token' });
  }
  
  res.status(500).json({ 
    error: '服务器内部错误',
    message: err.message 
  });
};

module.exports = errorHandler;
