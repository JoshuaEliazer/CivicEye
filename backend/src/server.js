import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import healthRoutes from './routes/healthRoutes.js';
import predictRoutes from './routes/predictRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', healthRoutes);
app.use('/api', predictRoutes);

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
  console.error('[CivicEye Error]:', err.stack || err);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR')
  });
});

// Start Server and connect to DB
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[CivicEye Backend] Server running on http://localhost:${PORT}`);
    console.log(`[CivicEye Backend] Health check at http://localhost:${PORT}/api/health`);
    console.log(`[CivicEye Backend] Predict endpoint at http://localhost:${PORT}/api/predict`);
    console.log(`[CivicEye Backend] ML Health proxy at http://localhost:${PORT}/api/ml/health`);
  });
};

startServer();

export default app;
