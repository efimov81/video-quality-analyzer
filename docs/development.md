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

Для BullMQ требуется Redis. `pnpm infra:up` запускает PostgreSQL и Redis; Redis
использует отдельный volume `redis_data`. FFmpeg и FFprobe должны быть доступны в
`PATH` либо заданы через `FFMPEG_PATH` и `FFPROBE_PATH`.

При старте worker возвращает прерванные задания скачивания в очередь. Схема базы
управляется миграциями Drizzle:
`pnpm db:generate` генерирует миграцию из схемы, `pnpm db:migrate` применяет
неприменённые миграции. Перед первым запуском backend выполните `pnpm db:migrate`.
API: `POST /api/jobs`, `GET /api/jobs`,
`GET /api/jobs/:id`; Swagger доступен на `/api/docs`.

### Технический анализ

Список профилей доступен по `GET /api/profiles`; `POST /api/profiles` создаёт
профиль с JSONB-критериями, а `PUT /api/profiles/:id` создаёт новую версию.
История версий доступна по `GET /api/profiles/:id/versions`.

Создайте анализ скачанного видео вызовом `POST /api/analysis-runs` с
`{"videoId":"<job-id>","profileId":"<profile-id>"}`. Результат сразу вернёт
ID и статус `QUEUED`; worker BullMQ выполняет анализ в фоне. Статус доступен через
`GET /api/analysis-runs/:id`, полный отчёт с проверками и таймкодами — через
`GET /api/analysis-runs/:id/report`. Повторный запрос для уже активной пары видео
и профиля возвращает существующий запуск.

В OpenAPI результаты проверок (`checks`) и их таймкоды (`evidence`) описаны
типизированными массивами. Поля `measuredValue` и `expectedValue` содержат
JSON произвольной структуры или `null`. Структура значения зависит от проверки.
После изменения контракта обновите Angular-клиент командой `pnpm generate:api`
при запущенном backend.

Реализованы FFprobe-метаданные, разрешение, aspect ratio, длительность и битрейт,
наличие аудиопотока, тишина и нулевой
сигнал, EBU R128 loudness/true peak, PCM full-scale/clipping признаки, FFmpeg
scene score, чёрные экраны, freeze, яркость и blur metric. Проверки запускаются
независимо; ошибка одной сохраняется как `ERROR` и не блокирует остальные.

SNR, классификация мешающего шума и VAD речи обозначены как `WARNING` и не
имитируются: без валидированной VAD-модели эти выводы недостоверны. Blur metric
показывается без автоматического решения, пока профиль не задаст откалиброванный
порог. Upscaling-детектор оставлен экспериментально неподдерживаемым; разрешение
или низкая резкость сами по себе не объявляются доказательством upscaling.

Для теста на локальном реальном файле задайте `VIDEO_ANALYSIS_TEST_FILE`:

```bash
VIDEO_ANALYSIS_TEST_FILE=videos/<downloaded-file>.webm pnpm test
```

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


### Локализация EN/RU

Интерфейс по умолчанию открывается на английском. Переключатель EN/RU меняет язык
без перезагрузки и сохраняет выбор в `localStorage` (ключ `vqa.language`).
Каталоги Transloco находятся в `apps/frontend/src/assets/i18n`.

Перед запуском обновлённого backend примените миграцию `pnpm db:migrate`.
Новые результаты и таймкоды сохраняют `messageCode` и `messageParams`, а
ошибки запусков и загрузок — `errorCode`. Для ранее записанных строк новые поля
равны `null`. Клиент показывает исходный текст из `details` или `error` для
старых записей и неизвестных кодов. При добавлении нового кода обновите оба
каталога и сохраните одинаковые имена параметров интерполяции.
