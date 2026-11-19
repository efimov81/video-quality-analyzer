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

## Состояние приложений

В backend настроен минимальный bootstrap NestJS без контроллеров и API-маршрутов.
Frontend — минимальное standalone Angular-приложение с Tailwind CSS 4. Схема БД,
миграции, worker, API и прикладные функции пока не входят в базовый каркас.

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
