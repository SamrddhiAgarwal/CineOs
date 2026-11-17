import { Redis } from "ioredis";

/**
 * Create an IORedis connection suitable for BullMQ.
 * BullMQ requires maxRetriesPerRequest: null so it manages its own retry loop.
 */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}
