# REST API: справочник эндпоинтов

Базовый адрес: `http://localhost:3000`. Интерактивная документация (Swagger UI): `/api-docs`, спецификация: `/api-docs.json`.
Все ответы содержат заголовок `X-Group: BBMO-01-23` (ASCII-представление группы для совместимости с HTTP), JSON — поля `data` или `error` (+ `status`, `details`).

## Аутентификация
| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| POST | `/api/auth/register` | публичный | регистрация (роль `user`), возвращает токены |
| POST | `/api/auth/login` | публичный | вход: `accessToken` (15 мин), `refreshToken` (7 дней), `expiresIn` |
| POST | `/api/auth/refresh` | публичный | новая пара токенов (refresh одноразовый) |
| POST | `/api/auth/logout` | публичный | отзыв refresh-токена |

## Пользователи
| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/users` | публичный | список: `page`, `limit` (≤100), `sort`, `group_name`, `course`, `age_min`, `age_max`, `search` |
| GET | `/api/users/search?q=` | публичный | полнотекстовый поиск, ранжирование по `score` |
| GET | `/api/users/stats` | публичный | агрегация: total, averageAge, byGroup, byCourse |
| GET | `/api/users/:id` | публичный | пользователь по id |
| POST | `/api/users` | любой вошедший | создание |
| PUT | `/api/users/:id` | владелец, admin, moderator | обновление |
| DELETE | `/api/users/:id` | владелец, admin | мягкое удаление (`deleted_at`) |
| GET | `/api/users/export?format=csv\|json` | admin, moderator | потоковый экспорт |
| POST | `/api/users/import` | admin | импорт JSON-массива (до 1000) |
| POST | `/api/users/:id/avatar` | владелец, admin, moderator | multipart `avatar` (png/jpeg/webp, ≤2 МБ) |

## Администрирование
| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/admin/users` | список (в т.ч. `?deleted=only`) |
| PUT | `/api/admin/users/:id/role` | роль: `user`, `admin`, `moderator` |
| POST | `/api/admin/users/:id/restore` | восстановление после мягкого удаления |

## Служебные
`GET /health` (liveness), `GET /ready` (БД доступна), `GET /metrics` (Prometheus), `GET /uploads/:file` (аватары),
WebSocket `ws://localhost:3000/ws?token=<accessToken>`.

## Коды ошибок
400 — валидация (`details: [{ field, message }]`) · 401 — нет/неверный/истёкший токен · 403 — недостаточно прав ·
404 — не найдено · 409 — email уже существует · 413 — слишком большое тело/файл · 429 — rate limit · 503 — БД недоступна.
