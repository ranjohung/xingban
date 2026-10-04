-- 新医疗档案只允许进入AES-256-GCM敏感记录；旧明文列保留供受控迁移，不再接受API写入或返回。
USE xingban_api;

ALTER TABLE sensitive_records
  MODIFY COLUMN kind ENUM('safety_plan','mental_health_profile','wandering_plan','medical_event','medical_profile','emergency_contacts') NOT NULL;
