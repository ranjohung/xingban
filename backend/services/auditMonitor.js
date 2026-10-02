'use strict';

const crypto = require('crypto');
const db = require('../config/db');

const query = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));

const RULES = [
  { key: 'decrypt_failure', field: 'decrypt_failures', threshold: 1, severity: 'critical', summary: '检测到敏感数据解密失败，需要核对密钥版本、数据完整性和访问来源' },
  { key: 'share_revoke_failure', field: 'share_revoke_failures', threshold: 1, severity: 'high', summary: '删除申请创建后分享撤销失败，需要立即人工撤销并联系申请人' },
  { key: 'repeated_denied', field: 'denied_count', threshold: 5, severity: 'high', summary: '同一账号在短时间内多次访问被拒绝，需要核对越权尝试或客户端故障' }
];

async function scanAuditAnomalies(windowMinutes = 15) {
  const minutes = Math.min(1440, Math.max(5, Number(windowMinutes) || 15));
  const rows = await query(`SELECT actor_user_id,
      SUM(outcome='denied') denied_count,
      SUM(outcome='decrypt_failed') decrypt_failures,
      SUM(outcome='share_revoke_failed') share_revoke_failures,
      MIN(created_at) window_started_at,
      MAX(created_at) last_seen_at
    FROM audit_logs
    WHERE created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)
      AND outcome IN ('denied','decrypt_failed','share_revoke_failed')
    GROUP BY actor_user_id`, [minutes]);
  let created = 0;
  for (const row of rows) {
    for (const rule of RULES) {
      const count = Number(row[rule.field] || 0);
      if (count < rule.threshold) continue;
      const subject = row.actor_user_id === null ? 'anonymous' : String(row.actor_user_id);
      const activeKey = `${rule.key}:${subject}`;
      const evidence = JSON.stringify({ window_minutes: minutes, occurrence_count: count, subject: row.actor_user_id === null ? 'anonymous' : 'authenticated_user' });
      await query(`INSERT INTO security_alerts
          (public_id,active_key,rule_key,subject_user_id,severity,status,occurrence_count,window_started_at,last_seen_at,summary,evidence)
        VALUES (?,?,?,?,?,'open',?,?,?,?,?)
        ON DUPLICATE KEY UPDATE occurrence_count=VALUES(occurrence_count),window_started_at=VALUES(window_started_at),last_seen_at=VALUES(last_seen_at),evidence=VALUES(evidence),updated_at=CURRENT_TIMESTAMP`,
      [crypto.randomUUID(), activeKey, rule.key, row.actor_user_id, rule.severity, count, row.window_started_at, row.last_seen_at, rule.summary, evidence]);
      created += 1;
    }
  }
  return { scanned_subjects: rows.length, matched_rules: created, window_minutes: minutes };
}

module.exports = { scanAuditAnomalies, RULES };
