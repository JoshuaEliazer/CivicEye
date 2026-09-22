import express from 'express';
import { getDBStatus } from '../config/db.js';

const router = express.Router();

router.get('/health', (req, res) => {
  const dbStatus = getDBStatus();
  res.status(200).json({
    status: 'ok',
    service: 'CivicEye Express Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: dbStatus,
      connected: dbStatus === 'connected'
    }
  });
});

export default router;
