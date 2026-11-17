'use strict';

/**
 * DDL таблицы students. Используется заданиями 2 и 4 и совпадает с миграцией 001_create_students.sql.
 * Движок InnoDB, кодировка utf8mb4. Индекс по group_name ускоряет фильтрацию и нужен для внешнего ключа.
 */
const STUDENTS_DDL = `CREATE TABLE IF NOT EXISTS students (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  group_name VARCHAR(20) NOT NULL,
  course INT NOT NULL,
  grade DECIMAL(3,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_students_group (group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

module.exports = { STUDENTS_DDL };
