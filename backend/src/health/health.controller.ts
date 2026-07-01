import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck, HealthCheckService,
  TypeOrmHealthIndicator, MemoryHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  /**
   * Simple liveness probe — no DB check.
   * Used by Railway healthcheck. Always returns 200 if the process is running.
   */
  @Get()
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Full readiness probe — checks DB + memory.
   * Call this manually to confirm all services are healthy.
   */
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),
    ]);
  }
}
