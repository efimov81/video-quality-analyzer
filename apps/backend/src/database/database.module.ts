import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: () => {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://app:change_me_local@localhost:5434/video_quality_analyze' });
        return { pool, db: drizzle(pool, { schema }) };
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly connection: DatabaseConnection) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.pool.end();
  }
}

export interface DatabaseConnection {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
}
