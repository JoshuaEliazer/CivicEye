import { predictCivicIssue, checkMlHealth, MLServiceError } from '../services/mlService.js';

/**
 * Controller to handle civic issue image prediction.
 * Route: POST /api/predict
 */
export const handlePrediction = async (req, res, next) => {
  try {
    // 1. Validate file presence
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided. Please upload an image using multipart/form-data under the 'image' or 'file' field.",
        error: 'MISSING_IMAGE',
      });
    }

    // 2. Parse optional confidence override
    let confidenceOverride = null;
    const rawConf = req.body?.confidence || req.query?.confidence;
    if (rawConf !== undefined && rawConf !== null && rawConf !== '') {
      const parsed = parseFloat(rawConf);
      if (isNaN(parsed) || parsed < 0 || parsed > 1) {
        return res.status(400).json({
          success: false,
          message: "Confidence parameter must be a valid float between 0.0 and 1.0 (e.g., 0.50).",
          error: 'INVALID_CONFIDENCE_PARAM',
        });
      }
      confidenceOverride = parsed;
    }

    // 3. Forward to FastAPI ML service
    const startTime = Date.now();
    const result = await predictCivicIssue(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      confidenceOverride
    );
    const durationMs = Date.now() - startTime;

    // 4. Return clean structured JSON response
    return res.status(200).json({
      success: true,
      prediction: {
        issue: result.issue,
        confidence: result.confidence,
        isUncertain: result.isUncertain,
        message: result.message,
        detections: result.detections,
      },
      model: result.model,
      meta: {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        durationMs,
        processedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof MLServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        error: err.code,
      });
    }

    return next(err);
  }
};

/**
 * Controller to inspect ML Service health via Express.
 * Route: GET /api/ml/health
 */
export const getMlHealth = async (req, res) => {
  const health = await checkMlHealth();
  const statusCode = health.online ? 200 : 503;

  return res.status(statusCode).json({
    service: 'CivicEye ML Service Proxy',
    ...health,
  });
};

export default {
  handlePrediction,
  getMlHealth,
};
