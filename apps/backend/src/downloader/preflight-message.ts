import type { PreflightResult } from './video-preflight';

function clock(value: unknown): string {
  const total = typeof value === 'number' ? value : 0;
  const minutes = Math.floor(total / 60);
  const seconds = Number((total % 60).toFixed(3));
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export function formatPreflightFailure(result: PreflightResult, language: 'ru' | 'en'): string {
  const tr = (ru: string, en: string) => language === 'ru' ? ru : en;
  const headline = result.status === 'REJECTED'
    ? tr('❌ Видео отклонено до скачивания', '❌ Video rejected before download')
    : result.status === 'INCONCLUSIVE'
      ? tr('⚠️ Недостаточно данных для скачивания', '⚠️ Not enough information to download')
      : tr('⚠️ Не удалось получить метаданные видео', '⚠️ Unable to retrieve video metadata');

  const reasons = result.checks.filter((check) => check.status === result.status).map(({ reason, params }) => {
    switch (reason) {
      case 'tooShort': return tr(`Длительность ${clock(params.duration)}, минимум ${clock(params.min)}.`,
        `Duration ${clock(params.duration)}, minimum ${clock(params.min)}.`);
      case 'tooLong': return tr(`Длительность ${clock(params.duration)}, максимум ${clock(params.max)}.`,
        `Duration ${clock(params.duration)}, maximum ${clock(params.max)}.`);
      case 'shortsForbidden': return tr('YouTube Shorts запрещены текущим профилем.', 'The current profile disallows YouTube Shorts.');
      case 'resolutionTooLow': return tr(`Нет формата с требуемым разрешением ${params.minWidth}×${params.minHeight}.`,
        `No format meets the required resolution of ${params.minWidth}×${params.minHeight}.`);
      case 'notSingleVideo': return tr('Укажите ссылку на отдельное видео.', 'Use a link to a single video.');
      case 'videoRestricted': return tr('Видео приватное или доступ к нему ограничен.', 'The video is private or restricted.');
      case 'videoUnavailable': return tr('Видео удалено или недоступно.', 'The video has been removed or is unavailable.');
      case 'durationUnknown': return tr('Длительность неизвестна.', 'The duration is unknown.');
      case 'shortsUnknown': return tr('Не удалось установить, является ли видео Shorts.', 'It could not be determined whether the video is a Short.');
      case 'resolutionUnknown': return tr('Разрешение доступных форматов неизвестно.', 'The resolution of the available formats is unknown.');
      case 'availabilityUnknown': return tr('Доступность видеопотока не подтверждена.', 'The video stream availability is unconfirmed.');
      case 'downloaderMissing': return tr('На сервере не найден yt-dlp.', 'yt-dlp is missing on the server.');
      case 'metadataTimeout': return tr('YouTube не ответил вовремя.', 'YouTube did not respond in time.');
      default: return tr('Ошибка запроса к YouTube. Попробуйте позже.', 'The YouTube request failed. Try again later.');
    }
  });
  return [headline, '', ...reasons.map((reason) => `• ${reason}`)].join('\n');
}
