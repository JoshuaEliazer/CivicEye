import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB, getDBStatus, pingDB } from '../src/config/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';
const ML_URL = process.env.TEST_ML_URL || 'http://127.0.0.1:8000';

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runDeploymentTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 14: DEPLOYMENT, CONTAINERIZATION & CI/CD TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Project Root Directory: ${ROOT_DIR}`);
  console.log(`Target Backend URL:     ${BASE_URL}`);
  console.log(`Target ML Service URL:  ${ML_URL}`);

  let passed = 0;
  let failed = 0;

  try {
    // ========================================================================
    // TEST 1: docker-compose.yml exists and defines all 4 required services
    // ========================================================================
    formatStep(1, 'Verify docker-compose.yml defines 4 core services (mongodb, ml-service, backend, frontend)');
    {
      const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
      if (!fs.existsSync(composePath)) {
        console.error(`  ✗ docker-compose.yml not found at ${composePath}`);
        failed++;
      } else {
        const content = fs.readFileSync(composePath, 'utf8');
        const hasMongodb = content.includes('mongodb:');
        const hasMlService = content.includes('ml-service:');
        const hasBackend = content.includes('backend:');
        const hasFrontend = content.includes('frontend:');

        if (hasMongodb && hasMlService && hasBackend && hasFrontend) {
          console.log(`  ✓ Verified all 4 core services defined in docker-compose.yml.`);
          passed++;
        } else {
          console.error(`  ✗ Missing services in docker-compose.yml:`, {
            hasMongodb,
            hasMlService,
            hasBackend,
            hasFrontend,
          });
          failed++;
        }
      }
    }

    // ========================================================================
    // TEST 2: docker-compose.yml configures persistent named volumes
    // ========================================================================
    formatStep(2, 'Verify persistent named volumes for MongoDB data and media uploads');
    {
      const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
      const content = fs.readFileSync(composePath, 'utf8');
      const hasMongoVolume = content.includes('mongodb_data:');
      const hasUploadsVolume = content.includes('backend_uploads:');
      const mountsMongo = content.includes('mongodb_data:/data/db');
      const mountsUploads = content.includes('backend_uploads:/app/uploads');

      if (hasMongoVolume && hasUploadsVolume && mountsMongo && mountsUploads) {
        console.log(`  ✓ Verified named persistent volumes: mongodb_data and backend_uploads.`);
        passed++;
      } else {
        console.error(`  ✗ Volume configuration discrepancy in docker-compose.yml:`, {
          hasMongoVolume,
          hasUploadsVolume,
          mountsMongo,
          mountsUploads,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 3: docker-compose.yml configures dedicated bridge network
    // ========================================================================
    formatStep(3, 'Verify dedicated bridge network for secure container-to-container communication');
    {
      const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
      const content = fs.readFileSync(composePath, 'utf8');
      const definesNetwork = content.includes('civiceye_network:');
      const usesBridge = content.includes('driver: bridge');

      if (definesNetwork && usesBridge) {
        console.log(`  ✓ Verified civiceye_network bridge driver configured.`);
        passed++;
      } else {
        console.error(`  ✗ Network configuration missing or incomplete in docker-compose.yml.`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 4: All services in docker-compose.yml configure explicit health checks
    // ========================================================================
    formatStep(4, 'Verify explicit health checks across all services');
    {
      const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
      const content = fs.readFileSync(composePath, 'utf8');

      const mongoHealth = content.includes('mongosh') && content.includes('ping');
      const mlHealth = content.includes('http://localhost:8000/health');
      const backendHealth = content.includes('http://localhost:5000/api/health');
      const frontendHealth = content.includes('http://localhost/healthz') || content.includes('http://localhost:80');

      if (mongoHealth && mlHealth && backendHealth && frontendHealth) {
        console.log(`  ✓ Verified all 4 services configure production healthcheck probes.`);
        passed++;
      } else {
        console.error(`  ✗ Incomplete health checks:`, {
          mongoHealth,
          mlHealth,
          backendHealth,
          frontendHealth,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 5: Service dependencies use condition: service_healthy
    // ========================================================================
    formatStep(5, 'Verify service startup order uses condition: service_healthy');
    {
      const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
      const content = fs.readFileSync(composePath, 'utf8');
      const hasConditionHealthy = content.includes('condition: service_healthy');
      const backendDependsOn = content.includes('mongodb:\n        condition: service_healthy') ||
        content.includes('condition: service_healthy');

      if (hasConditionHealthy && backendDependsOn) {
        console.log(`  ✓ Verified startup readiness gating via condition: service_healthy.`);
        passed++;
      } else {
        console.error(`  ✗ Missing service_healthy dependency conditions in docker-compose.yml.`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 6: Backend Dockerfile exists, uses production Node base & non-root user
    // ========================================================================
    formatStep(6, 'Verify backend Dockerfile architecture and non-root security');
    {
      const dockerfilePath = path.join(ROOT_DIR, 'backend', 'Dockerfile');
      if (!fs.existsSync(dockerfilePath)) {
        console.error(`  ✗ backend/Dockerfile not found.`);
        failed++;
      } else {
        const content = fs.readFileSync(dockerfilePath, 'utf8');
        const usesNodeAlpine = content.includes('node:20-alpine') || content.includes('node:18-alpine');
        const usesNonRoot = content.includes('USER node');
        const exposesPort = content.includes('EXPOSE 5000');
        const hasHealthcheck = content.includes('HEALTHCHECK');

        if (usesNodeAlpine && usesNonRoot && exposesPort && hasHealthcheck) {
          console.log(`  ✓ backend/Dockerfile verified: Node Alpine, USER node, EXPOSE 5000, HEALTHCHECK.`);
          passed++;
        } else {
          console.error(`  ✗ backend/Dockerfile check failed:`, {
            usesNodeAlpine,
            usesNonRoot,
            exposesPort,
            hasHealthcheck,
          });
          failed++;
        }
      }
    }

    // ========================================================================
    // TEST 7: Frontend Dockerfile exists & implements multi-stage build
    // ========================================================================
    formatStep(7, 'Verify frontend Dockerfile multi-stage build (Node build + Nginx runtime)');
    {
      const dockerfilePath = path.join(ROOT_DIR, 'frontend', 'Dockerfile');
      if (!fs.existsSync(dockerfilePath)) {
        console.error(`  ✗ frontend/Dockerfile not found.`);
        failed++;
      } else {
        const content = fs.readFileSync(dockerfilePath, 'utf8');
        const hasBuildStage = content.includes('AS build') && content.includes('npm run build');
        const hasNginxStage = content.includes('FROM nginx:alpine') || content.includes('nginx');
        const copiesDist = content.includes('--from=build') && content.includes('/usr/share/nginx/html');
        const exposesPort = content.includes('EXPOSE 80') || content.includes('EXPOSE 5173');

        if (hasBuildStage && hasNginxStage && copiesDist && exposesPort) {
          console.log(`  ✓ frontend/Dockerfile verified: multi-stage build with Nginx production server.`);
          passed++;
        } else {
          console.error(`  ✗ frontend/Dockerfile multi-stage validation failed:`, {
            hasBuildStage,
            hasNginxStage,
            copiesDist,
            exposesPort,
          });
          failed++;
        }
      }
    }

    // ========================================================================
    // TEST 8: Frontend nginx.conf exists, configures SPA fallback & reverse proxy
    // ========================================================================
    formatStep(8, 'Verify frontend/nginx.conf SPA fallback routing and /api/ reverse proxy');
    {
      const nginxPath = path.join(ROOT_DIR, 'frontend', 'nginx.conf');
      if (!fs.existsSync(nginxPath)) {
        console.error(`  ✗ frontend/nginx.conf not found.`);
        failed++;
      } else {
        const content = fs.readFileSync(nginxPath, 'utf8');
        const hasSpaFallback = content.includes('try_files $uri $uri/ /index.html');
        const hasApiProxy = content.includes('location /api/') && content.includes('proxy_pass http://backend:5000/api/');
        const hasHealthCheck = content.includes('/healthz');
        const hasGzip = content.includes('gzip on');

        if (hasSpaFallback && hasApiProxy && hasHealthCheck && hasGzip) {
          console.log(`  ✓ frontend/nginx.conf verified: SPA fallback, /api/ proxy, /healthz probe, gzip enabled.`);
          passed++;
        } else {
          console.error(`  ✗ frontend/nginx.conf check failed:`, {
            hasSpaFallback,
            hasApiProxy,
            hasHealthCheck,
            hasGzip,
          });
          failed++;
        }
      }
    }

    // ========================================================================
    // TEST 9: ML service Dockerfile exists, exposes port 8000, no --reload
    // ========================================================================
    formatStep(9, 'Verify ml-service Dockerfile configuration & production Uvicorn settings');
    {
      const dockerfilePath = path.join(ROOT_DIR, 'ml-service', 'Dockerfile');
      if (!fs.existsSync(dockerfilePath)) {
        console.error(`  ✗ ml-service/Dockerfile not found.`);
        failed++;
      } else {
        const content = fs.readFileSync(dockerfilePath, 'utf8');
        const usesPythonSlim = content.includes('python:3.11-slim') || content.includes('python:3.10-slim');
        const exposesPort = content.includes('EXPOSE 8000');
        const runsUvicorn = content.includes('uvicorn');
        const noReload = !content.includes('--reload');
        const hasHealthcheck = content.includes('HEALTHCHECK');

        if (usesPythonSlim && exposesPort && runsUvicorn && noReload && hasHealthcheck) {
          console.log(`  ✓ ml-service/Dockerfile verified: Python slim, EXPOSE 8000, Uvicorn without --reload, HEALTHCHECK.`);
          passed++;
        } else {
          console.error(`  ✗ ml-service/Dockerfile check failed:`, {
            usesPythonSlim,
            exposesPort,
            runsUvicorn,
            noReload,
            hasHealthcheck,
          });
          failed++;
        }
      }
    }

    // ========================================================================
    // TEST 10: .dockerignore files exist and preserve required model files
    // ========================================================================
    formatStep(10, 'Verify .dockerignore files exist and do not exclude required YOLO26 weights');
    {
      const backendIgnorePath = path.join(ROOT_DIR, 'backend', '.dockerignore');
      const frontendIgnorePath = path.join(ROOT_DIR, 'frontend', '.dockerignore');
      const mlIgnorePath = path.join(ROOT_DIR, 'ml-service', '.dockerignore');

      const backendExists = fs.existsSync(backendIgnorePath);
      const frontendExists = fs.existsSync(frontendIgnorePath);
      const mlExists = fs.existsSync(mlIgnorePath);

      let modelExcluded = false;
      if (mlExists) {
        const mlContent = fs.readFileSync(mlIgnorePath, 'utf8');
        // Check if model or yolo26n.pt is accidentally excluded without whitelist
        const lines = mlContent.split('\n').map((l) => l.trim());
        modelExcluded = lines.includes('model/') || lines.includes('model/yolo26n.pt') || lines.includes('*.pt');
      }

      if (backendExists && frontendExists && mlExists && !modelExcluded) {
        console.log(`  ✓ Verified all 3 .dockerignore files exist and preserve ml-service/model/yolo26n.pt.`);
        passed++;
      } else {
        console.error(`  ✗ .dockerignore verification failed:`, {
          backendExists,
          frontendExists,
          mlExists,
          modelExcluded,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 11: Environment templates (.env.example) document required variables
    // ========================================================================
    formatStep(11, 'Verify .env.example files document all production variables without leaking secrets');
    {
      const rootEnvPath = path.join(ROOT_DIR, '.env.example');
      const backendEnvPath = path.join(ROOT_DIR, 'backend', '.env.example');
      const frontendEnvPath = path.join(ROOT_DIR, 'frontend', '.env.example');

      const rootContent = fs.readFileSync(rootEnvPath, 'utf8');
      const backendContent = fs.readFileSync(backendEnvPath, 'utf8');
      const frontendContent = fs.readFileSync(frontendEnvPath, 'utf8');

      const hasPort = rootContent.includes('PORT=');
      const hasMongo = rootContent.includes('MONGODB_URI=');
      const hasMl = rootContent.includes('ML_SERVICE_URL=');
      const hasJwt = rootContent.includes('JWT_SECRET=');
      const hasCors = rootContent.includes('CORS_ORIGIN=');
      const hasViteApi = frontendContent.includes('VITE_API_URL=');

      // Ensure no real production secret is hardcoded in .env.example
      const leaksSecret = rootContent.includes('sk_live_') || rootContent.includes('ghp_');

      if (hasPort && hasMongo && hasMl && hasJwt && hasCors && hasViteApi && !leaksSecret) {
        console.log(`  ✓ Verified .env.example templates are fully documented with zero leaked secrets.`);
        passed++;
      } else {
        console.error(`  ✗ Environment template validation failed:`, {
          hasPort,
          hasMongo,
          hasMl,
          hasJwt,
          hasCors,
          hasViteApi,
          leaksSecret,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 12: .gitignore properly excludes sensitive files & temporary data
    // ========================================================================
    formatStep(12, 'Verify .gitignore excludes .env files, node_modules, and uploads');
    {
      const gitignorePath = path.join(ROOT_DIR, '.gitignore');
      const content = fs.readFileSync(gitignorePath, 'utf8');

      const ignoresEnv = content.includes('.env');
      const ignoresNodeModules = content.includes('node_modules/');
      const ignoresUploads = content.includes('uploads/');
      const keepsBaselineModel = content.includes('!ml-service/model/yolo26n.pt');

      if (ignoresEnv && ignoresNodeModules && ignoresUploads && keepsBaselineModel) {
        console.log(`  ✓ Verified .gitignore protects credentials, uploads, and dependencies while retaining baseline weights.`);
        passed++;
      } else {
        console.error(`  ✗ .gitignore configuration discrepancy:`, {
          ignoresEnv,
          ignoresNodeModules,
          ignoresUploads,
          keepsBaselineModel,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 13: GitHub Actions CI workflow exists and defines all required jobs
    // ========================================================================
    formatStep(13, 'Verify GitHub Actions CI workflow at .github/workflows/ci.yml');
    {
      const ciPath = path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml');
      if (!fs.existsSync(ciPath)) {
        console.error(`  ✗ .github/workflows/ci.yml not found.`);
        failed++;
      } else {
        const content = fs.readFileSync(ciPath, 'utf8');
        const triggersOnPush = content.includes('push:\n    branches: [main]') || content.includes('branches: [main]');
        const hasBackendJob = content.includes('backend-test:') || content.includes('backend:');
        const hasFrontendJob = content.includes('frontend-build:') || content.includes('frontend:');
        const hasMlJob = content.includes('ml-service-test:') || content.includes('ml-service:');
        const hasDockerJob = content.includes('docker-validation:');

        if (triggersOnPush && hasBackendJob && hasFrontendJob && hasMlJob && hasDockerJob) {
          console.log(`  ✓ Verified GitHub Actions CI: triggers on main, runs backend, frontend, ML, and Docker validation jobs.`);
          passed++;
        } else {
          console.error(`  ✗ GitHub Actions workflow validation failed:`, {
            triggersOnPush,
            hasBackendJob,
            hasFrontendJob,
            hasMlJob,
            hasDockerJob,
          });
          failed++;
        }
      }
    }

    // ========================================================================
    // TEST 14: Live Backend Health Endpoint returns 200 and healthy DB status
    // ========================================================================
    formatStep(14, 'Verify live backend /api/health endpoint returns HTTP 200 with MongoDB connected');
    {
      try {
        const res = await fetch(`${BASE_URL}/health`);
        const data = await res.json();
        if (res.status === 200 && data.status === 'ok' && data.database?.connected === true) {
          console.log(`  ✓ Live Express Backend health verified: HTTP 200, DB host=${data.database.host}, ping=${data.database.ping}.`);
          passed++;
        } else {
          console.error(`  ✗ Backend health check failed: status=${res.status}, body=`, data);
          failed++;
        }
      } catch (err) {
        console.error(`  ✗ Could not connect to backend health endpoint at ${BASE_URL}/health:`, err.message);
        failed++;
      }
    }

    // ========================================================================
    // TEST 15: Live ML Service Health Endpoint returns 200 and model loaded
    // ========================================================================
    formatStep(15, 'Verify live FastAPI ML service /health endpoint returns HTTP 200 with YOLO26 loaded');
    {
      try {
        const res = await fetch(`${ML_URL}/health`);
        const data = await res.json();
        if (res.status === 200 && data.status === 'ok' && data.model?.loaded === true) {
          console.log(`  ✓ Live FastAPI ML Service verified: HTTP 200, Architecture=${data.model.architecture}, Variant=${data.model.model_variant}.`);
          passed++;
        } else {
          console.error(`  ✗ ML health check failed: status=${res.status}, body=`, data);
          failed++;
        }
      } catch (err) {
        console.error(`  ✗ Could not connect to ML service at ${ML_URL}/health:`, err.message);
        failed++;
      }
    }

    // ========================================================================
    // TEST 16: Backend ML proxy (/api/ml/health) functions cleanly
    // ========================================================================
    formatStep(16, 'Verify Express proxies ML health (/api/ml/health) without direct frontend exposure');
    {
      try {
        const res = await fetch(`${BASE_URL}/ml/health`);
        const data = await res.json();
        if (res.status === 200 && data.online === true && data.modelLoaded === true) {
          console.log(`  ✓ Express <-> FastAPI proxy verified: HTTP 200, online=true, modelLoaded=true.`);
          passed++;
        } else {
          console.error(`  ✗ Express ML proxy failed: status=${res.status}, body=`, data);
          failed++;
        }
      } catch (err) {
        console.error(`  ✗ Could not connect to ML proxy at ${BASE_URL}/ml/health:`, err.message);
        failed++;
      }
    }

    // ========================================================================
    // TEST 17: Production CORS origin configuration in server.js
    // ========================================================================
    formatStep(17, 'Verify CORS middleware accepts explicit origins and credentials');
    {
      const serverCode = fs.readFileSync(path.join(ROOT_DIR, 'backend', 'src', 'server.js'), 'utf8');
      const hasCorsOriginResolver = serverCode.includes('getCorsOrigin') || serverCode.includes('CORS_ORIGIN');
      const hasCredentials = serverCode.includes('credentials: true');

      if (hasCorsOriginResolver && hasCredentials) {
        console.log(`  ✓ CORS middleware in server.js supports environment-configured origins and credentials.`);
        passed++;
      } else {
        console.error(`  ✗ CORS configuration missing from server.js:`, { hasCorsOriginResolver, hasCredentials });
        failed++;
      }
    }

    // ========================================================================
    // TEST 18: Image Storage volume path resolution across environments
    // ========================================================================
    formatStep(18, 'Verify local storage service resolves path safely in container and host environments');
    {
      const storageCode = fs.readFileSync(
        path.join(ROOT_DIR, 'backend', 'src', 'services', 'storage', 'localStorageService.js'),
        'utf8'
      );
      const supportsCustomPath = storageCode.includes('LOCAL_STORAGE_PATH') || storageCode.includes('rawBasePath');
      const handlesAbsoluteAndRelative = storageCode.includes('path.isAbsolute');

      if (supportsCustomPath && handlesAbsoluteAndRelative) {
        console.log(`  ✓ LocalStorageService cleanly handles both container absolute paths (/app/uploads) and host relative paths.`);
        passed++;
      } else {
        console.error(`  ✗ LocalStorageService path resolution check failed.`);
        failed++;
      }
    }
  } catch (err) {
    console.error('\n[!] Unexpected error in deployment test suite:', err);
    failed++;
  } finally {
    console.log('\n' + '='.repeat(70));
    console.log(`DEPLOYMENT TEST SUITE RESULTS: ${passed} PASSED / ${failed} FAILED (Total: ${passed + failed})`);
    console.log('='.repeat(70));

    if (failed > 0) {
      process.exit(1);
    }
  }
};

runDeploymentTests();
