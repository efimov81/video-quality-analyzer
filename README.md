# Video Quality Analyzer

Учебно-практический проект для анализа качества видео. Сейчас настроены базовые
запускаемые приложения NestJS и Angular; API и прикладные функции ещё не реализованы.

## Стек

- Monorepo: pnpm workspaces
- Backend: NestJS 11
- Frontend: Angular 21, Tailwind CSS 4
- Database infrastructure: PostgreSQL 17

## Первый запуск

Требования: Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`, pnpm `10.12.1`,
Docker Engine с Compose plugin.

```bash
cp -n .env.example .env
pnpm install
pnpm infra:up
```

Запустите приложения в отдельных терминалах:

```bash
pnpm dev:backend
pnpm dev:frontend
```

Frontend доступен по адресу `http://localhost:4200`, NestJS запускается на
`http://localhost:3000`. PostgreSQL доступен на порту `POSTGRES_PORT` из `.env`
(по умолчанию `5434`).

Остановить PostgreSQL, сохранив данные:

```bash
pnpm infra:down
```

**Не используйте `docker compose down -v`, если хотите сохранить данные.**

Проверки:

```bash
pnpm typecheck
pnpm build
```

Локальные настройки хранятся в `.env`; не добавляйте его в систему контроля версий.
Дополнительные инструкции по разработке находятся в [`docs/development.md`](docs/development.md).
