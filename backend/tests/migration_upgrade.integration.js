'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

const expectedTables = [
  'caregiver_invitations', 'child_caregivers', 'community_reports',
  'data_deletion_requests', 'professional_plan_events', 'professional_plans',
  'report_shares', 'security_alerts', 'weekly_report_jobs', 'weekly_report_preferences'
];

const expectedColumns = {
  community_posts: ['moderation_status', 'risk_level'],
  community_comments: ['moderation_status', 'risk_level'],
  therapists: ['user_id'],
  professional_plans: ['confirmation_status', 'professional_note', 'reviewed_at', 'reviewed_by_user_id', 'version']
};

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_MIGRATION_USER || process.env.DB_USER || 'root',
    password: process.env.DB_MIGRATION_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'xingban_api'
  });

  try {
    const [tables] = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
    const tableNames = new Set(tables.map(row => row.TABLE_NAME));
    const missingTables = expectedTables.filter(name => !tableNames.has(name));
    if (missingTables.length) throw new Error(`迁移后缺少数据表：${missingTables.join(', ')}`);

    for (const [table, columns] of Object.entries(expectedColumns)) {
      const [rows] = await connection.execute(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]
      );
      const names = new Set(rows.map(row => row.COLUMN_NAME));
      const missing = columns.filter(name => !names.has(name));
      if (missing.length) throw new Error(`迁移后 ${table} 缺少字段：${missing.join(', ')}`);
    }

    const [[legacy]] = await connection.execute(`
      SELECT u.nickname AS parent_name, c.nickname AS child_name, r.content AS report_content,
             p.title AS post_title, cm.content AS comment_content,
             p.moderation_status AS post_status, cm.moderation_status AS comment_status
      FROM users u
      JOIN children c ON c.user_id = u.id
      JOIN weekly_reports r ON r.child_id = c.id
      JOIN community_posts p ON p.user_id = u.id
      JOIN community_comments cm ON cm.post_id = p.id
      WHERE u.id = 900001
    `);
    if (!legacy || legacy.parent_name !== '历史升级测试家长' || legacy.child_name !== '历史升级测试儿童') {
      throw new Error('历史用户或儿童档案在升级后丢失');
    }
    if (legacy.post_title !== '历史记录不可丢失' || legacy.comment_content !== '历史评论保留验证') {
      throw new Error('历史社区内容在升级后丢失');
    }
    if (legacy.post_status !== 'visible' || legacy.comment_status !== 'visible') {
      throw new Error('新增审核字段未为历史内容应用安全默认值');
    }
    const reportContent = typeof legacy.report_content === 'string' ? JSON.parse(legacy.report_content) : legacy.report_content;
    if (!reportContent?.legacy) throw new Error('历史周报内容在升级后损坏');

    const [weeklyIndex] = await connection.execute(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'weekly_reports' AND INDEX_NAME = 'uq_weekly_report_child_week'"
    );
    if (!weeklyIndex.length) throw new Error('周报幂等唯一索引未建立');

    const [[preference]] = await connection.execute(
      "SELECT COLUMN_DEFAULT AS default_timezone FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'weekly_report_preferences' AND COLUMN_NAME = 'timezone'"
    );
    if (!preference || preference.default_timezone !== 'Asia/Shanghai') throw new Error('家庭周报时区默认值不正确');

    console.log(JSON.stringify({ migrated_tables: expectedTables.length, preserved_user_id: 900001, status: 'PASS' }));
    console.log('PASS historical database upgrade: schema complete and legacy data preserved');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
