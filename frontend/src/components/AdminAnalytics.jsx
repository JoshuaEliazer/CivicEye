import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Activity,
  XCircle,
  MapPin,
  Cpu,
  ShieldCheck,
  FileSpreadsheet,
  Filter,
  Info,
  ChevronRight,
} from 'lucide-react';
import ComplaintMap from './ComplaintMap.jsx';

/**
 * Clean SVG Donut Chart for Status Distribution
 */
function DonutChart({ data, total }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0 || total === 0) {
    return (
      <div className="analytics-empty-chart">
        <p>No status data available for selected range</p>
      </div>
    );
  }

  const radius = 70;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;

  // Calculate cumulative arc offsets
  let accumulatedPercent = 0;
  const slices = data
    .filter((d) => d.count > 0)
    .map((item, idx) => {
      const percent = item.count / total;
      const strokeDasharray = `${percent * circumference} ${circumference}`;
      const strokeDashoffset = -accumulatedPercent * circumference;
      accumulatedPercent += percent;

      return {
        ...item,
        idx,
        strokeDasharray,
        strokeDashoffset,
      };
    });

  return (
    <div className="donut-chart-container">
      <div className="donut-chart-svg-wrapper">
        <svg viewBox="0 0 200 200" className="donut-svg">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={strokeWidth}
          />
          {slices.map((slice) => (
            <circle
              key={slice.status}
              cx="100"
              cy="100"
              r={radius}
              fill="transparent"
              stroke={slice.color}
              strokeWidth={hoveredIdx === slice.idx ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={slice.strokeDasharray}
              strokeDashoffset={slice.strokeDashoffset}
              strokeLinecap="round"
              className="donut-segment"
              transform="rotate(-90 100 100)"
              onMouseEnter={() => setHoveredIdx(slice.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
          {/* Centered Total */}
          <text x="100" y="94" textAnchor="middle" className="donut-center-num">
            {hoveredIdx !== null ? slices[hoveredIdx]?.count : total}
          </text>
          <text x="100" y="112" textAnchor="middle" className="donut-center-label">
            {hoveredIdx !== null ? slices[hoveredIdx]?.label : 'Total'}
          </text>
        </svg>
      </div>

      <div className="donut-legend-list">
        {data.map((item, idx) => (
          <div
            key={item.status}
            className={`donut-legend-item ${hoveredIdx === idx ? 'hovered' : ''}`}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span className="legend-dot" style={{ backgroundColor: item.color }} />
            <span className="legend-label">{item.label}</span>
            <span className="legend-val">{item.count}</span>
            <span className="legend-pct">({item.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Clean SVG Trend Line Chart
 */
function TrendLineChart({ data }) {
  const [activePoint, setActivePoint] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="analytics-empty-chart">
        <p>No complaint activity recorded in this period</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 180;
  const chartWidth = 540;
  const paddingX = 40;
  const paddingY = 25;

  const innerW = chartWidth - paddingX * 2;
  const innerH = chartHeight - paddingY * 2;

  // Calculate points
  const points = data.map((d, i) => {
    const x =
      data.length === 1
        ? paddingX + innerW / 2
        : paddingX + (i / (data.length - 1)) * innerW;
    const y = paddingY + innerH - (d.count / maxVal) * innerH;
    return { ...d, x, y };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD =
    points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} ${paddingY + innerH} L ${points[0].x} ${
          paddingY + innerH
        } Z`
      : '';

  // Y-axis grid lines (3 tiers: 0, 50%, 100%)
  const gridLevels = [
    { val: maxVal, y: paddingY },
    { val: Math.round(maxVal / 2), y: paddingY + innerH / 2 },
    { val: 0, y: paddingY + innerH },
  ];

  return (
    <div className="trend-chart-wrapper">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="trend-svg">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid lines */}
        {gridLevels.map((lvl, idx) => (
          <g key={idx}>
            <line
              x1={paddingX}
              y1={lvl.y}
              x2={chartWidth - paddingX}
              y2={lvl.y}
              stroke="rgba(255, 255, 255, 0.07)"
              strokeDasharray="4 4"
            />
            <text
              x={paddingX - 8}
              y={lvl.y + 4}
              textAnchor="end"
              className="chart-axis-text"
            >
              {lvl.val}
            </text>
          </g>
        ))}

        {/* Gradient Area Fill */}
        {areaD && <path d={areaD} fill="url(#areaGradient)" />}

        {/* Path Line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data Circles */}
        {points.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={activePoint?.date === p.date ? 6 : 3.5}
            fill="#60a5fa"
            stroke="#0f172a"
            strokeWidth="2"
            className="trend-circle"
            onMouseEnter={() => setActivePoint(p)}
            onMouseLeave={() => setActivePoint(null)}
          />
        ))}
      </svg>

      {/* Tooltip / Active Point Summary */}
      <div className="trend-active-legend">
        {activePoint ? (
          <span>
            <strong>{activePoint.date}:</strong> {activePoint.count} complaint(s) submitted
          </span>
        ) : (
          <span className="text-muted">Hover over points to inspect date counts</span>
        )}
      </div>
    </div>
  );
}

/**
 * Category Breakdown Horizontal Bars
 */
function CategoryBarChart({ data, total }) {
  if (!data || data.length === 0 || total === 0) {
    return (
      <div className="analytics-empty-chart">
        <p>No category data recorded in this period</p>
      </div>
    );
  }

  return (
    <div className="category-bars-container">
      {data.map((item) => (
        <div key={item.category} className="cat-bar-row">
          <div className="cat-bar-header">
            <span className="cat-bar-title">{item.label}</span>
            <div className="cat-bar-stats">
              <strong style={{ color: item.color }}>{item.count}</strong>
              <span className="cat-bar-pct">({item.percentage}%)</span>
            </div>
          </div>
          <div className="cat-bar-track">
            <div
              className="cat-bar-fill"
              style={{
                width: `${Math.max(item.percentage, item.count > 0 ? 3 : 0)}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Confidence Distribution Bars
 */
function ConfidenceHistogram({ bins }) {
  if (!bins || bins.length === 0) return null;
  const maxBinCount = Math.max(...bins.map((b) => b.count), 1);

  return (
    <div className="conf-histogram-container">
      {bins.map((bin) => {
        const heightPct = (bin.count / maxBinCount) * 100;
        return (
          <div key={bin.range} className="conf-hist-col">
            <span className="conf-hist-count">{bin.count}</span>
            <div className="conf-hist-bar-track">
              <div
                className="conf-hist-bar-fill"
                style={{ height: `${Math.max(heightPct, bin.count > 0 ? 8 : 0)}%` }}
              />
            </div>
            <span className="conf-hist-label">{bin.range}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAnalytics({
  BACKEND_URL,
  authToken,
  currentUser,
  getStatusBadge,
  getIssueBadgeColor,
}) {
  const [selectedPreset, setSelectedPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchAnalytics = async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (isCustomMode && (customFrom || customTo)) {
        if (customFrom) params.append('from', customFrom);
        if (customTo) params.append('to', customTo);
      } else {
        params.append('preset', selectedPreset);
      }

      const res = await axios.get(`${BACKEND_URL}/admin/analytics/overview?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 10000,
      });

      setAnalyticsData(res.data);
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || 'Failed to retrieve analytics overview.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPreset, isCustomMode]);

  const handlePresetSelect = (preset) => {
    setIsCustomMode(false);
    setSelectedPreset(preset);
  };

  const handleApplyCustomRange = (e) => {
    e.preventDefault();
    if (customFrom && customTo && new Date(customFrom) > new Date(customTo)) {
      setError('"From" date cannot be after "To" date.');
      return;
    }
    setIsCustomMode(true);
    fetchAnalytics();
  };

  const handleExportCSV = async () => {
    if (!authToken || exporting) return;
    setExporting(true);

    try {
      const params = new URLSearchParams();
      if (isCustomMode && (customFrom || customTo)) {
        if (customFrom) params.append('from', customFrom);
        if (customTo) params.append('to', customTo);
      } else {
        params.append('preset', selectedPreset);
      }

      const res = await axios.get(`${BACKEND_URL}/admin/analytics/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'blob',
        timeout: 12000,
      });

      // Trigger browser download
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `civiceye-analytics-${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download CSV export. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="admin-analytics-view">
      {/* Analytics Controls Toolbar */}
      <div className="analytics-toolbar glass-panel">
        <div className="analytics-toolbar-left">
          <span className="toolbar-label">
            <Calendar size={15} /> Time Period:
          </span>
          <div className="preset-btn-group">
            {[
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: '90d', label: 'Last 90 Days' },
              { id: 'all', label: 'All Time' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-btn ${!isCustomMode && selectedPreset === p.id ? 'active' : ''}`}
                onClick={() => handlePresetSelect(p.id)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={`preset-btn ${isCustomMode ? 'active' : ''}`}
              onClick={() => setIsCustomMode(true)}
            >
              Custom Range
            </button>
          </div>
        </div>

        <div className="analytics-toolbar-right">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fetchAnalytics}
            disabled={loading}
            title="Refresh analytics data"
          >
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleExportCSV}
            disabled={exporting || loading}
            title="Export aggregated data to CSV"
          >
            <Download size={14} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Custom Date Range Selector (When active) */}
      {isCustomMode && (
        <form onSubmit={handleApplyCustomRange} className="custom-range-card glass-panel">
          <div className="custom-range-inputs">
            <div className="date-input-group">
              <label>From Date:</label>
              <input
                type="date"
                className="text-input"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="date-input-group">
              <label>To Date:</label>
              <input
                type="date"
                className="text-input"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
              Apply Range
            </button>
          </div>
        </form>
      )}

      {/* Loading & Error States */}
      {loading && !analyticsData && (
        <div className="dashboard-state-box loading" style={{ padding: '4rem 1rem' }}>
          <RefreshCw size={36} className="spin-icon" color="#3b82f6" />
          <h4>Computing City Analytics & Aggregations...</h4>
          <p>Processing MongoDB pipelines across complaint lifecycle records.</p>
        </div>
      )}

      {error && (
        <div className="dashboard-state-box error" style={{ margin: '1rem 0' }}>
          <AlertCircle size={36} color="#ef4444" />
          <h4>Unable to Load Analytics</h4>
          <p>{error}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={fetchAnalytics}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Main Analytics Content */}
      {analyticsData && (
        <div className="analytics-body-grid">
          {/* Key Metrics Summary Cards */}
          <section className="analytics-summary-grid">
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                <BarChart3 size={20} />
              </div>
              <div className="stat-card-info">
                <span className="stat-num">{analyticsData.overview.totalInRange}</span>
                <span className="stat-label">Complaints in Period</span>
                <span className="stat-sub">All-time total: {analyticsData.overview.totalAllTime}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d' }}>
                <Clock size={20} />
              </div>
              <div className="stat-card-info">
                <span className="stat-num">{analyticsData.overview.underReview}</span>
                <span className="stat-label">Under Review</span>
                <span className="stat-sub">{analyticsData.overview.submitted} submitted / pending</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(129, 140, 248, 0.15)', color: '#818cf8' }}>
                <Activity size={20} />
              </div>
              <div className="stat-card-info">
                <span className="stat-num">{analyticsData.overview.inProgress}</span>
                <span className="stat-label">In Progress</span>
                <span className="stat-sub">Active field crew assignment</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <CheckCircle2 size={20} />
              </div>
              <div className="stat-card-info">
                <span className="stat-num">{analyticsData.overview.resolved}</span>
                <span className="stat-label">Resolved</span>
                <span className="stat-sub">{analyticsData.overview.resolutionRate}% resolution rate</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                <XCircle size={20} />
              </div>
              <div className="stat-card-info">
                <span className="stat-num">{analyticsData.overview.rejected}</span>
                <span className="stat-label">Rejected</span>
                <span className="stat-sub">Out of scope or duplicate</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8' }}>
                <TrendingUp size={20} />
              </div>
              <div className="stat-card-info">
                <span className="stat-num">
                  {analyticsData.resolution.hasSufficientData
                    ? `${analyticsData.resolution.averageHours}h`
                    : 'N/A'}
                </span>
                <span className="stat-label">Avg Resolution Time</span>
                <span className="stat-sub">
                  {analyticsData.resolution.hasSufficientData
                    ? `~${analyticsData.resolution.averageDays} days (${analyticsData.resolution.timedCount} timed)`
                    : 'No timestamps recorded'}
                </span>
              </div>
            </div>
          </section>

          {/* Row 2: Trend Chart & Category Distribution */}
          <div className="analytics-dual-row">
            {/* Trend Chart */}
            <div className="glass-panel analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h4 className="analytics-card-title">Complaint Submission Trend</h4>
                  <p className="analytics-card-subtitle">
                    Recorded submissions over time ({analyticsData.dateRange.label})
                  </p>
                </div>
                <span className="badge badge-pill">
                  {analyticsData.trends.length} {analyticsData.dateRange.period} point(s)
                </span>
              </div>
              <TrendLineChart data={analyticsData.trends} />
            </div>

            {/* Category Breakdown */}
            <div className="glass-panel analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h4 className="analytics-card-title">Issue Category Breakdown</h4>
                  <p className="analytics-card-subtitle">
                    Factual distribution across CivicEye classes
                  </p>
                </div>
              </div>
              <CategoryBarChart
                data={analyticsData.byCategory}
                total={analyticsData.overview.totalInRange}
              />
            </div>
          </div>

          {/* Row 3: Status Donut Chart & Resolution Details */}
          <div className="analytics-dual-row">
            {/* Status Donut */}
            <div className="glass-panel analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h4 className="analytics-card-title">Status Lifecycle Distribution</h4>
                  <p className="analytics-card-subtitle">
                    Current stage of complaints in selected period
                  </p>
                </div>
              </div>
              <DonutChart
                data={analyticsData.byStatus}
                total={analyticsData.overview.totalInRange}
              />
            </div>

            {/* Resolution Duration Metrics */}
            <div className="glass-panel analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h4 className="analytics-card-title">Resolution Performance</h4>
                  <p className="analytics-card-subtitle">
                    Measured resolution intervals (resolvedAt − createdAt)
                  </p>
                </div>
                <span
                  className={`badge ${
                    analyticsData.resolution.hasSufficientData ? 'badge-success' : 'badge-warning'
                  }`}
                >
                  {analyticsData.resolution.hasSufficientData ? 'Verified Data' : 'Pending Data'}
                </span>
              </div>

              {analyticsData.resolution.hasSufficientData ? (
                <div className="resolution-metrics-grid">
                  <div className="resolution-metric-box">
                    <span className="res-box-label">Average Resolution Time</span>
                    <strong className="res-box-val">{analyticsData.resolution.averageHours} hrs</strong>
                    <span className="res-box-sub">Approx. {analyticsData.resolution.averageDays} days</span>
                  </div>
                  <div className="resolution-metric-box">
                    <span className="res-box-label">Median Resolution Time</span>
                    <strong className="res-box-val">{analyticsData.resolution.medianHours} hrs</strong>
                    <span className="res-box-sub">Middle value of resolved pool</span>
                  </div>
                  <div className="resolution-metric-box">
                    <span className="res-box-label">Fastest Resolution</span>
                    <strong className="res-box-val" style={{ color: '#34d399' }}>
                      {analyticsData.resolution.minHours} hrs
                    </strong>
                    <span className="res-box-sub">Fastest turnaround recorded</span>
                  </div>
                  <div className="resolution-metric-box">
                    <span className="res-box-label">Slowest Resolution</span>
                    <strong className="res-box-val" style={{ color: '#f59e0b' }}>
                      {analyticsData.resolution.maxHours} hrs
                    </strong>
                    <span className="res-box-sub">Longest turnaround recorded</span>
                  </div>
                </div>
              ) : (
                <div className="analytics-insufficient-box">
                  <Info size={28} color="#94a3b8" />
                  <h5>Insufficient Resolution Timestamp Data</h5>
                  <p>
                    Resolution timestamps are recorded automatically when complaints are transitioned
                    to <strong>Resolved</strong> by an administrator. Resolution metrics will appear as
                    new issues are resolved.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Row 4: ML Prediction Statistics & Factual City Insights */}
          <div className="analytics-dual-row">
            {/* ML Prediction Statistics */}
            <div className="glass-panel analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h4 className="analytics-card-title">ML Prediction Statistics</h4>
                  <p className="analytics-card-subtitle">
                    Recorded YOLO26 model confidence at complaint submission
                  </p>
                </div>
                <span className="badge badge-pill">YOLO26n Inference</span>
              </div>

              <div className="ml-summary-row">
                <div className="ml-summary-stat">
                  <span className="ml-stat-label">Avg Confidence</span>
                  <strong className="ml-stat-num">{analyticsData.ml.averageConfidence}%</strong>
                </div>
                <div className="ml-summary-stat">
                  <span className="ml-stat-label">Min Confidence</span>
                  <strong className="ml-stat-num">{analyticsData.ml.minConfidence}%</strong>
                </div>
                <div className="ml-summary-stat">
                  <span className="ml-stat-label">Max Confidence</span>
                  <strong className="ml-stat-num">{analyticsData.ml.maxConfidence}%</strong>
                </div>
                <div className="ml-summary-stat">
                  <span className="ml-stat-label">Uncertain Detections</span>
                  <strong className="ml-stat-num">{analyticsData.ml.uncertainDetections}</strong>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem' }}>
                <span className="subsection-title">Confidence Distribution</span>
                <ConfidenceHistogram bins={analyticsData.ml.confidenceDistribution} />
              </div>

              <div className="ml-disclaimer-note">
                <Info size={14} />
                <span>{analyticsData.ml.notice}</span>
              </div>
            </div>

            {/* Factual City Insights */}
            <div className="glass-panel analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h4 className="analytics-card-title">Factual City Insights</h4>
                  <p className="analytics-card-subtitle">
                    Automated, neutral summaries derived from complaint database
                  </p>
                </div>
                <span className="badge badge-success">
                  <ShieldCheck size={12} /> Data Grounded
                </span>
              </div>

              <ul className="city-insights-list">
                {analyticsData.cityInsights.map((insight, idx) => (
                  <li key={idx} className="city-insight-item">
                    <ChevronRight size={16} className="insight-bullet-icon" />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Row 5: Geospatial Distribution Section */}
          <div className="glass-panel analytics-card" style={{ marginTop: '1.5rem' }}>
            <div className="analytics-card-header">
              <div>
                <h4 className="analytics-card-title">Geospatial Distribution ({analyticsData.dateRange.label})</h4>
                <p className="analytics-card-subtitle">
                  {analyticsData.location.withCoordinatesCount} complaint(s) with valid GPS coordinates (
                  {analyticsData.location.coordinateRate}% coverage)
                </p>
              </div>
              <span className="badge badge-pill">
                <MapPin size={12} /> {analyticsData.location.markers.length} Map Pins
              </span>
            </div>

            {analyticsData.location.markers.length > 0 ? (
              <div style={{ padding: '0.75rem' }}>
                <ComplaintMap
                  complaints={analyticsData.location.markers}
                  role="admin"
                  height="450px"
                  getStatusBadge={getStatusBadge}
                  getIssueBadgeColor={getIssueBadgeColor}
                />
              </div>
            ) : (
              <div className="analytics-empty-chart" style={{ padding: '3rem 1rem' }}>
                <MapPin size={36} color="#64748b" style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                <p>No geotagged complaints recorded in this period.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
