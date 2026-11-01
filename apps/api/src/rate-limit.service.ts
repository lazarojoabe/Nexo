import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Counter = { count: number; resetAt: number };

/** In-process backstop; production gateways should mirror these limits. */
@Injectable()
export class RateLimitService {
  private readonly counters = new Map<string, Counter>();

  consume(scope: string, subject: string, limit: number, windowMs: number) {
    const now = Date.now();
    const key = `${scope}:${subject}`;
    const current = this.counters.get(key);
    const counter = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    counter.count += 1;
    this.counters.set(key, counter);
    if (counter.count > limit) throw new HttpException('Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    if (this.counters.size > 10_000) this.removeExpired(now);
  }

  private removeExpired(now: number) {
    for (const [key, value] of this.counters) if (value.resetAt <= now) this.counters.delete(key);
  }
}
