const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const child = fs.readFileSync(path.join(root, 'backend/routes/child.js'), 'utf8');
const safety = fs.readFileSync(path.join(root, 'backend/routes/safety.js'), 'utf8');
const sensitive = fs.readFileSync(path.join(root, 'backend/routes/sensitive.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend/config/init_db.sql'), 'utf8');

const assertions = [
  [sensitive.includes("'medical_profile'"), '加密敏感记录类型未注册'],
  [schema.includes("'medical_profile'"), '初始化结构缺少加密医疗档案类型'],
  [child.includes('医疗信息不得写入基础档案'), '儿童档案未拒绝明文医疗信息'],
  [child.includes('delete safe.medical_info'), '儿童档案响应未移除历史明文字段'],
  [child.includes('delete updatedData.medical_info'), '旧建档草稿中的医疗信息未从后续保存中清除'],
  [(safety.match(/status\(410\)/g) || []).length === 3, '旧版明文安全档案接口未全部停用'],
  [!safety.includes('INSERT INTO safety_profiles') && !safety.includes('UPDATE safety_profiles SET') && !safety.includes('SELECT * FROM safety_profiles'), '安全档案路由仍访问明文表']
];

for (const [ok, message] of assertions) if (!ok) throw new Error(message);
console.log('PASS medical privacy regression checks');
