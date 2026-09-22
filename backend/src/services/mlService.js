import dotenv from 'dotenv';

dotenv.config();

export const getMlServiceUrl = () => {
  const envUrl = process.env.ML_SERVICE_URL;
  if (!envUrl || envUrl === 'undefined' || envUrl.trim() === '') {
    return 'http://127.0.0.1:8000';
  }
  return envUrl.trim().replace(/\/+$/, '');
};

const getMlTimeout = () =>
  parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '10000', 10);

/**
 * Custom error class for ML service communication failures.
 */
export class MLServiceError extends Error {
  constructor(message, statusCode = 502, code = 'ML_SERVICE_ERROR', details = null) {
    super(message);
    this.name = 'MLServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Health check method to query the FastAPI ML service status.
 */
export const checkMlHealth = async (customTimeoutMs = 3000) => {
  const serviceUrl = getMlServiceUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), customTimeoutMs);

    const response = await fetch(`${serviceUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        online: false,
        status: 'degraded',
        message: `FastAPI responded with HTTP ${response.status}`,
        url: ML_SERVICE_URL,
      };
    }

    const data = await response.json();
    return {
      online: true,
      status: 'ok',
      modelLoaded: data?.model?.loaded ?? false,
      modelVariant: data?.model?.model_variant ?? 'YOLO26',
      architecture: data?.model?.architecture ?? 'Ultralytics YOLO26',
      supportedClasses: data?.model?.supported_classes ?? ['pothole', 'leakage', 'garbage'],
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError';
    return {
      online: false,
      status: 'offline',
      message: isTimeout ? 'ML Service connection timed out' : 'ML Service unreachable',
      error: err.code || err.name,
    };
  }
};

/**
 * Forwards an image buffer to FastAPI /predict for YOLO26 civic issue detection.
 *
 * @param {Buffer} buffer - Image file binary buffer
 * @param {string} originalname - Original file name
 * @param {string} mimetype - MIME type of the image
 * @param {number|null} confidence - Optional confidence override threshold
 * @param {number|null} timeoutMs - Optional custom timeout in milliseconds
 * @returns {Promise<Object>} Clean structured prediction response
 */
export const predictCivicIssue = async (
  buffer,
  originalname = 'image.jpg',
  mimetype = 'image/jpeg',
  confidence = null,
  timeoutMs = null
) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new MLServiceError('Invalid or empty image buffer provided.', 400, 'INVALID_IMAGE');
  }

  const effectiveTimeout = typeof timeoutMs === 'number' ? timeoutMs : getMlTimeout();
  const serviceUrl = getMlServiceUrl();

  // Construct multipart/form-data payload using native Node 24 FormData & Blob
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimetype });
  formData.append('file', blob, originalname);

  if (typeof confidence === 'number' && !isNaN(confidence) && confidence >= 0 && confidence <= 1) {
    formData.append('confidence', String(confidence));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  let response;
  try {
    response = await fetch(`${serviceUrl}/predict`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      throw new MLServiceError(
        `FastAPI ML Service timed out after ${effectiveTimeout}ms.`,
        504,
        'ML_SERVICE_TIMEOUT'
      );
    }

    const isConnRefused =
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.cause?.code === 'ECONNREFUSED' ||
      err.cause?.code === 'ENOTFOUND' ||
      err.cause?.message?.includes('ECONNREFUSED') ||
      (err.message && err.message.includes('fetch failed'));

    if (isConnRefused) {
      throw new MLServiceError(
        'FastAPI ML Service is currently unavailable or offline.',
        503,
        'ML_SERVICE_UNAVAILABLE'
      );
    }

    throw new MLServiceError(
      `Failed to communicate with ML Service: ${err.message}`,
      502,
      'ML_COMMUNICATION_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Parse response from FastAPI
  let responseData;
  try {
    responseData = await response.json();
  } catch {
    responseData = null;
  }

  // Handle non-200 responses from FastAPI
  if (!response.ok) {
    const errorDetail = responseData?.detail || `Inference service failed with status ${response.status}`;
    const statusCode = [400, 413, 422, 503].includes(response.status) ? response.status : 502;
    throw new MLServiceError(errorDetail, statusCode, 'ML_INFERENCE_ERROR');
  }

  if (!responseData || !responseData.success) {
    throw new MLServiceError(
      responseData?.error || 'ML Service returned unsuccessful prediction.',
      422,
      'INFERENCE_FAILED'
    );
  }

  // Format clean structured response without internal filesystem paths
  return {
    issue: responseData.issue || 'none',
    confidence: typeof responseData.confidence === 'number' ? responseData.confidence : 0.0,
    isUncertain: Boolean(responseData.is_uncertain),
    message: responseData.message || (responseData.issue !== 'none' ? `Detected ${responseData.issue}` : 'No civic issue detected'),
    detections: Array.isArray(responseData.detections)
      ? responseData.detections.map((d) => ({
          class: d.class,
          classId: d.class_id,
          confidence: d.confidence,
          bbox: d.bbox,
        }))
      : [],
    model: {
      architecture: responseData.model_info?.architecture || 'Ultralytics YOLO26',
      variant: responseData.model_info?.model_variant || 'YOLO26n',
      isCustomModel: Boolean(responseData.model_info?.is_custom_model),
    },
  };
};

export default {
  checkMlHealth,
  predictCivicIssue,
  MLServiceError,
};
