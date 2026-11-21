export interface TelegramMessage {
  message_id: number;
  from?: { id: number; is_bot?: boolean; language_code?: string };
  chat: { id: number; type: string };
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export class TelegramApiError extends Error {
  readonly retryAfter?: number;

  constructor(readonly status?: number, retryAfter?: number) {
    super(status ? `Telegram rejected the request (HTTP ${status}).` : 'Telegram delivery could not be confirmed.');
    if (retryAfter !== undefined && Number.isFinite(retryAfter)) {
      this.retryAfter = Math.min(86_400, Math.max(1, retryAfter));
    }
  }
}

export class TelegramApi {
  constructor(private readonly token: string) {}

  identity(signal: AbortSignal) {
    return this.call<{ username: string }>('getMe', {}, signal, 15_000);
  }

  updates(offset: number | undefined, signal: AbortSignal) {
    return this.call<TelegramUpdate[]>('getUpdates', {
      offset, timeout: 25, allowed_updates: ['message'],
    }, signal, 35_000);
  }

  sendMessage(chatId: string, messageId: number, text: string, signal: AbortSignal) {
    return this.call('sendMessage', {
      chat_id: chatId, text,
      reply_parameters: { message_id: messageId },
      link_preview_options: { is_disabled: true },
    }, signal, 15_000);
  }

  sendReport(chatId: string, messageId: number, caption: string, report: string, signal: AbortSignal) {
    const form = new FormData();
    form.set('chat_id', chatId);
    form.set('reply_parameters', JSON.stringify({ message_id: messageId }));
    form.set('caption', caption);
    form.set('parse_mode', 'HTML');
    form.set('document', new Blob([report], { type: 'text/plain;charset=utf-8' }), 'video-analysis.txt');
    return this.call('sendDocument', form, signal, 30_000);
  }

  private async call<T>(method: string, body: object, signal: AbortSignal, timeout: number): Promise<T> {
    const multipart = body instanceof FormData;
    let result: TelegramResponse<T>;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: multipart ? undefined : { 'content-type': 'application/json' },
        body: multipart ? body : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
      });
      result = await response.json() as TelegramResponse<T>;
    } catch {
      // Fetch errors can contain the secret URL.
      throw new TelegramApiError();
    }
    if (result?.ok === true && result.result !== undefined) return result.result;
    if (result?.ok === false) throw new TelegramApiError(result.error_code, result.parameters?.retry_after);
    throw new TelegramApiError();
  }
}
