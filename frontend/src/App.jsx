import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Activity,
  Cpu,
  Database,
  Server,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  Zap,
  Info,
} from 'lucide-react';
import './App.css';

// Express Backend REST API URL - All client communication routes through here
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function App() {
  const [backendStatus, setBackendStatus] = useState({ loading: true, online: false, data: null });
  const [mlStatus, setMlStatus] = useState({ loading: true, online: false, data: null });
  const [lastChecked, setLastChecked] = useState(new Date());

  // Prediction tester state
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [confidenceParam, setConfidenceParam] = useState('0.50');
  const [analyzing, setAnalyzing] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const [predictionError, setPredictionError] = useState(null);
  const fileInputRef = useRef(null);

  const checkServices = async () => {
    setBackendStatus((prev) => ({ ...prev, loading: true }));
    setMlStatus((prev) => ({ ...prev, loading: true }));

    // Check Backend DB & API Health
    try {
      const res = await axios.get(`${BACKEND_URL}/health`, { timeout: 3000 });
      setBackendStatus({ loading: false, online: true, data: res.data });
    } catch (err) {
      setBackendStatus({ loading: false, online: false, data: null });
    }

    // Check ML Service status VIA Express Proxy (never calling FastAPI directly)
    try {
      const res = await axios.get(`${BACKEND_URL}/ml/health`, { timeout: 3000 });
      setMlStatus({ loading: false, online: res.data.online, data: res.data });
    } catch (err) {
      setMlStatus({ loading: false, online: false, data: null });
    }

    setLastChecked(new Date());
  };

  useEffect(() => {
    checkServices();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPredictionResult(null);
      setPredictionError(null);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPredictionResult(null);
    setPredictionError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyzeImage = async () => {
    if (!selectedFile) return;

    setAnalyzing(true);
    setPredictionResult(null);
    setPredictionError(null);

    const formData = new FormData();
    formData.append('image', selectedFile);
    if (confidenceParam) {
      formData.append('confidence', confidenceParam);
    }

    try {
      // Forward to Express -> FastAPI -> YOLO26
      const response = await axios.post(`${BACKEND_URL}/predict`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 15000,
      });

      setPredictionResult(response.data);
    } catch (err) {
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        (err.code === 'ECONNABORTED' ? 'Request timed out.' : 'Failed to connect to backend.');
      setPredictionError(errorMsg);
    } finally {
      setAnalyzing(false);
    }
  };

  const getIssueBadgeColor = (issue) => {
    switch (issue?.toLowerCase()) {
      case 'pothole':
        return '#f97316';
      case 'leakage':
        return '#3b82f6';
      case 'garbage':
        return '#10b981';
      default:
        return '#94a3b8';
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo-group">
          <div className="logo-icon">
            <Activity color="#ffffff" size={24} />
          </div>
          <div className="logo-text">
            <h1>CivicEye</h1>
            <p>AI-Based Civic Issue Reporting System</p>
          </div>
        </div>

        <button className="btn btn-secondary" onClick={checkServices}>
          <RefreshCw size={16} />
          Check Status
        </button>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-pill">
          <ShieldCheck size={14} />
          Phase 5: Express ↔ FastAPI ML Integration Active
        </div>
        <h2 className="hero-title">
          Smart Detection for <span>Cleaner & Safer Cities</span>
        </h2>
        <p className="hero-desc">
          Automated reporting and classification of potholes, pipe leakages, and garbage overflow
          powered by Ultralytics YOLO26 computer vision.
        </p>
      </section>

      {/* Architecture Cards */}
      <div className="grid-cards">
        {/* Frontend Card */}
        <div className="glass-panel service-card">
          <div>
            <div className="card-header">
              <div>
                <h3 className="service-title">React Client</h3>
                <p className="service-desc">Vite, React 18, Axios</p>
              </div>
              <span className="badge badge-success">
                <CheckCircle2 size={12} /> Active
              </span>
            </div>
          </div>
          <div>
            <div className="status-row">
              <span className="status-label">Route Flow</span>
              <span className="status-val">React → Express Only</span>
            </div>
            <div className="status-row" style={{ marginTop: '0.5rem' }}>
              <span className="status-label">Environment</span>
              <span className="status-val">{import.meta.env.MODE}</span>
            </div>
          </div>
        </div>

        {/* Backend Card */}
        <div className="glass-panel service-card">
          <div>
            <div className="card-header">
              <div>
                <h3 className="service-title">Express REST API</h3>
                <p className="service-desc">Node.js, Multer, Proxy Orchestration</p>
              </div>
              {backendStatus.loading ? (
                <span className="badge badge-warning">Checking...</span>
              ) : backendStatus.online ? (
                <span className="badge badge-success">
                  <CheckCircle2 size={12} /> Online
                </span>
              ) : (
                <span className="badge badge-warning">
                  <AlertCircle size={12} /> Standby
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="status-row">
              <span className="status-label">Database</span>
              <span
                className="status-val"
                style={{ color: backendStatus.data?.database?.connected ? '#34d399' : '#9ca3af' }}
              >
                {backendStatus.data?.database?.status || 'MongoDB (Port 27017)'}
              </span>
            </div>
            <div className="status-row" style={{ marginTop: '0.5rem' }}>
              <span className="status-label">Port</span>
              <span className="status-val">5000</span>
            </div>
          </div>
        </div>

        {/* ML Service Card */}
        <div className="glass-panel service-card">
          <div>
            <div className="card-header">
              <div>
                <h3 className="service-title">YOLO26 ML Service</h3>
                <p className="service-desc">FastAPI, Ultralytics YOLO26</p>
              </div>
              {mlStatus.loading ? (
                <span className="badge badge-warning">Checking...</span>
              ) : mlStatus.online ? (
                <span className="badge badge-success">
                  <CheckCircle2 size={12} /> Model Ready
                </span>
              ) : (
                <span className="badge badge-warning">
                  <AlertCircle size={12} /> Standby
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="status-row">
              <span className="status-label">Integration</span>
              <span className="status-val">Proxied via Express</span>
            </div>
            <div className="status-row" style={{ marginTop: '0.5rem' }}>
              <span className="status-label">Model Status</span>
              <span className="status-val">
                {mlStatus.data?.modelLoaded ? 'Loaded (YOLO26n)' : 'Standby / Loading'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 5: Image Prediction Testing Panel */}
      <section className="glass-panel prediction-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <div className="panel-icon">
              <Zap size={20} color="#3b82f6" />
            </div>
            <div>
              <h3 className="panel-title">End-to-End Civic Issue Detection (Phase 5)</h3>
              <p className="panel-subtitle">
                Test the complete flow: Client → Express (<code>POST /api/predict</code>) → FastAPI (<code>/predict</code>) → YOLO26
              </p>
            </div>
          </div>
          <span className="badge badge-pill">Express ML Bridge</span>
        </div>

        <div className="prediction-grid">
          {/* Upload Area */}
          <div className="upload-box">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="civic-image-upload"
            />

            {!previewUrl ? (
              <label htmlFor="civic-image-upload" className="dropzone">
                <Upload size={36} color="#60a5fa" />
                <span className="dropzone-title">Upload a road or civic problem photo</span>
                <span className="dropzone-hint">Supports JPEG, PNG, WEBP (Max 10MB)</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Files
                </button>
              </label>
            ) : (
              <div className="preview-container">
                <img src={previewUrl} alt="Upload preview" className="image-preview" />
                <div className="preview-meta">
                  <span className="filename">{selectedFile?.name}</span>
                  <span className="filesize">
                    {((selectedFile?.size || 0) / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="preview-actions">
                  <button className="btn btn-secondary" onClick={handleClearFile} disabled={analyzing}>
                    Change Image
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleAnalyzeImage}
                    disabled={analyzing}
                  >
                    {analyzing ? (
                      <>
                        <RefreshCw size={16} className="spin-icon" /> Analyzing...
                      </>
                    ) : (
                      <>
                        <Zap size={16} /> Analyze Issue
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results Area */}
          <div className="result-box">
            <h4 className="result-header">Detection Pipeline Results</h4>

            {analyzing && (
              <div className="empty-state">
                <RefreshCw size={36} className="spin-icon" color="#3b82f6" />
                <p>Forwarding to Express & executing YOLO26 inference...</p>
              </div>
            )}

            {predictionError && (
              <div className="error-alert">
                <AlertTriangle size={20} color="#ef4444" />
                <div>
                  <strong>Inference Error</strong>
                  <p>{predictionError}</p>
                </div>
              </div>
            )}

            {!analyzing && !predictionResult && !predictionError && (
              <div className="empty-state">
                <ImageIcon size={40} color="#475569" />
                <p>Select or drag an image and click "Analyze Issue" to test the pipeline.</p>
              </div>
            )}

            {predictionResult && (
              <div className="result-content">
                <div className="issue-highlight">
                  <div>
                    <span className="result-label">Identified Problem</span>
                    <h3
                      className="issue-name"
                      style={{ color: getIssueBadgeColor(predictionResult.prediction.issue) }}
                    >
                      {predictionResult.prediction.issue.toUpperCase()}
                    </h3>
                  </div>
                  <div className="confidence-pill">
                    <span className="confidence-num">
                      {(predictionResult.prediction.confidence * 100).toFixed(1)}%
                    </span>
                    <span className="confidence-label">Confidence</span>
                  </div>
                </div>

                {predictionResult.prediction.isUncertain && (
                  <div className="uncertain-banner">
                    <AlertCircle size={16} color="#fbbf24" />
                    <span>{predictionResult.prediction.message}</span>
                  </div>
                )}

                <div className="meta-list">
                  <div className="meta-row">
                    <span>Detections Found</span>
                    <strong>{predictionResult.prediction.detections?.length || 0} object(s)</strong>
                  </div>
                  <div className="meta-row">
                    <span>Model Variant</span>
                    <strong>{predictionResult.model?.variant} ({predictionResult.model?.architecture})</strong>
                  </div>
                  <div className="meta-row">
                    <span>Roundtrip Processing</span>
                    <strong>{predictionResult.meta?.durationMs} ms</strong>
                  </div>
                </div>

                {predictionResult.prediction.detections?.length > 0 && (
                  <div className="boxes-detail">
                    <span className="boxes-title">Bounding Boxes:</span>
                    <div className="boxes-scroll">
                      {predictionResult.prediction.detections.map((det, idx) => (
                        <div key={idx} className="box-item">
                          <span className="box-class">{det.class}</span>
                          <span className="box-conf">{(det.confidence * 100).toFixed(1)}%</span>
                          <span className="box-coords">[{det.bbox.join(', ')}]</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>CivicEye System &bull; Academic Full-Stack ML Project &bull; Ultralytics YOLO26</p>
      </footer>
    </div>
  );
}

export default App;
