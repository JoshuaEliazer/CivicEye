import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield,
  BarChart3,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  Clock,
  Activity,
  XCircle,
  AlertCircle,
  Eye,
  MapPin,
  User,
  Calendar,
  Layers,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

export default function AdminDashboard({
  BACKEND_URL,
  authToken,
  currentUser,
  getStatusBadge,
  getIssueBadgeColor,
  onNavigateToCitizen,
}) {
  const [stats, setStats] = useState({
    totalComplaints: 0,
    submitted: 0,
    underReview: 0,
    inProgress: 0,
    resolved: 0,
    rejected: 0,
    potholes: 0,
    leakages: 0,
    garbage: 0,
    other: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);

  const [complaints, setComplaints] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [complaintsError, setComplaintsError] = useState(null);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [filters, setFilters] = useState({
    search: '',
    issueType: '',
    status: '',
  });

  // Modal / Detail state
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [newStatus, setNewStatus] = useState('in_progress');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const authHeaders = {
    headers: { Authorization: `Bearer ${authToken}` },
  };

  const fetchStatistics = async () => {
    if (!authToken) return;
    setLoadingStats(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/statistics`, {
        ...authHeaders,
        timeout: 5000,
      });
      if (res.data?.statistics) {
        setStats(res.data.statistics);
      }
    } catch (err) {
      console.error('Failed to load admin statistics:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchComplaints = async (page = 1, currentFilters = filters) => {
    if (!authToken) return;
    setLoadingComplaints(true);
    setComplaintsError(null);

    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', pagination.limit);

    if (currentFilters.search.trim()) {
      params.append('search', currentFilters.search.trim());
    }
    if (currentFilters.issueType) {
      params.append('issueType', currentFilters.issueType);
    }
    if (currentFilters.status) {
      params.append('status', currentFilters.status);
    }

    try {
      const res = await axios.get(`${BACKEND_URL}/admin/complaints?${params.toString()}`, {
        ...authHeaders,
        timeout: 8000,
      });

      setComplaints(res.data.complaints || []);
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setComplaintsError(
        err.response?.data?.message || err.message || 'Failed to fetch complaints list.'
      );
    } finally {
      setLoadingComplaints(false);
    }
  };

  useEffect(() => {
    if (authToken && currentUser?.role === 'ADMIN') {
      fetchStatistics();
      fetchComplaints(1, filters);
    }
  }, [authToken, currentUser]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchComplaints(1, filters);
  };

  const handleFilterChange = (key, value) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    fetchComplaints(1, updated);
  };

  const handleResetFilters = () => {
    const reset = { search: '', issueType: '', status: '' };
    setFilters(reset);
    fetchComplaints(1, reset);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    fetchComplaints(newPage, filters);
  };

  const openDetails = async (complaintId) => {
    setLoadingDetails(true);
    setStatusMessage(null);
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/complaints/${complaintId}`, {
        ...authHeaders,
        timeout: 6000,
      });
      setSelectedComplaint(res.data.complaint);
      setNewStatus(res.data.complaint.status || 'in_progress');
    } catch (err) {
      console.error('Failed to load complaint details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedComplaint || !newStatus) return;
    setUpdatingStatus(true);
    setStatusMessage(null);

    try {
      const res = await axios.patch(
        `${BACKEND_URL}/admin/complaints/${selectedComplaint.complaintId}/status`,
        { status: newStatus },
        { ...authHeaders, timeout: 6000 }
      );

      setStatusMessage({
        type: 'success',
        text: `Complaint status successfully updated to ${newStatus.toUpperCase()}`,
      });

      // Update selected complaint in modal
      setSelectedComplaint((prev) => ({
        ...prev,
        status: newStatus,
        updatedAt: res.data.complaint?.updatedAt || new Date().toISOString(),
      }));

      // Refresh list & statistics
      fetchComplaints(pagination.page, filters);
      fetchStatistics();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to update status.',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // If not admin, render access denied
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <div className="access-denied-panel glass-panel">
        <div className="access-denied-icon">
          <Shield size={48} color="#ef4444" />
        </div>
        <h2>Access Denied — Administrator Portal</h2>
        <p>
          You are currently signed in as a citizen user (<code>{currentUser?.email || 'Guest'}</code>).
          Access to municipal administration dashboards and complaint management requires an account with the{' '}
          <strong>ADMIN</strong> role.
        </p>
        <div className="access-denied-actions">
          <button className="btn btn-primary" onClick={onNavigateToCitizen}>
            Return to Citizen Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-container">
      {/* Top Banner */}
      <section className="hero admin-hero">
        <div className="hero-pill" style={{ borderColor: 'rgba(59, 130, 246, 0.4)', color: '#93c5fd' }}>
          <Shield size={14} />
          Phase 8: Municipal Administration & Complaint Lifecycle Active
        </div>
        <div className="admin-hero-row">
          <div>
            <h2 className="hero-title" style={{ fontSize: '2rem' }}>
              Municipal <span>Admin Dashboard</span>
            </h2>
            <p className="hero-desc" style={{ maxWidth: '650px' }}>
              Central monitoring, search, inspection, and status management for all civic issues submitted across the city.
            </p>
          </div>
          <div className="admin-hero-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                fetchStatistics();
                fetchComplaints(pagination.page, filters);
              }}
              disabled={loadingStats || loadingComplaints}
            >
              <RefreshCw size={14} className={loadingStats || loadingComplaints ? 'spin-icon' : ''} />
              Refresh Dashboard
            </button>
          </div>
        </div>
      </section>

      {/* Live Statistics Cards */}
      <section className="admin-stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
            <BarChart3 size={20} />
          </div>
          <div className="stat-card-info">
            <span className="stat-num">{stats.totalComplaints}</span>
            <span className="stat-label">Total Complaints</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd' }}>
            <Clock size={20} />
          </div>
          <div className="stat-card-info">
            <span className="stat-num">{stats.submitted}</span>
            <span className="stat-label">Submitted</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d' }}>
            <AlertCircle size={20} />
          </div>
          <div className="stat-card-info">
            <span className="stat-num">{stats.underReview}</span>
            <span className="stat-label">Under Review</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#d8b4fe' }}>
            <Activity size={20} />
          </div>
          <div className="stat-card-info">
            <span className="stat-num">{stats.inProgress}</span>
            <span className="stat-label">In Progress</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7' }}>
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-card-info">
            <span className="stat-num">{stats.resolved}</span>
            <span className="stat-label">Resolved</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
            <XCircle size={20} />
          </div>
          <div className="stat-card-info">
            <span className="stat-num">{stats.rejected}</span>
            <span className="stat-label">Rejected</span>
          </div>
        </div>
      </section>

      {/* Category Breakdown Chips */}
      <div className="category-chips-row">
        <span className="chips-label">Classified Breakdown:</span>
        <span className="cat-chip pothole">Potholes: {stats.potholes}</span>
        <span className="cat-chip leakage">Leakages: {stats.leakages}</span>
        <span className="cat-chip garbage">Garbage: {stats.garbage}</span>
        <span className="cat-chip other">Other / None: {stats.other}</span>
      </div>

      {/* Main Table & Filters Panel */}
      <section className="glass-panel admin-main-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <div className="panel-icon">
              <Shield size={20} color="#3b82f6" />
            </div>
            <div>
              <h3 className="panel-title">City-Wide Complaints Register</h3>
              <p className="panel-subtitle">
                Inspect details, reporter information, AI confidence scores, and update lifecycle states
              </p>
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="admin-toolbar">
          <form onSubmit={handleSearchSubmit} className="search-form">
            <div className="input-with-icon search-box">
              <Search size={16} className="input-icon" />
              <input
                type="text"
                className="text-input"
                placeholder="Search by ID (CE-...), address, description..."
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">
              Search
            </button>
          </form>

          <div className="filters-group">
            <div className="filter-select-wrapper">
              <Filter size={14} className="filter-icon" />
              <select
                className="text-input filter-select"
                value={filters.issueType}
                onChange={(e) => handleFilterChange('issueType', e.target.value)}
              >
                <option value="">All Issue Types</option>
                <option value="pothole">Pothole</option>
                <option value="leakage">Leakage</option>
                <option value="garbage">Garbage</option>
                <option value="other">Other</option>
                <option value="none">None / Baseline</option>
              </select>
            </div>

            <div className="filter-select-wrapper">
              <Filter size={14} className="filter-icon" />
              <select
                className="text-input filter-select"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under Review</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {(filters.search || filters.issueType || filters.status) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleResetFilters}
                title="Reset all filters"
              >
                <RotateCcw size={14} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Complaints Table */}
        <div className="table-responsive">
          {loadingComplaints ? (
            <div className="empty-state">
              <RefreshCw size={32} className="spin-icon" color="#3b82f6" />
              <p>Loading complaints from database...</p>
            </div>
          ) : complaintsError ? (
            <div className="error-alert" style={{ margin: '1.5rem' }}>
              <AlertCircle size={18} />
              <span>{complaintsError}</span>
            </div>
          ) : complaints.length === 0 ? (
            <div className="empty-state">
              <AlertCircle size={40} color="#475569" />
              <p>No complaints matched your search and filter criteria.</p>
              <button className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
                Clear Filters
              </button>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Complaint ID</th>
                  <th>Issue & Confidence</th>
                  <th>Status</th>
                  <th>Reporter</th>
                  <th>Location / Landmark</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((item) => (
                  <tr key={item.complaintId} className="admin-table-row">
                    <td>
                      <span className="complaint-id-badge">{item.complaintId}</span>
                    </td>
                    <td>
                      <div className="table-issue-cell">
                        <span
                          className="issue-tag"
                          style={{
                            backgroundColor: `${getIssueBadgeColor(item.issueType)}20`,
                            color: getIssueBadgeColor(item.issueType),
                            borderColor: `${getIssueBadgeColor(item.issueType)}40`,
                          }}
                        >
                          {item.issueType?.toUpperCase()}
                        </span>
                        <span className="conf-score">
                          {(item.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>
                      <div className="table-user-cell">
                        <span className="reporter-name">{item.user?.name || item.userId?.name || 'Citizen'}</span>
                        <span className="reporter-email">{item.user?.email || item.userId?.email || 'N/A'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="table-address" title={item.location?.address || 'No address'}>
                        {item.location?.address || (item.latitude && `${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}`) || 'No GPS'}
                      </span>
                    </td>
                    <td>
                      <span className="table-date">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm table-action-btn"
                        onClick={() => openDetails(item.complaintId)}
                      >
                        <Eye size={13} /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        {!loadingComplaints && complaints.length > 0 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              <strong>{pagination.total}</strong> complaints
            </div>
            <div className="pagination-controls">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="page-indicator">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Complaint Detail & Status Action Modal */}
      {selectedComplaint && (
        <div className="modal-overlay" onClick={() => setSelectedComplaint(null)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="complaint-id-badge" style={{ fontSize: '1rem', padding: '4px 10px' }}>
                  {selectedComplaint.complaintId}
                </span>
                {getStatusBadge(selectedComplaint.status)}
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedComplaint(null)}
                title="Close Modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body-grid">
              {/* Left Column: Evidence & Location */}
              <div className="modal-col">
                <div className="modal-section-title">Evidence Photo & Description</div>
                {selectedComplaint.imageUrl || selectedComplaint.image?.path ? (
                  <div className="modal-img-container">
                    <img
                      src={selectedComplaint.imageUrl || selectedComplaint.image?.path}
                      alt="Complaint Evidence"
                      className="modal-evidence-img"
                    />
                  </div>
                ) : (
                  <div className="modal-no-img">No Image Available</div>
                )}

                <div className="detail-field-box" style={{ marginTop: '1rem' }}>
                  <label>Problem Description</label>
                  <p className="detail-field-desc">{selectedComplaint.description}</p>
                </div>

                <div className="detail-field-box">
                  <label>Geographic Location</label>
                  <div className="detail-location-info">
                    <MapPin size={16} color="#60a5fa" />
                    <span>
                      {selectedComplaint.latitude && selectedComplaint.longitude
                        ? `${selectedComplaint.latitude.toFixed(6)}, ${selectedComplaint.longitude.toFixed(6)}`
                        : 'No coordinates provided'}
                    </span>
                  </div>
                  {selectedComplaint.location?.address && (
                    <p className="detail-address-text">{selectedComplaint.location.address}</p>
                  )}
                </div>
              </div>

              {/* Right Column: AI Metrics & Status Management */}
              <div className="modal-col">
                <div className="modal-section-title">Reporter & ML Classification</div>

                <div className="reporter-card">
                  <div className="reporter-avatar">
                    <User size={18} />
                  </div>
                  <div>
                    <h5 className="reporter-title">{selectedComplaint.user?.name || selectedComplaint.userId?.name || 'Citizen'}</h5>
                    <p className="reporter-sub">{selectedComplaint.user?.email || selectedComplaint.userId?.email || 'N/A'}</p>
                    <span className="badge badge-success" style={{ marginTop: '0.25rem', fontSize: '0.7rem' }}>
                      {selectedComplaint.user?.role || 'USER'}
                    </span>
                  </div>
                </div>

                <div className="ai-breakdown-card">
                  <div className="ai-header-row">
                    <span className="ai-label">YOLO26 Detection</span>
                    <span
                      className="issue-tag"
                      style={{
                        backgroundColor: `${getIssueBadgeColor(selectedComplaint.issueType)}20`,
                        color: getIssueBadgeColor(selectedComplaint.issueType),
                        borderColor: `${getIssueBadgeColor(selectedComplaint.issueType)}40`,
                      }}
                    >
                      {selectedComplaint.issueType?.toUpperCase()}
                    </span>
                  </div>
                  <div className="meta-list" style={{ marginTop: '0.75rem' }}>
                    <div className="meta-row">
                      <span>Model Architecture</span>
                      <strong>{selectedComplaint.modelArchitecture || 'Ultralytics YOLO26'}</strong>
                    </div>
                    <div className="meta-row">
                      <span>Model Variant</span>
                      <strong>{selectedComplaint.modelVariant || 'YOLO26n'}</strong>
                    </div>
                    <div className="meta-row">
                      <span>Confidence Score</span>
                      <strong style={{ color: '#38bdf8' }}>
                        {(selectedComplaint.confidence * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <div className="meta-row">
                      <span>Bounding Boxes</span>
                      <strong>{selectedComplaint.detections?.length || 0} object(s)</strong>
                    </div>
                  </div>

                  {selectedComplaint.detections?.length > 0 && (
                    <div className="boxes-scroll" style={{ maxHeight: '90px', marginTop: '0.5rem' }}>
                      {selectedComplaint.detections.map((d, i) => (
                        <div key={i} className="box-item">
                          <span>{d.class}</span>
                          <span>{(d.confidence * 100).toFixed(1)}%</span>
                          <span>[{d.bbox?.join(', ')}]</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status Update Control */}
                <div className="status-management-card">
                  <h4 className="status-card-title">Update Lifecycle Status</h4>
                  <p className="status-card-desc">
                    Change complaint state in the municipal database to notify the citizen and advance workflow.
                  </p>

                  <div className="status-control-row">
                    <select
                      className="text-input"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                    >
                      <option value="submitted">Submitted</option>
                      <option value="under_review">Under Review</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="rejected">Rejected</option>
                    </select>

                    <button
                      className="btn btn-primary"
                      onClick={handleUpdateStatus}
                      disabled={updatingStatus || newStatus === selectedComplaint.status}
                    >
                      {updatingStatus ? <RefreshCw size={14} className="spin-icon" /> : <CheckCircle2 size={14} />}
                      {updatingStatus ? 'Saving...' : 'Update Status'}
                    </button>
                  </div>

                  {statusMessage && (
                    <div
                      className={`auth-alert ${statusMessage.type === 'success' ? 'success' : 'error'}`}
                      style={{ marginTop: '0.75rem' }}
                    >
                      {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span>{statusMessage.text}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <span className="modal-date-text">
                Reported on: {new Date(selectedComplaint.createdAt).toLocaleString()} &bull; Last updated:{' '}
                {new Date(selectedComplaint.updatedAt).toLocaleString()}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedComplaint(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
