import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  FileText,
  CheckCircle2,
  Clock,
  Activity,
  XCircle,
  AlertCircle,
  Eye,
  MapPin,
  Calendar,
  Layers,
  X,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Map as MapIcon,
  List,
  Image as ImageIcon,
  Cpu,
  ShieldCheck,
  User,
  Mail,
  ChevronRight,
} from 'lucide-react';
import { Marker, Popup } from 'react-leaflet';
import ComplaintMap from './ComplaintMap.jsx';
import MapView, { NEUTRAL_MAP_CENTER, createCustomMarkerIcon } from './MapView.jsx';

/**
 * Format timestamp into human-readable date (e.g., "28 Sep 2026")
 */
const formatDate = (isoString) => {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(isoString);
  }
};

/**
 * Format timestamp into date & time
 */
const formatDateTime = (isoString) => {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoString);
  }
};

export default function UserDashboard({
  BACKEND_URL,
  authToken,
  currentUser,
  getStatusBadge,
  getIssueBadgeColor,
  onNavigateToReport,
  initialComplaintId,
  onClearInitialComplaintId,
}) {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'map'

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [issueTypeFilter, setIssueTypeFilter] = useState('');

  // Complaint Detail State (Loaded via GET /api/complaints/:complaintId)
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Helper to build authenticated image URL
  const getComplaintImageUrl = (complaint) => {
    if (!complaint) return null;
    const rawUrl = complaint.image?.url || complaint.imageUrl;

    if (rawUrl && typeof rawUrl === 'string' && rawUrl.startsWith('/api/')) {
      const apiBase = (BACKEND_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
      const fullUrl = `${apiBase}${rawUrl}`;
      return authToken ? `${fullUrl}?token=${encodeURIComponent(authToken)}` : fullUrl;
    }

    if (rawUrl && typeof rawUrl === 'string' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
      if (authToken && rawUrl.includes('/api/complaints/') && !rawUrl.includes('token=')) {
        const sep = rawUrl.includes('?') ? '&' : '?';
        return `${rawUrl}${sep}token=${encodeURIComponent(authToken)}`;
      }
      return rawUrl;
    }

    if (complaint.complaintId && (complaint.image?.filename || complaint.image?.storageKey || complaint.image?.path || complaint.image?.url)) {
      const baseUrl = (BACKEND_URL || 'http://localhost:5000/api');
      return `${baseUrl}/complaints/${complaint.complaintId}/image?token=${encodeURIComponent(authToken || '')}`;
    }

    return null;
  };

  // Fetch complaints belonging to authenticated user
  const fetchComplaints = async () => {
    if (!authToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`${BACKEND_URL}/complaints`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 10000,
      });

      setComplaints(res.data.complaints || []);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        setError('Your session has expired. Please sign in again.');
      } else if (status === 403) {
        setError('Access forbidden. You do not have permission to view these complaints.');
      } else if (err.code === 'ECONNABORTED') {
        setError('Request timed out. Please check your network connection and retry.');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to load complaints.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [authToken]);

  // Compute complaint statistics for summary cards
  const stats = useMemo(() => {
    let pendingCount = 0;
    let inProgressCount = 0;
    let resolvedCount = 0;
    let rejectedCount = 0;

    complaints.forEach((c) => {
      const s = c.status?.toLowerCase();
      if (s === 'submitted' || s === 'pending' || s === 'under_review') {
        pendingCount++;
      } else if (s === 'in_progress') {
        inProgressCount++;
      } else if (s === 'resolved') {
        resolvedCount++;
      } else if (s === 'rejected') {
        rejectedCount++;
      }
    });

    return {
      total: complaints.length,
      pending: pendingCount,
      inProgress: inProgressCount,
      resolved: resolvedCount,
      rejected: rejectedCount,
    };
  }, [complaints]);

  // Filter complaints client-side based on user selection
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      // Status filter
      if (statusFilter) {
        const s = c.status?.toLowerCase();
        if (statusFilter === 'pending') {
          if (s !== 'pending' && s !== 'submitted' && s !== 'under_review') return false;
        } else if (s !== statusFilter) {
          return false;
        }
      }

      // Issue type filter
      if (issueTypeFilter && c.issueType?.toLowerCase() !== issueTypeFilter) {
        return false;
      }

      // Search query filter (matches ID, description, or address)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = c.complaintId?.toLowerCase().includes(q);
        const matchesDesc = c.description?.toLowerCase().includes(q);
        const matchesAddr = c.location?.address?.toLowerCase().includes(q);
        const matchesIssue = c.issueType?.toLowerCase().includes(q);
        if (!matchesId && !matchesDesc && !matchesAddr && !matchesIssue) {
          return false;
        }
      }

      return true;
    });
  }, [complaints, statusFilter, issueTypeFilter, searchQuery]);

  // Open complaint details by fetching from GET /api/complaints/:complaintId
  const handleOpenDetail = async (complaintId) => {
    setLoadingDetail(true);
    setDetailError(null);
    setImageLoadError(false);
    setImageLoading(true);
    setSelectedComplaint(null);

    try {
      const res = await axios.get(`${BACKEND_URL}/complaints/${complaintId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 8000,
      });

      setSelectedComplaint(res.data.complaint);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setDetailError('Complaint not found.');
      } else if (status === 403) {
        setDetailError('Access denied. You are not authorized to view this complaint.');
      } else {
        setDetailError(err.response?.data?.message || 'Failed to load complaint details.');
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  // Open complaint detail automatically if initialComplaintId is passed (e.g. from notification click)
  useEffect(() => {
    if (initialComplaintId && authToken) {
      handleOpenDetail(initialComplaintId);
      if (onClearInitialComplaintId) {
        onClearInitialComplaintId();
      }
    }
  }, [initialComplaintId, authToken]);

  // Safe color resolver for issue badges
  const resolveIssueColor = (issue) => {
    if (getIssueBadgeColor) return getIssueBadgeColor(issue);
    switch (issue?.toLowerCase()) {
      case 'pothole':
        return '#f97316';
      case 'leakage':
        return '#3b82f6';
      case 'garbage':
        return '#10b981';
      default:
        return '#8b5cf6';
    }
  };

  // Safe status badge resolver
  const renderStatusBadge = (status) => {
    if (getStatusBadge) return getStatusBadge(status);
    const s = status?.toLowerCase() || '';
    let className = 'status-pill';
    let text = status;

    if (s === 'submitted' || s === 'pending') {
      className += ' submitted';
      text = 'Pending';
    } else if (s === 'under_review') {
      className += ' review';
      text = 'Under Review';
    } else if (s === 'in_progress') {
      className += ' progress';
      text = 'In Progress';
    } else if (s === 'resolved') {
      className += ' resolved';
      text = 'Resolved';
    } else if (s === 'rejected') {
      className += ' rejected';
      text = 'Rejected';
    }

    return <span className={className}>{text}</span>;
  };

  return (
    <div className="user-dashboard-container">
      {/* Header & Citizen Welcome Banner */}
      <section className="glass-panel dashboard-welcome-panel">
        <div className="dashboard-welcome-header">
          <div className="welcome-text-group">
            <div className="welcome-avatar">
              <User size={24} color="#60a5fa" />
            </div>
            <div>
              <h2 className="welcome-title">
                Welcome back, <span>{currentUser?.name || 'Citizen'}</span>
              </h2>
              <div className="welcome-meta-row">
                <span className="welcome-email">
                  <Mail size={13} /> {currentUser?.email || 'N/A'}
                </span>
                <span className="role-tag">Citizen Reporter</span>
                <span className="verified-pill">
                  <ShieldCheck size={12} /> Verified Session
                </span>
              </div>
            </div>
          </div>

          <div className="dashboard-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchComplaints}
              disabled={loading}
              title="Refresh complaints list"
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onNavigateToReport}
            >
              <Plus size={14} /> Report New Issue
            </button>
          </div>
        </div>

        {/* Summary Statistics Cards Grid */}
        <div className="dashboard-stats-grid">
          <div className="summary-stat-card total">
            <div className="stat-card-top">
              <span className="stat-label">Total Complaints</span>
              <FileText size={18} className="stat-icon" />
            </div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-footer">All lifetime submitted reports</div>
          </div>

          <div className="summary-stat-card pending">
            <div className="stat-card-top">
              <span className="stat-label">Pending / Review</span>
              <Clock size={18} className="stat-icon" />
            </div>
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-footer">Awaiting municipal crew action</div>
          </div>

          <div className="summary-stat-card progress">
            <div className="stat-card-top">
              <span className="stat-label">In Progress</span>
              <Activity size={18} className="stat-icon" />
            </div>
            <div className="stat-value">{stats.inProgress}</div>
            <div className="stat-footer">Work currently underway</div>
          </div>

          <div className="summary-stat-card resolved">
            <div className="stat-card-top">
              <span className="stat-label">Resolved</span>
              <CheckCircle2 size={18} className="stat-icon" />
            </div>
            <div className="stat-value">{stats.resolved}</div>
            <div className="stat-footer">Successfully fixed & verified</div>
          </div>

          <div className="summary-stat-card rejected">
            <div className="stat-card-top">
              <span className="stat-label">Rejected</span>
              <XCircle size={18} className="stat-icon" />
            </div>
            <div className="stat-value">{stats.rejected}</div>
            <div className="stat-footer">Outside jurisdiction / duplicate</div>
          </div>
        </div>
      </section>

      {/* Main Complaints Section */}
      <section className="glass-panel dashboard-complaints-section">
        {/* Section Controls: Filter Bar & View Toggle */}
        <div className="dashboard-section-header">
          <div className="section-title-group">
            <h3 className="section-title">My Civic Complaints</h3>
            <span className="count-badge">
              Showing {filteredComplaints.length} of {complaints.length}
            </span>
          </div>

          <div className="section-controls-group">
            <div className="view-toggle-group">
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
                title="Display complaints as cards"
              >
                <List size={14} /> Cards
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                onClick={() => setViewMode('map')}
                title="Display complaints on map"
              >
                <MapIcon size={14} /> Map View
              </button>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="dashboard-filter-bar">
          <div className="search-input-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="text-input search-input"
              placeholder="Search by Complaint ID, description, address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="filter-dropdowns">
            <div className="filter-group">
              <Filter size={14} className="filter-icon" />
              <select
                className="text-input filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending / Submitted</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="filter-group">
              <select
                className="text-input filter-select"
                value={issueTypeFilter}
                onChange={(e) => setIssueTypeFilter(e.target.value)}
              >
                <option value="">All Issue Types</option>
                <option value="pothole">Pothole</option>
                <option value="leakage">Leakage</option>
                <option value="garbage">Garbage</option>
                <option value="other">Other</option>
              </select>
            </div>

            {(searchQuery || statusFilter || issueTypeFilter) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('');
                  setIssueTypeFilter('');
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="dashboard-state-box loading">
            <RefreshCw size={36} className="spin-icon" color="#3b82f6" />
            <h4>Loading your complaints...</h4>
            <p>Retrieving your authenticated civic records from MongoDB.</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="dashboard-state-box error">
            <AlertCircle size={40} color="#ef4444" />
            <h4>Failed to Load Complaints</h4>
            <p>{error}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={fetchComplaints}>
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {/* Empty State: Zero Complaints in History */}
        {!loading && !error && complaints.length === 0 && (
          <div className="dashboard-state-box empty">
            <FileText size={48} color="#64748b" />
            <h4>No complaints submitted yet.</h4>
            <p>
              You haven't reported any civic issues yet. Help improve your city by reporting
              road potholes, water pipe leaks, or overflowing garbage accumulation.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onNavigateToReport}
              style={{ marginTop: '0.75rem' }}
            >
              <Plus size={16} /> Report an Issue
            </button>
          </div>
        )}

        {/* Filtered Out State: User has complaints, but filter returned 0 */}
        {!loading && !error && complaints.length > 0 && filteredComplaints.length === 0 && (
          <div className="dashboard-state-box empty">
            <Search size={40} color="#64748b" />
            <h4>No matching complaints found</h4>
            <p>No complaints match your current filter and search criteria.</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setIssueTypeFilter('');
              }}
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* Map View Mode */}
        {!loading && !error && filteredComplaints.length > 0 && viewMode === 'map' && (
          <div className="dashboard-map-wrapper">
            <ComplaintMap
              complaints={filteredComplaints}
              role="citizen"
              height="520px"
              getStatusBadge={renderStatusBadge}
              getIssueBadgeColor={resolveIssueColor}
              onSelectComplaint={(item) => handleOpenDetail(item.complaintId)}
            />
          </div>
        )}

        {/* Cards Grid View Mode */}
        {!loading && !error && filteredComplaints.length > 0 && viewMode === 'cards' && (
          <div className="user-complaint-cards-grid">
            {filteredComplaints.map((item) => {
              const issueColor = resolveIssueColor(item.issueType);
              const hasGps =
                item.latitude !== undefined &&
                item.latitude !== null &&
                item.longitude !== undefined &&
                item.longitude !== null;
              const formattedDate = formatDate(item.createdAt);

              return (
                <div key={item.complaintId} className="user-complaint-card">
                  {/* Card Header */}
                  <div className="user-card-header">
                    <span className="complaint-id-badge" title="Unique Complaint Tracking ID">
                      {item.complaintId}
                    </span>
                    {renderStatusBadge(item.status)}
                  </div>

                  {/* Issue Type & Confidence */}
                  <div className="user-card-issue-row">
                    <span
                      className="issue-tag"
                      style={{
                        backgroundColor: `${issueColor}20`,
                        color: issueColor,
                        borderColor: `${issueColor}40`,
                      }}
                    >
                      {item.issueType?.toUpperCase()}
                    </span>
                    <span className="conf-score">
                      {(item.confidence * 100).toFixed(0)}% Conf
                    </span>
                  </div>

                  {/* Description snippet */}
                  <p className="user-card-desc" title={item.description}>
                    {item.description || 'No description provided.'}
                  </p>

                  {/* Metadata: Location & Date */}
                  <div className="user-card-meta-list">
                    <div className="user-card-meta-item" title={item.location?.address || 'Coordinates'}>
                      <MapPin size={13} className="meta-icon" />
                      <span className="meta-text">
                        {item.location?.address
                          ? item.location.address
                          : hasGps
                          ? `${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}`
                          : 'Location unavailable'}
                      </span>
                    </div>

                    <div className="user-card-meta-item">
                      <Calendar size={13} className="meta-icon" />
                      <span className="meta-text">Submitted: {formattedDate}</span>
                    </div>
                  </div>

                  {/* Card Footer Action */}
                  <div className="user-card-footer">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm user-details-btn"
                      onClick={() => handleOpenDetail(item.complaintId)}
                    >
                      <Eye size={13} /> View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Complaint Detail Modal (Loads from GET /api/complaints/:complaintId) */}
      {(selectedComplaint || loadingDetail || detailError) && (
        <div
          className="modal-overlay"
          onClick={() => {
            setSelectedComplaint(null);
            setDetailError(null);
          }}
        >
          <div
            className="modal-content glass-panel user-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-title-group">
                {selectedComplaint ? (
                  <>
                    <span className="complaint-id-badge" style={{ fontSize: '1rem', padding: '4px 10px' }}>
                      {selectedComplaint.complaintId}
                    </span>
                    {renderStatusBadge(selectedComplaint.status)}
                  </>
                ) : (
                  <h3>Complaint Details</h3>
                )}
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setSelectedComplaint(null);
                  setDetailError(null);
                }}
                title="Close Modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Loading State */}
            {loadingDetail && (
              <div className="dashboard-state-box loading" style={{ padding: '3rem 1rem' }}>
                <RefreshCw size={36} className="spin-icon" color="#3b82f6" />
                <h4>Retrieving Complaint Details...</h4>
                <p>Verifying ownership and fetching full civic record.</p>
              </div>
            )}

            {/* Modal Error State */}
            {detailError && (
              <div className="dashboard-state-box error" style={{ padding: '2rem 1rem' }}>
                <AlertCircle size={36} color="#ef4444" />
                <h4>Unable to Load Details</h4>
                <p>{detailError}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setDetailError(null)}
                >
                  Close
                </button>
              </div>
            )}

            {/* Modal Body Content */}
            {!loadingDetail && selectedComplaint && (
              <div className="user-detail-modal-body">
                <div className="user-detail-grid">
                  {/* Left Column: Evidence Photo, Description & Mini Map */}
                  <div className="detail-col-left">
                    <div className="modal-section-title">Evidence Photo</div>
                    {/* Safe image display with authenticated URL and error fallback */}
                    {(() => {
                      const imgUrl = getComplaintImageUrl(selectedComplaint);
                      if (!imgUrl) {
                        return (
                          <div className="detail-no-img">
                            <ImageIcon size={32} color="#64748b" />
                            <span>Image not available</span>
                            <span className="no-img-subtext">No evidence photo was attached to this report</span>
                          </div>
                        );
                      }

                      return (
                        <div className="detail-evidence-container" style={{ position: 'relative' }}>
                          {imageLoading && !imageLoadError && (
                            <div
                              className="detail-img-loading"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '180px',
                                color: '#94a3b8',
                                fontSize: '0.85rem',
                              }}
                            >
                              <span>Loading image...</span>
                            </div>
                          )}
                          {!imageLoadError ? (
                            <img
                              src={imgUrl}
                              alt={`Evidence for complaint ${selectedComplaint.complaintId}`}
                              className="detail-evidence-img"
                              style={{ display: imageLoading ? 'none' : 'block' }}
                              onLoad={() => setImageLoading(false)}
                              onError={() => {
                                setImageLoading(false);
                                setImageLoadError(true);
                              }}
                            />
                          ) : (
                            <div className="detail-no-img">
                              <ImageIcon size={32} color="#64748b" />
                              <span>Image not available</span>
                              <span className="no-img-subtext">The evidence photo could not be rendered</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="detail-field-box" style={{ marginTop: '1rem' }}>
                      <label className="detail-label">Problem Description</label>
                      <p className="detail-desc-text">
                        {selectedComplaint.description || 'No description provided.'}
                      </p>
                    </div>

                    {/* Complaint Location & Mini Map */}
                    <div className="detail-field-box">
                      <label className="detail-label">Geographic Location</label>
                      <div className="detail-coords-row">
                        <MapPin size={16} color="#60a5fa" />
                        <span>
                          {selectedComplaint.latitude !== undefined &&
                          selectedComplaint.latitude !== null &&
                          selectedComplaint.longitude !== undefined &&
                          selectedComplaint.longitude !== null
                            ? `${Number(selectedComplaint.latitude).toFixed(6)}, ${Number(
                                selectedComplaint.longitude
                              ).toFixed(6)}`
                            : 'Location unavailable'}
                        </span>
                      </div>

                      {selectedComplaint.location?.address && (
                        <p className="detail-address-sub">
                          <strong>Address:</strong> {selectedComplaint.location.address}
                        </p>
                      )}

                      {/* Mini Map preview if valid coordinates exist */}
                      {selectedComplaint.latitude !== undefined &&
                      selectedComplaint.latitude !== null &&
                      selectedComplaint.longitude !== undefined &&
                      selectedComplaint.longitude !== null &&
                      !isNaN(Number(selectedComplaint.latitude)) &&
                      !isNaN(Number(selectedComplaint.longitude)) ? (
                        <div className="detail-mini-map-box">
                          <MapView
                            center={[Number(selectedComplaint.latitude), Number(selectedComplaint.longitude)]}
                            zoom={15}
                            height="200px"
                            scrollWheelZoom={false}
                          >
                            <Marker
                              position={[
                                Number(selectedComplaint.latitude),
                                Number(selectedComplaint.longitude),
                              ]}
                              icon={createCustomMarkerIcon(
                                resolveIssueColor(selectedComplaint.issueType),
                                '📍'
                              )}
                            >
                              <Popup>
                                <strong>{selectedComplaint.complaintId}</strong>
                                <br />
                                {selectedComplaint.issueType?.toUpperCase()}
                              </Popup>
                            </Marker>
                          </MapView>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Right Column: AI Detection Metrics & Lifecycle Status */}
                  <div className="detail-col-right">
                    <div className="modal-section-title">AI Classification & Lifecycle</div>

                    {/* AI Assessment Card */}
                    <div className="ai-breakdown-card">
                      <div className="ai-header-row">
                        <span className="ai-label">YOLO26 Detection</span>
                        <span
                          className="issue-tag"
                          style={{
                            backgroundColor: `${resolveIssueColor(selectedComplaint.issueType)}20`,
                            color: resolveIssueColor(selectedComplaint.issueType),
                            borderColor: `${resolveIssueColor(selectedComplaint.issueType)}40`,
                          }}
                        >
                          {selectedComplaint.issueType?.toUpperCase()}
                        </span>
                      </div>

                      <div className="meta-list" style={{ marginTop: '0.75rem' }}>
                        <div className="meta-row">
                          <span>Confidence Score</span>
                          <strong style={{ color: '#38bdf8' }}>
                            {(selectedComplaint.confidence * 100).toFixed(1)}%
                          </strong>
                        </div>
                        <div className="meta-row">
                          <span>Model Architecture</span>
                          <strong>{selectedComplaint.modelArchitecture || 'Ultralytics YOLO26'}</strong>
                        </div>
                        <div className="meta-row">
                          <span>Model Variant</span>
                          <strong>{selectedComplaint.modelVariant || 'YOLO26n'}</strong>
                        </div>
                        <div className="meta-row">
                          <span>Detected Objects</span>
                          <strong>{selectedComplaint.detections?.length || 0} box(es)</strong>
                        </div>
                      </div>

                      {/* Bounding Boxes List if available */}
                      {selectedComplaint.detections && selectedComplaint.detections.length > 0 && (
                        <div className="boxes-detail" style={{ marginTop: '0.75rem' }}>
                          <span className="boxes-title">Detected Bounding Boxes:</span>
                          <div className="boxes-scroll" style={{ maxHeight: '110px' }}>
                            {selectedComplaint.detections.map((det, idx) => (
                              <div key={idx} className="box-item">
                                <span className="box-class">{det.class}</span>
                                <span className="box-conf">{(det.confidence * 100).toFixed(1)}%</span>
                                <span className="box-coords">[{det.bbox?.join(', ')}]</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lifecycle Status Progress Tracker */}
                    <div className="status-lifecycle-card">
                      <h4 className="status-card-title">Resolution Workflow</h4>
                      <p className="status-card-desc">
                        Current municipal processing state for this civic issue.
                      </p>

                      <div className="status-steps-timeline">
                        <div
                          className={`timeline-step ${
                            ['submitted', 'pending', 'under_review', 'in_progress', 'resolved'].includes(
                              selectedComplaint.status?.toLowerCase()
                            )
                              ? 'completed'
                              : ''
                          }`}
                        >
                          <div className="step-circle">1</div>
                          <div className="step-content">
                            <strong>Submitted</strong>
                            <span>Report filed & AI classified</span>
                          </div>
                        </div>

                        <div
                          className={`timeline-step ${
                            ['under_review', 'in_progress', 'resolved'].includes(
                              selectedComplaint.status?.toLowerCase()
                            )
                              ? 'completed'
                              : selectedComplaint.status?.toLowerCase() === 'submitted'
                              ? 'active'
                              : ''
                          }`}
                        >
                          <div className="step-circle">2</div>
                          <div className="step-content">
                            <strong>Under Review</strong>
                            <span>Assigned to department officer</span>
                          </div>
                        </div>

                        <div
                          className={`timeline-step ${
                            ['in_progress', 'resolved'].includes(
                              selectedComplaint.status?.toLowerCase()
                            )
                              ? 'completed'
                              : selectedComplaint.status?.toLowerCase() === 'under_review'
                              ? 'active'
                              : ''
                          }`}
                        >
                          <div className="step-circle">3</div>
                          <div className="step-content">
                            <strong>In Progress</strong>
                            <span>Field repairs scheduled/underway</span>
                          </div>
                        </div>

                        <div
                          className={`timeline-step ${
                            selectedComplaint.status?.toLowerCase() === 'resolved'
                              ? 'completed'
                              : selectedComplaint.status?.toLowerCase() === 'in_progress'
                              ? 'active'
                              : ''
                          }`}
                        >
                          <div className="step-circle">4</div>
                          <div className="step-content">
                            <strong>Resolved</strong>
                            <span>Issue rectified & closed</span>
                          </div>
                        </div>

                        {selectedComplaint.status?.toLowerCase() === 'rejected' && (
                          <div className="timeline-step rejected">
                            <div className="step-circle">!</div>
                            <div className="step-content">
                              <strong>Rejected</strong>
                              <span>Deemed duplicate or not actionable</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer with submission & updated dates */}
                <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                  <div className="modal-timestamps">
                    <span>
                      <strong>Submitted:</strong> {formatDateTime(selectedComplaint.createdAt)}
                    </span>
                    <span>&bull;</span>
                    <span>
                      <strong>Last Updated:</strong> {formatDateTime(selectedComplaint.updatedAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedComplaint(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
