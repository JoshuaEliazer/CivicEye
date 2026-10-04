/**
 * HTTP Security Headers Middleware for CivicEye REST API.
 * Sets standard defensive HTTP response headers without requiring heavy external dependencies.
 */
export const securityHeaders = (req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking by denying framing from unauthorized origins
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Disable legacy buggy reflected XSS filters in older browsers
  res.setHeader('X-XSS-Protection', '0');

  // Control referrer information sent in HTTP headers
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict sensitive browser features/permissions
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');

  // Enforce HSTS (Strict-Transport-Security) when running over HTTPS / in production
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
};

export default securityHeaders;
