# Лабораторная работа №24. REST API пользователей: Koa.js + MongoDB

Группа: ББМО-01-23. Node.js 18+, MongoDB 6/7 (обычный сервер, реплика-сет **не нужен**).

## Установка
```powershell
npm install
copy .env.example .env      # отредактируйте при необходимости (секреты JWT — не короче 32 символов)
```
MongoDB: подойдёт установленная Community-версия (`mongodb://localhost:27017`). Docker нужен только для скриншота `docker compose up`.

## Структура репозитория
```
task1/ … task4/   самодостаточные версии API по заданиям 1–4 (у каждой своя структура, как в задании)
src/              задание 5: полноценный сервис (config, models, services, controllers, middleware, routes, ...)
tests/            tasks/ (node:test для заданий 1–4), unit/ integration/ e2e/ (Jest, задание 5)
docs/ migrations/ scripts/ docker/ .github/workflows/
```

## Запуск и скриншоты
| Задание | Запуск | Что снять |
|---|---|---|
| 1 | `npm run task1` | структура task1/, запуск, GET/POST, ошибки валидации, 404, заголовок `X-Group: BBMO-01-23` (`curl -i`) |
| 2 | `npm run task2` | структура (models/services/controllers), логи `[SERVICE]/[MODEL]`, Joi-ошибка, 409 на повторный email |
| 3 | `npm run seed`, `npm run task3` | пагинация, фильтры, сортировка, поиск, валидация query, статистика, CSV (`curl -o users.csv`) |
| 4 | `npm run create-admin -- --email=admin@bbmo.example --password=AdminPass123`, `npm run task4`, `npm run demo:auth`, `npm run show-hash -- --email=…`, `npm run demo:rate-limit` | регистрация, вход, 401, 403, refresh, хэш в БД, 429, логи `[AUTH]` |
| 5 | `npm run migrate`, `npm run seed`, `npm start` (или `npm run docker:up`) | Swagger (`/api-docs`), `/health`, `/metrics`, тесты, покрытие, CI, WebSocket (`npm run ws-client -- --email=… --password=…`) |

Задания 3–5 используют коллекцию `users` в БД `bbmo_01_23`; для демонстраций сначала `npm run seed`.

## Тесты
| Команда | Что запускает |
|---|---|
| `npm run test1` | отдельный подробный набор `node:test` для задания 1 |
| `npm run test2` | отдельный подробный набор `node:test` для задания 2 |
| `npm run test3` | отдельный подробный набор `node:test` для задания 3 |
| `npm run test4` | отдельный подробный набор `node:test` для задания 4 |
| `npm run test5` | Jest: unit + integration + e2e для задания 5 |
| `npm test` | тот же полный набор Jest |
| `npm run test:1` … `npm run test:5` | алиасы команд `test1` … `test5` |
| `npm run test:coverage` | полный набор Jest с покрытием (порог 80% statements/lines/functions и 65% branches) |
| `npm run test:unit` / `test:integration` / `test:e2e` | отдельные наборы Jest |

Команды `npm run task1` … `npm run task5` и `npm start` запускают серверы. Для скриншотов с результатами автоматических проверок используйте `npm run test1` … `npm run test5`: каждая команда печатает результаты и завершает работу с кодом 0 при успехе или 1 при ошибке.

Первый запуск e2e-тестов может скачать бинарник MongoDB через `mongodb-memory-server` (нужен интернет). Для тестов `test1` … `test4` используется тестовая БД в памяти, подключение к установленному MongoDB не требуется.

## Docker (задание 5)
```powershell
docker compose --env-file .env -f docker/docker-compose.yml up --build
```
Если Docker Desktop не установлен, скриншот `docker-compose up` не получится; остальные пункты задания выполняются через `npm start`.

## Документация
`docs/API.md` — справочник эндпоинтов, `docs/ARCHITECTURE.md` — слои и меры безопасности.
