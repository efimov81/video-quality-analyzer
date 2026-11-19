import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadRootEnv(): void {
  const envPath = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find(existsSync);

  if (envPath) config({ path: envPath });
}
