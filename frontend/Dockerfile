# ================================================================
# CivicEye Frontend - Multi-Stage Production Dockerfile (Vite + Nginx)
# ================================================================

# --- Stage 1: Build static assets with Node.js ---
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests for optimal layer caching
COPY package*.json ./

# Install all dependencies required for the Vite build
RUN npm ci

# Copy frontend source code
COPY . .

# Build argument allowing dynamic backend URL configuration at build time
# Defaults to relative '/api' which Nginx proxies to the backend container
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Compile production bundle to /app/dist
RUN npm run build

# --- Stage 2: Serve production bundle with lightweight Nginx ---
FROM nginx:alpine AS production

# Copy compiled static assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with SPA routing and API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose standard HTTP port
EXPOSE 80

# Container healthcheck querying Nginx healthz endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost/healthz || exit 1

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
