# Разработка

## Требования

- Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`
- pnpm `10.12.1`
- Docker Engine/Desktop и Docker Compose plugin (для PostgreSQL)

Запускайте pnpm-команды из корня monorepo.

## Первый запуск

```bash
cp -n .env.example .env
pnpm install
pnpm infra:up
pnpm infra:ps
pnpm db:migrate
```

Запустите сервер и интерфейс в отдельных терминалах:

```bash
pnpm dev:backend
pnpm dev:frontend
```

NestJS слушает порт `3000` (можно задать переменную `PORT`), Angular доступен на
`http://localhost:4200`, PostgreSQL — на порту `POSTGRES_PORT` из `.env`
(по умолчанию `5434`).

Остановить контейнер PostgreSQL без удаления данных:

```bash
pnpm infra:down
```

Не запускайте `docker compose down -v`: эта команда удалит volume PostgreSQL.

## Загрузка видео

Добавьте ссылку на видео в Angular UI. Backend создаст запись в `jobs` со статусом
`QUEUED`, а фоновый worker последовательно скачает ролик через установленный
`yt-dlp`. Статусы загрузки: `QUEUED`, `DOWNLOADING`, `DOWNLOADED`, `FAILED`.
Список обновляется через REST API раз в 5 секунд.

Установите `yt-dlp` и убедитесь, что команда доступна через `PATH`. Путь можно
задать переменной `YTDLP_PATH`. Видео сохраняются в `./videos`; каталог можно
переопределить переменной `VIDEO_STORAGE_DIR`. Файлы не раздаются публично.

При старте worker возвращает прерванные задания скачивания в очередь. Схема базы
управляется миграциями Drizzle:
`pnpm db:generate` генерирует миграцию из схемы, `pnpm db:migrate` применяет
неприменённые миграции. Перед первым запуском backend выполните `pnpm db:migrate`.
API: `POST /api/jobs`, `GET /api/jobs`,
`GET /api/jobs/:id`; Swagger доступен на `/api/docs`.

## Сборка и проверка типов

```bash
pnpm typecheck
pnpm build
```

Зависимости приложения добавляйте в соответствующий workspace:

```bash
pnpm --filter @video-quality-analyzer/backend add <package>
pnpm --filter @video-quality-analyzer/frontend add <package>
```

Локальные переменные храните в `.env`. Не коммитьте `.env`, пароли или токены.
