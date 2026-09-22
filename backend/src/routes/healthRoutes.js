import express from 'express';
import mongoose from 'mongoose';
import { getDBStatus, pingDB } from '../config/db.js';

const router = express.Router();

router.get('/health', async (req, res) => {
  const dbStatus = getDBStatus();
  const ping = await pingDB();

  const isHealthy = dbStatus === 'connected' && ping.ok;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'CivicEye Express Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: dbStatus,
      connected: dbStatus === 'connected',
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null,
      ping: ping.ok ? 'pong' : 'failed',
    },
  });
});

export default router;
