const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const auth = require('../middleware/auth');

router.post('/register', (req, res) => {
  const { phone, password, nickname } = req.body;
  
  if (!phone || !password) {
    return res.status(400).json({ error: '手机号和密码不能为空' });
  }
  
  db.query('SELECT * FROM users WHERE phone = ?', [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length > 0) {
      return res.status(400).json({ error: '该手机号已注册' });
    }
    
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query('INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)', 
        [phone, hash, nickname || '家长'],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          
          const token = jwt.sign({ id: result.insertId, phone, role: 'parent' }, 
            process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
          
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
  
  if (!phone || !password) {
    return res.status(400).json({ error: '手机号和密码不能为空' });
  }
  
  db.query('SELECT * FROM users WHERE phone = ?', [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(400).json({ error: '该账号不存在' });
    }
    
    const user = results[0];
    
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!isMatch) {
        return res.status(400).json({ error: '密码错误' });
      }
      
      const token = jwt.sign({ id: user.id, phone: user.phone, role: user.role }, 
        process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
      
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
  
  if (code !== '123456') {
    return res.status(400).json({ error: '验证码错误' });
  }
  
  db.query('SELECT * FROM users WHERE phone = ?', [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length > 0) {
      const user = results[0];
      const token = jwt.sign({ id: user.id, phone: user.phone, role: user.role }, 
        process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
      
      res.json({
        success: true,
        message: '登录成功',
        token,
        user: { id: user.id, phone: user.phone, nickname: user.nickname, role: user.role }
      });
    } else {
      bcrypt.hash('123456', 10, (err, hash) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query('INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)', 
          [phone, hash, '家长'],
          (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const token = jwt.sign({ id: result.insertId, phone, role: 'parent' }, 
              process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
            
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
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(400).json({ error: '用户不存在' });
    }
    
    const user = results[0];
    
    bcrypt.compare(oldPassword, user.password, (err, isMatch) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!isMatch) {
        return res.status(400).json({ error: '旧密码错误' });
      }
      
      bcrypt.hash(newPassword, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          
          res.json({ success: true, message: '密码修改成功' });
        });
      });
    });
  });
});

router.get('/me', auth, (req, res) => {
  db.query('SELECT id, phone, nickname, role FROM users WHERE id = ?', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(400).json({ error: '用户不存在' });
    }
    
    res.json({ success: true, user: results[0] });
  });
});

module.exports = router;
