const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const auth = require('../middleware/auth');

function issueToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET_NOT_CONFIGURED');
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRE || '2h'
  });
}

function serviceError(res, req) {
  return res.status(500).json({ error: '服务暂时不可用', request_id: req.requestId });
}

router.post('/register', (req, res) => {
  const { phone, password, nickname } = req.body;
  
  if (!/^1\d{10}$/.test(String(phone || '')) || typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: '请输入有效手机号，密码需为8至72位' });
  }
  
  db.query('SELECT * FROM users WHERE phone = ?', [phone], (err, results) => {
    if (err) return serviceError(res, req);
    
    if (results.length > 0) {
      return res.status(400).json({ error: '该手机号已注册' });
    }
    
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return serviceError(res, req);
      
      db.query('INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)', 
        [phone, hash, nickname || '家长'],
        (err, result) => {
          if (err) return serviceError(res, req);
          
          let token;
          try { token = issueToken({ id: result.insertId, phone, role: 'parent' }); }
          catch (_) { return res.status(503).json({ error: '登录服务配置不完整' }); }
          
          res.status(201).json({
            success: true,
            message: '注册成功',
            token,
            user: { id: result.insertId, phone, nickname: nickname || '家长', role: 'parent' }
          });
        }
      );
    });
  });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  
  if (!/^1\d{10}$/.test(String(phone || '')) || typeof password !== 'string') {
    return res.status(400).json({ error: '手机号和密码不能为空' });
  }
  
  db.query('SELECT * FROM users WHERE phone = ?', [phone], (err, results) => {
    if (err) return serviceError(res, req);
    
    if (results.length === 0) {
      return res.status(400).json({ error: '账号或密码错误' });
    }
    
    const user = results[0];
    
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) return serviceError(res, req);
      
      if (!isMatch) {
        return res.status(400).json({ error: '账号或密码错误' });
      }
      
      let token;
      try { token = issueToken({ id: user.id, phone: user.phone, role: user.role }); }
      catch (_) { return res.status(503).json({ error: '登录服务配置不完整' }); }
      
      res.json({
        success: true,
        message: '登录成功',
        token,
        user: { id: user.id, phone: user.phone, nickname: user.nickname, role: user.role }
      });
    });
  });
});

router.post('/sms-login', (req, res) => {
  const { phone, code } = req.body;
  
  if (!phone || !code) {
    return res.status(400).json({ error: '手机号和验证码不能为空' });
  }
  
  if (process.env.ENABLE_DEMO_SMS !== 'true') return res.status(501).json({ error: '短信登录尚未接入短信服务' });
  if (!process.env.DEMO_SMS_CODE || code !== process.env.DEMO_SMS_CODE) return res.status(400).json({ error: '验证码错误' });
  
  db.query('SELECT * FROM users WHERE phone = ?', [phone], (err, results) => {
    if (err) return serviceError(res, req);
    
    if (results.length > 0) {
      const user = results[0];
      let token;
      try { token = issueToken({ id: user.id, phone: user.phone, role: user.role }); }
      catch (_) { return res.status(503).json({ error: '登录服务配置不完整' }); }
      
      res.json({
        success: true,
        message: '登录成功',
        token,
        user: { id: user.id, phone: user.phone, nickname: user.nickname, role: user.role }
      });
    } else {
      bcrypt.hash('123456', 10, (err, hash) => {
        if (err) return serviceError(res, req);
        
        db.query('INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)', 
          [phone, hash, '家长'],
          (err, result) => {
            if (err) return serviceError(res, req);
            
            let token;
            try { token = issueToken({ id: result.insertId, phone, role: 'parent' }); }
            catch (_) { return res.status(503).json({ error: '登录服务配置不完整' }); }
            
            res.status(201).json({
              success: true,
              message: '注册并登录成功',
              token,
              user: { id: result.insertId, phone, nickname: '家长', role: 'parent' }
            });
          }
        );
      });
    }
  });
});

router.post('/reset-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请输入旧密码和新密码' });
  }
  
  db.query('SELECT * FROM users WHERE id = ?', [req.user.id], (err, results) => {
    if (err) return serviceError(res, req);
    
    if (results.length === 0) {
      return res.status(400).json({ error: '用户不存在' });
    }
    
    const user = results[0];
    
    bcrypt.compare(oldPassword, user.password, (err, isMatch) => {
      if (err) return serviceError(res, req);
      
      if (!isMatch) {
        return res.status(400).json({ error: '旧密码错误' });
      }
      
      bcrypt.hash(newPassword, 10, (err, hash) => {
        if (err) return serviceError(res, req);
        
        db.query('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id], (err) => {
          if (err) return serviceError(res, req);
          
          res.json({ success: true, message: '密码修改成功' });
        });
      });
    });
  });
});

router.get('/me', auth, (req, res) => {
  db.query('SELECT id, phone, nickname, role FROM users WHERE id = ?', [req.user.id], (err, results) => {
    if (err) return serviceError(res, req);
    
    if (results.length === 0) {
      return res.status(400).json({ error: '用户不存在' });
    }
    
    res.json({ success: true, user: results[0] });
  });
});

module.exports = router;
