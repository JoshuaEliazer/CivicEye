import mongoose from 'mongoose';

// Connection event listeners
mongoose.connection.on('connected', () => {
  console.log('[MongoDB] Connection established successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB] Connection error event: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Disconnected from database.');
});

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/civiceye';
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (error) {
    console.error(`[MongoDB] Connection failure: ${error.message}`);
    return false;
  }
};

export const getDBStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
};

export const pingDB = async () => {
  if (mongoose.connection.readyState !== 1) {
    return { ok: false, error: 'Database not connected' };
  }
  try {
    const pingResult = await mongoose.connection.db.admin().ping();
    return { ok: true, result: pingResult };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};
