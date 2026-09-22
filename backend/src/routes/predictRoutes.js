import express from 'express';
import { uploadSingleImage } from '../middleware/uploadMiddleware.js';
import { handlePrediction, getMlHealth } from '../controllers/predictController.js';

const router = express.Router();

/**
 * @route   POST /api/predict
 * @desc    Detect civic issue (pothole, leakage, garbage) in uploaded image via YOLO26 ML service
 * @access  Public
 */
router.post('/predict', uploadSingleImage, handlePrediction);

/**
 * @route   GET /api/ml/health
 * @desc    Check FastAPI ML service status and model loading state through Express
 * @access  Public
 */
router.get('/ml/health', getMlHealth);

export default router;
