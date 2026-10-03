-- 紧急联系人属于儿童安全敏感资料，纳入现有AES-256-GCM加密记录。
USE xingban_api;

ALTER TABLE sensitive_records
  MODIFY COLUMN kind ENUM('safety_plan','mental_health_profile','wandering_plan','medical_event','emergency_contacts') NOT NULL;
