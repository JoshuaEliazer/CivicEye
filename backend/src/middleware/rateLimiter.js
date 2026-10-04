/**
 * Lightweight, in-memory sliding-window Rate Limiter Middleware for CivicEye.
 * Protects against brute-force attacks, DDoS, and API resource exhaustion
 * without requiring external dependencies or external cache infrastructure.
 */

class InMemoryRateLimiter {
  constructor({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests, please try again later.', errorCode = 'TOO_MANY_REQUESTS' } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.message = message;
    this.errorCode = errorCode;
    this.hits = new Map(); // ip -> Array of timestamps

    // Periodically prune stale entries every 5 minutes to prevent memory growth
    this.cleanupInterval = setInterval(() => this.pruneStale(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref(); // Don't keep Node process alive just for cleanup
    }
  }

  pruneStale() {
    const now = Date.now();
    for (const [ip, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((t) => now - t < this.windowMs);
      if (valid.length === 0) {
        this.hits.delete(ip);
      } else {
        this.hits.set(ip, valid);
      }
    }
  }

  reset() {
    this.hits.clear();
  }

  middleware() {
    return (req, res, next) => {
      // In automated test environment, allow bypassing unless specifically testing rate limiter
      if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'] && process.env.ENABLE_TEST_RATE_LIMIT !== 'true') {
        return next();
      }

      const clientIp =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip ||
        '127.0.0.1';

      const now = Date.now();
      const windowStart = now - this.windowMs;

      let timestamps = this.hits.get(clientIp) || [];
      // Filter out timestamps outside the active sliding window
      timestamps = timestamps.filter((t) => t > windowStart);

      const currentCount = timestamps.length;
      const remaining = Math.max(0, this.max - currentCount);
      const resetTime = Math.ceil((windowStart + this.windowMs) / 1000);

      // Set standard RFC-compliant rate limit response headers
      res.setHeader('RateLimit-Limit', this.max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetTime);

      const isProduction = process.env.NODE_ENV === 'production';
      const isTestEnv = process.env.NODE_ENV === 'test';
      const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

      // Bypass rate limit in test environment or local development unless explicitly enforced
      if (
        (isTestEnv || (!isProduction && isLocalhost)) &&
        !req.headers['x-test-rate-limit'] &&
        process.env.ENFORCE_RATE_LIMIT !== 'true'
      ) {
        return next();
      }

      if (currentCount >= this.max) {
        const retryAfterSec = Math.ceil(this.windowMs / 1000);
        res.setHeader('Retry-After', retryAfterSec);

        return res.status(429).json({
          success: false,
          message: this.message,
          error: this.errorCode,
          retryAfterSeconds: retryAfterSec,
        });
      }

      // Record this hit
      timestamps.push(now);
      this.hits.set(clientIp, timestamps);

      next();
    };
  }
}

// 1. General API rate limiter (configurable, default 500 requests per 15 min window)
export const apiLimiter = new InMemoryRateLimiter({
  windowMs: parseInt(process.env.API_RATE_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT, 10) || 500,
  message: 'Too many requests from this IP address, please try again in a few minutes.',
  errorCode: 'RATE_LIMIT_EXCEEDED',
}).middleware();

// 2. Strict Authentication rate limiter (configurable, default 30 attempts per 15 min window to prevent brute force)
export const authLimiter = new InMemoryRateLimiter({
  windowMs: parseInt(process.env.AUTH_RATE_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT, 10) || 30,
  message: 'Too many authentication attempts from this IP address. Please try again later.',
  errorCode: 'AUTH_RATE_LIMIT_EXCEEDED',
}).middleware();

// 3. Complaint & Image submission limiter (configurable, default 60 submissions per 15 min window)
export const submissionLimiter = new InMemoryRateLimiter({
  windowMs: parseInt(process.env.SUBMISSION_RATE_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.SUBMISSION_RATE_LIMIT, 10) || 60,
  message: 'Complaint submission rate limit reached. Please wait before submitting additional civic issues.',
  errorCode: 'SUBMISSION_RATE_LIMIT_EXCEEDED',
}).middleware();

export { InMemoryRateLimiter };

export default {
  apiLimiter,
  authLimiter,
  submissionLimiter,
  InMemoryRateLimiter,
};
