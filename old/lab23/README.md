# Лабораторная работа №23. MongoDB + Node.js

Группа: ББМО-01-23. Node.js 18+, MongoDB 6/7, драйвер `mongodb` 6.x.

## Быстрый старт
```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
docker compose up -d        # MongoDB как реплика-сет rs0 (нужен для заданий 4 и 5)
```
Если MongoDB установлена локально, поправьте `MONGODB_URI` в `.env`
(например, `mongodb://student:password@localhost:27017/bbmo_01_23`).
Для заданий 4–5 mongod должен быть запущен с `--replSet rs0` и инициализирован (`rs.initiate()`).
Без реплика-сета задания 1–3 работают, API из задания 5 тоже (но batch без транзакции, Change Stream отключён).

## Запуск и скриншоты
| Задание | Команда | Что снять для отчёта |
|---|---|---|
| 1 | `npm run task1` | подключение, информация о сервере, heartbeat, ошибки (неверный URI) |
| 2 | `npm run task2` | INSERT, find (фильтр / сортировка+пагинация / проекция), UPDATE, DELETE |
| 3 | `npm run task3` (первый запуск генерирует 1 000 000 документов; `--size=100000` — быстрее) | for await, ошибка toArray(), агрегации, $lookup, индексы, explain, текстовый поиск |
| 4 | `npm run task4` (`--watch` — держать Change Stream) | реплика-сет, транзакция, откат, проверка, Change Stream, Read Preference |
| 5 | `npm run seed`, `npm start`, затем `npm run demo` и `npm run ws-client` (в отдельных терминалах) | структура проекта, запуск, запросы, WebSocket, метрики, логи |

## Структура задания 5
```
config/       конфигурация и подключение к MongoDB (Database)
models/       JSON Schema студента и валидация
dao/          StudentDAO
services/     StudentService (кэш TTL 60 с, инвалидация)
controllers/  HTTP-контроллеры
middleware/   БД, ошибки, логирование
routes/       маршруты /api/students, /api/metrics
streams/      Change Stream и WebSocket-рассылка
utils/        кэш, метрики, логгер, ошибки
scripts/      seed, demo-requests, ws-client
```

## Коллекции
`students` (задания 2 и 5), `students_big`, `groups`, `students_search` (3), `students_tx` (4).
Задание 2 при запуске пересоздаёт `students` (drop). Задание 3 перед демонстрацией индексов сбрасывает индексы `students_big`.

## curl (Windows PowerShell: используйте `curl.exe` или `npm run demo`)
```bash
curl "http://localhost:3000/api/students?limit=3"
curl -X POST http://localhost:3000/api/students/batch -H "Content-Type: application/json" -d '[{"name":"Анна Белова","course":1,"grade":4.6},{"name":"Олег Громов","course":2,"grade":4.1}]'
curl http://localhost:3000/api/students/stats
curl "http://localhost:3000/api/students/search?q=Иван"
curl http://localhost:3000/api/metrics
```

## Тесты
`npm test` — 48 тестов без обращения к MongoDB (кэш, метрики, валидация, сервис, ошибки, DAO на фейковой коллекции).
