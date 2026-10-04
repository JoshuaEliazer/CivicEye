import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import mongoose from 'mongoose';
import healthRoutes from './routes/healthRoutes.js';
import predictRoutes from './routes/predictRoutes.js';
import authRoutes from './routes/authRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Resolve allowed CORS origins from environment
const getCorsOrigin = () => {
  if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.trim() !== '') {
    const origins = process.env.CORS_ORIGIN.split(',').map((o) => o.trim());
    return origins.length === 1 ? origins[0] : origins;
  }
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim() !== '') {
    return process.env.FRONTEND_URL.trim();
  }
  return '*';
};

// Middleware
app.use(cors({
  origin: getCorsOrigin(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', healthRoutes);
app.use('/api', predictRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to CivicEye API',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('[CivicEye Error]:', err.stack || err);
  }
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// Server handle for lifecycle management
let server = null;

// Start Server and connect to DB
const startServer = async () => {
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`[CivicEye Backend] Server running on http://localhost:${PORT}`);
    console.log(`[CivicEye Backend] Health check at http://localhost:${PORT}/api/health`);
    console.log(`[CivicEye Backend] Predict endpoint at http://localhost:${PORT}/api/predict`);
    console.log(`[CivicEye Backend] ML Health proxy at http://localhost:${PORT}/api/ml/health`);
    console.log(`[CivicEye Backend] Auth API at http://localhost:${PORT}/api/auth`);
    console.log(`[CivicEye Backend] Complaints API at http://localhost:${PORT}/api/complaints`);
    console.log(`[CivicEye Backend] Admin API at http://localhost:${PORT}/api/admin`);
  });
};

// Graceful shutdown handler for Docker / SIGTERM / SIGINT
const handleShutdown = async (signal) => {
  console.log(`\n[CivicEye Backend] ${signal} signal received. Initiating graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log('[CivicEye Backend] HTTP server closed cleanly.');
      try {
        await mongoose.connection.close(false);
        console.log('[CivicEye Backend] MongoDB connection closed.');
      } catch (dbErr) {
        console.error('[CivicEye Backend] Error closing MongoDB connection:', dbErr.message);
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer();

export default app;
