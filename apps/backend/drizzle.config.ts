import { defineConfig } from 'drizzle-kit';
import { loadRootEnv } from './src/config/load-root-env';

loadRootEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://app:change_me_local@localhost:5434/video_quality_analyze',
  },
});
