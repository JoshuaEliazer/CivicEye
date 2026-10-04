# ================================================================
# CivicEye Backend - Production Dockerfile (Node.js 20 Alpine)
# ================================================================

FROM node:20-alpine AS production

# Install curl for container health check
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Configure production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy package manifests first for optimal Docker layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY src/ ./src/

# Ensure persistent uploads directory exists and is owned by non-root node user
RUN mkdir -p /app/uploads/complaints && chown -R node:node /app

# Switch to non-root user for security hardening
USER node

# Expose backend REST API port
EXPOSE 5000

# Container healthcheck querying Express /api/health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start production server
CMD ["npm", "start"]
