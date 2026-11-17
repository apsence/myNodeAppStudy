-- migrate:up
-- groups — зарезервированное слово MySQL 8.0.2+, поэтому имя в обратных кавычках
CREATE TABLE IF NOT EXISTS `groups` (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(20) NOT NULL,
  curator VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_groups_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `groups` (name, curator) VALUES
  ('ББМО-01-23', 'Иванов И.И.'),
  ('ББМО-02-23', 'Петрова А.С.'),
  ('ББМО-03-23', 'Сидоров В.П.');

-- уже существующие студенты (например, из заданий 2-4) не должны нарушить внешний ключ
INSERT IGNORE INTO `groups` (name) SELECT DISTINCT group_name FROM students;

ALTER TABLE students
  ADD CONSTRAINT fk_students_group FOREIGN KEY (group_name) REFERENCES `groups` (name)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- migrate:down
ALTER TABLE students DROP FOREIGN KEY fk_students_group;
DROP TABLE IF EXISTS `groups`;
