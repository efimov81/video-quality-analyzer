import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { MediaInfo } from './analysis.models';

interface ProcessOutput {
  stdout: string;
  stderr: string;
}

export interface ClippingMeasurement {
  sampleRateHz: number;
  channels: number;
  samplesMeasured: number;
  fullScaleSamples: number;
  fullScaleSampleRatio: number;
  longestFullScaleRunSamples: number;
  segments: Array<{ start: number; end: number; duration: number; sampleCount: number }>;
}

@Injectable()
export class MediaToolsService {
  async probe(filePath: string): Promise<MediaInfo> {
    const output = await this.run(process.env.FFPROBE_PATH ?? 'ffprobe', [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath,
    ], 120_000);
    const parsed = JSON.parse(output.stdout) as MediaInfo;
    if (!Array.isArray(parsed.streams) || !parsed.format) {
      throw new Error('FFprobe вернул неполные метаданные медиафайла.');
    }
    return parsed;
  }

  ffmpeg(filePath: string, args: string[], timeoutMs = 7_200_000): Promise<ProcessOutput> {
    return this.run(process.env.FFMPEG_PATH ?? 'ffmpeg', [
      '-hide_banner', '-nostats', '-nostdin', '-i', filePath, ...args,
    ], timeoutMs);
  }

  measureClipping(filePath: string, channels: number, sampleRateHz = 16_000): Promise<ClippingMeasurement> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', [
        '-hide_banner', '-nostats', '-nostdin', '-i', filePath,
        '-map', '0:a:0', '-vn', '-acodec', 'pcm_f32le', '-ar', String(sampleRateHz), '-f', 'f32le', 'pipe:1',
      ], { shell: false, windowsHide: true });
      const segments: ClippingMeasurement['segments'] = [];
      const runs = Array.from({ length: Math.max(channels, 1) }, () => 0);
      const runStarts = Array.from({ length: Math.max(channels, 1) }, () => 0);
      let maxRun = 0;
      let samplesMeasured = 0;
      let fullScaleSamples = 0;
      let completeFrames = 0;
      let carry = Buffer.alloc(0);
      let stderr = '';
      let settled = false;
      const timeoutMs = 7_200_000;
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('Измерение clipping превысило двухчасовой таймаут.'));
      }, timeoutMs);

      const finishSegment = (channel: number, endFrame: number): void => {
        if (runs[channel] < 2) return;
        const start = runStarts[channel] / sampleRateHz;
        const end = endFrame / sampleRateHz;
        segments.push({ start, end, duration: end - start, sampleCount: runs[channel] });
      };

      const processSamples = (buffer: Buffer): void => {
        for (let offset = 0; offset + 4 <= buffer.length; offset += 4) {
          const sample = buffer.readFloatLE(offset);
          const channel = samplesMeasured % Math.max(channels, 1);
          const frame = Math.floor(samplesMeasured / Math.max(channels, 1));
          const fullScale = Number.isFinite(sample) && Math.abs(sample) >= 0.999;
          if (fullScale) {
            fullScaleSamples += 1;
            if (runs[channel] === 0) runStarts[channel] = frame;
            runs[channel] += 1;
            maxRun = Math.max(maxRun, runs[channel]);
          } else {
            finishSegment(channel, frame);
            runs[channel] = 0;
          }
          samplesMeasured += 1;
          if ((channel + 1) % Math.max(channels, 1) === 0) completeFrames = frame + 1;
        }
      };

      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) {
          reject(error);
          return;
        }
        for (let channel = 0; channel < runs.length; channel += 1) finishSegment(channel, completeFrames);
        resolve({
          sampleRateHz,
          channels,
          samplesMeasured,
          fullScaleSamples,
          fullScaleSampleRatio: samplesMeasured ? fullScaleSamples / samplesMeasured : 0,
          longestFullScaleRunSamples: maxRun,
          segments: segments.slice(0, 1000),
        });
      };

      child.stdout.on('data', (chunk: Buffer) => {
        const buffer = carry.length ? Buffer.concat([carry, chunk]) : chunk;
        const usableLength = buffer.length - (buffer.length % 4);
        processSamples(buffer.subarray(0, usableLength));
        carry = buffer.subarray(usableLength);
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-4000); });
      child.on('error', (error) => finish(new Error(`Не удалось измерить аудио: ${error.message}`)));
      child.on('close', (code) => {
        if (code !== 0) {
          finish(new Error(`Измерение clipping завершилось с кодом ${code}: ${stderr}`));
          return;
        }
        finish();
      });
    });
  }

  private run(executable: string, args: string[], timeoutMs: number): Promise<ProcessOutput> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { shell: false, windowsHide: true });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const maxOutputBytes = 32 * 1024 * 1024;
      let settled = false;
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error(`${executable} превысил таймаут ${timeoutMs} мс.`));
      }, timeoutMs);

      const append = (target: Buffer[], chunk: Buffer, currentBytes: number): number => {
        if (currentBytes + chunk.length > maxOutputBytes) {
          child.kill('SIGKILL');
          finish(new Error(`${executable} превысил лимит вывода ${maxOutputBytes} байт.`));
          return currentBytes;
        }
        target.push(chunk);
        return currentBytes + chunk.length;
      };

      const finish = (error?: Error, output?: ProcessOutput): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(output!);
      };

      child.stdout.on('data', (chunk: Buffer) => { stdoutBytes = append(stdout, chunk, stdoutBytes); });
      child.stderr.on('data', (chunk: Buffer) => { stderrBytes = append(stderr, chunk, stderrBytes); });
      child.on('error', (error) => finish(new Error(`Не удалось запустить ${executable}: ${error.message}`)));
      child.on('close', (code) => {
        if (settled) return;
        const output = {
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        };
        if (code !== 0) {
          const reason = output.stderr.trim().slice(-4000) || `Код завершения ${code}.`;
          finish(new Error(`${executable} завершился с ошибкой: ${reason}`));
          return;
        }
        finish(undefined, output);
      });
    });
  }
}
