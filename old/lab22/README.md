# Лабораторная работа №22. MySQL + Node.js

Группа: ББМО-01-23. Node.js 18+, MySQL 8 (подойдёт и MariaDB 10.4+), драйвер `mysql2`.

## 1. Установка и настройка MySQL (Windows)
1. Скачайте **MySQL Installer** (dev.mysql.com/downloads/installer), выберите *Server only*, задайте пароль `root`.
2. Убедитесь, что служба запущена: `Get-Service MySQL*` → `Running` (порт 3306).
3. В папке проекта:
   ```powershell
   npm install
   copy .env.example .env          # впишите в .env свой пароль в DB_PASSWORD (не change_me)
   npm run setup-db -- --root-password=ПАРОЛЬ_ROOT
   ```
   Команда создаёт базу `bbmo_01_23` и пользователя `student` (не root) с правами только на эту БД.
   Если `mysql` в PATH, то же самое делается вручную:
   ```sql
   CREATE DATABASE bbmo_01_23 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'student'@'localhost' IDENTIFIED BY 'ваш_пароль';
   GRANT ALL PRIVILEGES ON bbmo_01_23.* TO 'student'@'localhost';
   ```

## 2. Запуск и скриншоты
| Задание | Команда | Что снять |
|---|---|---|
| 1 | `npm run task1`, `npm run show-env` | одиночное соединение, пул, ошибка (неверный пароль), .env без пароля |
| 2 | `npm run task2` | создание таблицы, INSERT, SELECT, UPDATE (affected/changed), DELETE, SQL-инъекция |
| 3 | `npm run task3` (разделы: `-- --only=errors\|pool\|stream\|tx`) | ошибки по категориям, ошибки пула, stream, сравнение памяти, транзакции |
| 4 | `npm run task4` | структура StudentDAO, валидация, пагинация, фильтры, поиск, статистика |
| 5 | `npm run migrate`, `npm run seed`, `npm start`, затем `npm run demo` | структура, запуск, запросы, откат batch, stats, metrics, логи, миграции, кэш |
| тесты | `npm test` или `npm run test:1` … `test:5` | по скриншоту на задание |

## 3. Важно про таблицы
Задания 2 и 4 пересоздают таблицу `students` (`DROP TABLE IF EXISTS`). Миграция 002 безопасно добавляет внешний ключ
к уже существующей таблице (переносит группы студентов в `groups`). Если после заданий 2–4 сервер пишет, что таблицы
отсутствуют, выполните `npm run migrate:rollback -- --all` и затем `npm run migrate`.
`npm run reset-db` удаляет все таблицы лабораторной.

## 4. Структура задания 5
```
config/       конфигурация БД и переменные окружения
models/       валидация студентов и групп
dao/          StudentDAO, GroupDAO (весь SQL здесь)
services/     бизнес-логика, кэш TTL 60 с, инвалидация
controllers/  HTTP-контроллеры (работают через ctx.db)
middleware/   БД (ctx.db), ошибки, логирование
migrations/   001_create_students.sql, 002_create_groups.sql
routes/       маршруты
lib/          обёртка пула (логи SQL, транзакции), ManagedPool, миграции, кэш, метрики
```

## 5. Заметки
- `groups` — зарезервированное слово MySQL 8.0.2+, поэтому везде `` `groups` ``.
- Для `ER_NO_REFERENCED_ROW`: MySQL 8 при INSERT отдаёт код `ER_NO_REFERENCED_ROW_2`; API обрабатывает оба.
- PowerShell: вместо `curl` используйте `curl.exe` или `npm run demo`.
