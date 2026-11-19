import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

interface VideoInfo {
  title?: string;
  description?: string;
}

@Injectable()
export class VideoDownloaderService {
  async download(sourceUrl: string): Promise<{ path: string; info: VideoInfo }> {
    const url = await this.validateSource(sourceUrl);
    const info = await this.runYtDlp(['--dump-single-json', '--no-playlist', '--no-warnings', '--socket-timeout', '20', url])
      .then((output) => JSON.parse(output) as VideoInfo)
      .catch((error: unknown) => {
        if (error instanceof BadRequestException) throw error;
        throw this.downloadError(error);
      });

    const directory = resolve(process.env.VIDEO_STORAGE_DIR ?? './videos');
    await mkdir(directory, { recursive: true });
    const target = join(directory, `${randomUUID()}.%(ext)s`);
    await this.runYtDlp([
      '--no-playlist', '--no-warnings', '--socket-timeout', '20', '--max-filesize', '2G',
      '--restrict-filenames', '-o', target, url,
    ]).catch((error: unknown) => { throw this.downloadError(error); });

    const { readdir } = await import('node:fs/promises');
    const prefix = target.slice(0, target.indexOf('.%(ext)s'));
    const file = (await readdir(directory)).find((name) => name.startsWith(prefix.split('/').pop() ?? ''));
    if (!file) throw new Error('Загрузчик завершился без сохранённого файла.');
    return { path: join(directory, file), info: { title: info.title, description: info.description } };
  }

  private async validateSource(source: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new BadRequestException('Укажите корректную ссылку на видео.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new BadRequestException('Поддерживаются только публичные ссылки HTTP и HTTPS.');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new BadRequestException('Локальные адреса недопустимы.');
    }
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
    if (!addresses.length || addresses.some(({ address }) => !this.isPublicAddress(address))) {
      throw new BadRequestException('Ссылка должна вести на публичный адрес.');
    }
    return url.toString();
  }

  private isPublicAddress(address: string): boolean {
    if (address.includes(':')) {
      const normalized = address.toLowerCase();
      return !normalized.startsWith('::') && !normalized.startsWith('fc') && !normalized.startsWith('fd') &&
        !normalized.startsWith('fe') && !normalized.startsWith('ff') && !normalized.startsWith('2001:db8:');
    }
    const [a, b] = address.split('.').map(Number);
    return a !== 10 && a !== 127 && a !== 0 && !(a === 169 && b === 254) &&
      !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) &&
      !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19)) && a < 224;
  }

  private runYtDlp(args: string[]): Promise<string> {
    return new Promise((resolveOutput, reject) => {
      const child = spawn(process.env.YTDLP_PATH ?? 'yt-dlp', args, { shell: false, windowsHide: true });
      let output = '';
      let errorOutput = '';
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30 * 60 * 1000);
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { errorOutput = (errorOutput + chunk).slice(-4000); });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolveOutput(output.trim());
        else reject(new Error(errorOutput || `yt-dlp завершился с кодом ${code}.`));
      });
    });
  }

  private downloadError(error: unknown): Error {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    if (message.includes('ENOENT')) return new ServiceUnavailableException('Не найден yt-dlp. Установите yt-dlp и добавьте его в PATH.');
    return new Error(`Не удалось скачать видео: ${message}`);
  }
}
