import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Cpu, Database, Server, CheckCircle2, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import './App.css';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const ML_URL = 'http://127.0.0.1:8000';

function App() {
  const [backendStatus, setBackendStatus] = useState({ loading: true, online: false, data: null });
  const [mlStatus, setMlStatus] = useState({ loading: true, online: false, data: null });
  const [lastChecked, setLastChecked] = useState(new Date());

  const checkServices = async () => {
    setBackendStatus(prev => ({ ...prev, loading: true }));
    setMlStatus(prev => ({ ...prev, loading: true }));

    // Check Backend
    try {
      const res = await axios.get(`${BACKEND_URL}/health`, { timeout: 3000 });
      setBackendStatus({ loading: false, online: true, data: res.data });
    } catch (err) {
      setBackendStatus({ loading: false, online: false, data: null });
    }

    // Check ML Service
    try {
      const res = await axios.get(`${ML_URL}/health`, { timeout: 3000 });
      setMlStatus({ loading: false, online: true, data: res.data });
    } catch (err) {
      setMlStatus({ loading: false, online: false, data: null });
    }

    setLastChecked(new Date());
  };

  useEffect(() => {
    checkServices();
  }, []);

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
          Phase 1: Architecture & Toolchain Initialized
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
                <p className="service-desc">Vite, React 18, Axios, Leaflet</p>
              </div>
              <span className="badge badge-success">
                <CheckCircle2 size={12} /> Active
              </span>
            </div>
          </div>
          <div>
            <div className="status-row">
              <span className="status-label">Port</span>
              <span className="status-val">5173</span>
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
                <p className="service-desc">Node.js, Express, Mongoose</p>
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
              <span className="status-val" style={{ color: backendStatus.data?.database?.connected ? '#34d399' : '#9ca3af' }}>
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
              <span className="status-label">Baseline Weight</span>
              <span className="status-val">yolo26n.pt</span>
            </div>
            <div className="status-row" style={{ marginTop: '0.5rem' }}>
              <span className="status-label">Classes</span>
              <span className="status-val">pothole, leakage, garbage</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>CivicEye System &bull; Academic Full-Stack ML Project &bull; Ultralytics YOLO26</p>
      </footer>
    </div>
  );
}

export default App;
