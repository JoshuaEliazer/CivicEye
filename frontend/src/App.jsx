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
  User,
  Lock,
  Mail,
  UserCheck,
  LogOut,
  Shield,
  KeyRound,
} from 'lucide-react';
import './App.css';

// Express Backend REST API URL - All client communication routes through here
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function App() {
  const [backendStatus, setBackendStatus] = useState({ loading: true, online: false, data: null });
  const [mlStatus, setMlStatus] = useState({ loading: true, online: false, data: null });
  const [lastChecked, setLastChecked] = useState(new Date());

  // Authentication State
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('civiceye_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('civiceye_token') || '');
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register'
  const [authFormData, setAuthFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'USER',
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState(null);
  const [protectedTestResult, setProtectedTestResult] = useState(null);

  // Prediction tester state (Phase 5)
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

  // Auth Handlers
  const handleAuthInputChange = (e) => {
    const { name, value } = e.target;
    setAuthFormData((prev) => ({ ...prev, [name]: value }));
    setAuthError(null);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const res = await axios.post(`${BACKEND_URL}/auth/register`, {
        name: authFormData.name,
        email: authFormData.email,
        password: authFormData.password,
        role: authFormData.role,
      });

      const { token, user, message } = res.data;
      setAuthToken(token);
      setCurrentUser(user);
      localStorage.setItem('civiceye_token', token);
      localStorage.setItem('civiceye_user', JSON.stringify(user));
      setAuthSuccess(message || 'Registration successful!');
      setAuthFormData({ name: '', email: '', password: '', role: 'USER' });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Registration failed.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const res = await axios.post(`${BACKEND_URL}/auth/login`, {
        email: authFormData.email,
        password: authFormData.password,
      });

      const { token, user, message } = res.data;
      setAuthToken(token);
      setCurrentUser(user);
      localStorage.setItem('civiceye_token', token);
      localStorage.setItem('civiceye_user', JSON.stringify(user));
      setAuthSuccess(message || 'Login successful!');
      setAuthFormData((prev) => ({ ...prev, password: '' }));
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Login failed.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setAuthToken('');
    localStorage.removeItem('civiceye_token');
    localStorage.removeItem('civiceye_user');
    setAuthSuccess('Logged out successfully.');
    setAuthError(null);
    setProtectedTestResult(null);
  };

  const testProtectedRoute = async (withToken = true) => {
    setProtectedTestResult(null);
    try {
      const headers = withToken && authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const res = await axios.get(`${BACKEND_URL}/auth/me`, { headers, timeout: 4000 });
      setProtectedTestResult({
        success: true,
        status: res.status,
        data: res.data,
      });
    } catch (err) {
      setProtectedTestResult({
        success: false,
        status: err.response?.status || 500,
        data: err.response?.data || { message: err.message },
      });
    }
  };

  // Prediction Handlers (Phase 5)
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
      const headers = { 'Content-Type': 'multipart/form-data' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await axios.post(`${BACKEND_URL}/predict`, formData, {
        headers,
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

        <div className="header-actions">
          {currentUser ? (
            <div className="user-badge-group">
              <div className="user-pill">
                <UserCheck size={16} color="#34d399" />
                <span className="user-name">{currentUser.name}</span>
                <span className="user-role-badge">{currentUser.role}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout} title="Sign Out">
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          ) : (
            <span className="guest-badge">
              <User size={14} /> Citizen Guest
            </span>
          )}

          <button className="btn btn-secondary" onClick={checkServices}>
            <RefreshCw size={16} />
            Check Status
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-pill">
          <ShieldCheck size={14} />
          Phase 6: JWT & Bcrypt Authentication Active
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
                <p className="service-desc">Vite, React 18, JWT Auth</p>
              </div>
              <span className="badge badge-success">
                <CheckCircle2 size={12} /> Active
              </span>
            </div>
          </div>
          <div>
            <div className="status-row">
              <span className="status-label">Auth Session</span>
              <span className="status-val" style={{ color: currentUser ? '#34d399' : '#9ca3af' }}>
                {currentUser ? `${currentUser.role} Authenticated` : 'Guest Session'}
              </span>
            </div>
            <div className="status-row" style={{ marginTop: '0.5rem' }}>
              <span className="status-label">Route Flow</span>
              <span className="status-val">React → Express Only</span>
            </div>
          </div>
        </div>

        {/* Backend Card */}
        <div className="glass-panel service-card">
          <div>
            <div className="card-header">
              <div>
                <h3 className="service-title">Express REST API</h3>
                <p className="service-desc">Node.js, JWT, Bcrypt, Multer</p>
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
              <span className="status-label">Auth Endpoints</span>
              <span className="status-val">/api/auth/* Active</span>
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

      {/* Phase 6: Authentication & User Management Panel */}
      <section className="glass-panel auth-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <div className="panel-icon auth-icon">
              <Lock size={20} color="#3b82f6" />
            </div>
            <div>
              <h3 className="panel-title">User Authentication & Session Management (Phase 6)</h3>
              <p className="panel-subtitle">
                Secure JWT & Bcrypt Authentication with role-based protected route enforcement
              </p>
            </div>
          </div>
          <span className="badge badge-pill">JWT + Bcrypt (10 Rounds)</span>
        </div>

        <div className="auth-grid">
          {/* Auth Form / User Info */}
          <div className="auth-form-card">
            {!currentUser ? (
              <>
                <div className="auth-tab-switch">
                  <button
                    className={`tab-btn ${authTab === 'login' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthTab('login');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                  >
                    Login
                  </button>
                  <button
                    className={`tab-btn ${authTab === 'register' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthTab('register');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                  >
                    Register
                  </button>
                </div>

                <form
                  onSubmit={authTab === 'login' ? handleLogin : handleRegister}
                  className="auth-form"
                >
                  {authTab === 'register' && (
                    <div className="form-group">
                      <label htmlFor="auth-name">Full Name</label>
                      <div className="input-with-icon">
                        <User size={16} className="input-icon" />
                        <input
                          id="auth-name"
                          type="text"
                          name="name"
                          placeholder="e.g. Maya Sharma"
                          value={authFormData.name}
                          onChange={handleAuthInputChange}
                          required
                          minLength={2}
                          className="text-input"
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="auth-email">Email Address</label>
                    <div className="input-with-icon">
                      <Mail size={16} className="input-icon" />
                      <input
                        id="auth-email"
                        type="email"
                        name="email"
                        placeholder="citizen@civiceye.local"
                        value={authFormData.email}
                        onChange={handleAuthInputChange}
                        required
                        className="text-input"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="auth-password">Password (min. 6 characters)</label>
                    <div className="input-with-icon">
                      <Lock size={16} className="input-icon" />
                      <input
                        id="auth-password"
                        type="password"
                        name="password"
                        placeholder="••••••••"
                        value={authFormData.password}
                        onChange={handleAuthInputChange}
                        required
                        minLength={6}
                        className="text-input"
                      />
                    </div>
                  </div>

                  {authTab === 'register' && (
                    <div className="form-group">
                      <label htmlFor="auth-role">Account Role</label>
                      <div className="input-with-icon">
                        <Shield size={16} className="input-icon" />
                        <select
                          id="auth-role"
                          name="role"
                          value={authFormData.role}
                          onChange={handleAuthInputChange}
                          className="text-input"
                        >
                          <option value="USER">USER (Citizen)</option>
                          <option value="ADMIN">ADMIN (Municipal Officer)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {authError && (
                    <div className="auth-alert error">
                      <AlertCircle size={16} />
                      <span>{authError}</span>
                    </div>
                  )}

                  {authSuccess && (
                    <div className="auth-alert success">
                      <CheckCircle2 size={16} />
                      <span>{authSuccess}</span>
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={authLoading}>
                    {authLoading ? (
                      <>
                        <RefreshCw size={16} className="spin-icon" /> Processing...
                      </>
                    ) : authTab === 'login' ? (
                      <>
                        <KeyRound size={16} /> Sign In
                      </>
                    ) : (
                      <>
                        <UserCheck size={16} /> Create Account
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="logged-in-card">
                <div className="profile-header">
                  <div className="avatar-circle">{currentUser.name?.charAt(0).toUpperCase()}</div>
                  <div>
                    <h4 className="profile-name">{currentUser.name}</h4>
                    <p className="profile-email">{currentUser.email}</p>
                    <span className="badge badge-success" style={{ marginTop: '0.25rem' }}>
                      {currentUser.role}
                    </span>
                  </div>
                </div>

                <div className="session-token-info">
                  <span className="token-label">Active JWT Bearer Token:</span>
                  <code className="token-snippet">
                    {authToken.substring(0, 36)}...{authToken.substring(authToken.length - 12)}
                  </code>
                </div>

                <div className="profile-actions">
                  <button className="btn btn-secondary" onClick={handleLogout}>
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Protected Route Verification Card */}
          <div className="auth-verify-card">
            <h4 className="result-header">Protected Route Verification</h4>
            <p className="verify-desc">
              Test Express JWT authentication middleware on <code>GET /api/auth/me</code>:
            </p>

            <div className="test-buttons-row">
              <button
                className="btn btn-primary"
                onClick={() => testProtectedRoute(true)}
                disabled={!authToken}
              >
                <Lock size={14} /> Test with Token
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => testProtectedRoute(false)}
              >
                <AlertTriangle size={14} /> Test without Token (Expect 401)
              </button>
            </div>

            {protectedTestResult ? (
              <div
                className={`verify-result-box ${protectedTestResult.success ? 'success' : 'error'}`}
              >
                <div className="verify-status-row">
                  <span className="status-tag">
                    HTTP {protectedTestResult.status} {protectedTestResult.success ? 'OK' : 'Error'}
                  </span>
                  <span className="status-label">
                    {protectedTestResult.success ? 'Token Verified' : 'Rejection Verified'}
                  </span>
                </div>
                <pre className="json-output">
                  {JSON.stringify(protectedTestResult.data, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <KeyRound size={32} color="#475569" />
                <p>Click a test button above to verify protected middleware response.</p>
              </div>
            )}
          </div>
        </div>
      </section>

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
