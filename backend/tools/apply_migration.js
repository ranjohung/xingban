'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  if (!process.env.DB_ADMIN_USER) throw new Error('迁移必须临时设置 DB_ADMIN_USER/DB_ADMIN_PASSWORD，禁止使用业务账号执行DDL');
  const name = path.basename(process.argv[2] || '');
  if (!/^\d{8}_[a-z0-9_]+\.sql$/i.test(name)) throw new Error('请提供 config/migrations 中的迁移文件名');
  const migrationPath = path.join(__dirname, '..', 'config', 'migrations', name);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_ADMIN_USER,
    password: process.env.DB_ADMIN_PASSWORD,
    multipleStatements: true,
  });
  try {
    await connection.query(sql);
    console.log(`迁移已应用：${name}`);
  } finally {
    await connection.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
