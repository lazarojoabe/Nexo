import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // The repository's copied .env.example contains a local placeholder. It is
  // useful for onboarding but must not make the API try to connect on startup.
  // A real Supabase/Postgres URL enables persistence automatically.
  readonly enabled = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('postgres:password@localhost:5432/nexo'));

  async onModuleInit() {
    if (this.enabled) await this.$connect();
  }

  async onModuleDestroy() {
    if (this.enabled) await this.$disconnect();
  }
}
