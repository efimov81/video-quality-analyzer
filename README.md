# Video Quality Analyzer

Учебно-практический проект для загрузки видео и фонового анализа качества
с отчётами по техническим проверкам.

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
pnpm db:migrate
```

Запустите приложения в отдельных терминалах:

```bash
pnpm dev:backend
pnpm dev:frontend
```

Frontend доступен по адресу `http://localhost:4200`, NestJS запускается на
`http://localhost:3000`. PostgreSQL доступен на порту `POSTGRES_PORT` из `.env`
(по умолчанию `5434`).

На новой базе backend при первом запуске автоматически создаёт администратора
`admin` с временным паролем `admin`. Откройте приложение локально, войдите
и смените пароль в «Моём профиле» перед открытием доступа к приложению.
Дальше создавайте пользователей через раздел «Пользователи». Для развёртывания
используйте HTTPS и проксируйте `/api` на NestJS с того же origin, что и frontend.
Настройте `FRONTEND_ORIGIN` под адрес приложения.

## Telegram-бот

1. Получите токен у [@BotFather](https://t.me/BotFather) и задайте
   `TELEGRAM_BOT_TOKEN` в локальном `.env`.
2. Выполните `pnpm db:migrate` и перезапустите backend. При пустом токене
   запускается только веб-приложение и его фоновые обработчики.
3. Отправьте боту `/id`. Администратор сохраняет этот числовой ID в карточке
   нужного пользователя в разделе «Пользователи».
4. В личном чате отправьте ссылку YouTube или
   `/analyze <код-профиля> <ссылка>`. Команда `/profiles` показывает
   активные профили, а `/lang en` и `/lang ru` меняют язык бота.

Backend получает сообщения через long polling. Для этого нужен исходящий доступ
к `api.telegram.org`. Результат приходит ответом на исходное сообщение вместе
с текстовым отчётом и таймкодами. Если у бота ранее был настроен webhook,
снимите его перед запуском polling. [Telegram Bot API](https://core.telegram.org/bots/api#getupdates)

## Остановка и проверки

Остановить PostgreSQL, сохранив данные:

```bash
pnpm infra:down
```

**Не используйте `docker compose down -v`, если хотите сохранить данные.**

Проверки:

```bash
pnpm typecheck
pnpm build
pnpm test
```

Локальные настройки хранятся в `.env`; не добавляйте его в систему контроля версий.
Дополнительные инструкции по разработке находятся в [`docs/development.md`](docs/development.md).
