import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Bell,
  CheckCheck,
  X,
  CheckCircle2,
  Clock,
  Activity,
  XCircle,
  FileText,
  AlertCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

/**
 * Format relative timestamp (e.g. "Just now", "5m ago", "2h ago", "Yesterday", "28 Sep")
 */
const formatTimeAgo = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '';
  }
};

/**
 * Render icon matching notification event type
 */
const getNotificationIcon = (type) => {
  switch (type) {
    case 'complaint_submitted':
      return <FileText size={16} color="#60a5fa" />;
    case 'complaint_under_review':
      return <Clock size={16} color="#f59e0b" />;
    case 'complaint_in_progress':
      return <Activity size={16} color="#818cf8" />;
    case 'complaint_resolved':
      return <CheckCircle2 size={16} color="#34d399" />;
    case 'complaint_rejected':
      return <XCircle size={16} color="#f87171" />;
    default:
      return <AlertCircle size={16} color="#94a3b8" />;
  }
};

export default function NotificationPanel({
  BACKEND_URL,
  authToken,
  currentUser,
  onSelectComplaint,
  refreshTrigger,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'unread'
  const [markingAll, setMarkingAll] = useState(false);

  const panelRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Fetch unread count & notifications
  const fetchNotifications = async (silent = false) => {
    if (!authToken || !currentUser) return;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`${BACKEND_URL}/notifications?limit=25`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 6000,
      });

      if (res.data?.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.message || 'Failed to load notifications.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial fetch and conservative background refresh (every 30s)
  useEffect(() => {
    if (authToken && currentUser) {
      fetchNotifications(false);
      const interval = setInterval(() => {
        fetchNotifications(true);
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [authToken, currentUser]);

  // Re-fetch when refreshTrigger updates (e.g. after new complaint submitted)
  useEffect(() => {
    if (authToken && currentUser && refreshTrigger !== undefined) {
      fetchNotifications(true);
    }
  }, [refreshTrigger]);

  // Re-fetch when panel is toggled open
  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications(false);
    }
  };

  // Mark single notification as read
  const handleMarkAsRead = async (notification, e) => {
    if (e) e.stopPropagation();
    if (notification.isRead) return;

    try {
      await axios.patch(
        `${BACKEND_URL}/notifications/${notification._id}/read`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Optimistically update local state
      setNotifications((prev) =>
        prev.map((n) => (n._id === notification._id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);

    try {
      await axios.patch(
        `${BACKEND_URL}/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  // Click on notification item -> mark read & open related complaint
  const handleItemClick = (notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification);
    }

    if (notification.complaintId && typeof onSelectComplaint === 'function') {
      onSelectComplaint(notification.complaintId);
      setIsOpen(false);
    }
  };

  // Filtered notifications list
  const filteredNotifications = notifications.filter((n) => {
    if (filterMode === 'unread') return !n.isRead;
    return true;
  });

  if (!currentUser) return null;

  return (
    <div className="notification-panel-wrapper" ref={panelRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        className={`notification-bell-btn ${isOpen ? 'active' : ''}`}
        onClick={handleToggle}
        aria-label="View notifications"
        aria-expanded={isOpen}
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notification-unread-badge" aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="notification-dropdown glass-panel" role="region" aria-label="Notifications panel">
          {/* Header */}
          <div className="notification-header">
            <div className="notification-title-group">
              <span className="notification-header-title">Notifications</span>
              {unreadCount > 0 && (
                <span className="notification-count-chip">{unreadCount} unread</span>
              )}
            </div>
            <div className="notification-header-controls">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="btn-mark-all"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                  title="Mark all notifications as read"
                >
                  <CheckCheck size={14} />
                  <span>{markingAll ? 'Marking...' : 'Mark all read'}</span>
                </button>
              )}
              <button
                type="button"
                className="btn-close-panel"
                onClick={() => setIsOpen(false)}
                title="Close notifications"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="notification-filter-tabs">
            <button
              type="button"
              className={`filter-tab ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              className={`filter-tab ${filterMode === 'unread' ? 'active' : ''}`}
              onClick={() => setFilterMode('unread')}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Body List */}
          <div className="notification-list-body">
            {loading ? (
              <div className="notification-status-box">
                <RefreshCw size={20} className="spin-icon text-muted" />
                <p>Loading notifications...</p>
              </div>
            ) : error ? (
              <div className="notification-status-box error">
                <AlertCircle size={20} color="#f87171" />
                <p>{error}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fetchNotifications(false)}
                  style={{ marginTop: '8px' }}
                >
                  Try Again
                </button>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="notification-status-box empty">
                <Bell size={28} color="#64748b" style={{ opacity: 0.5 }} />
                <p className="empty-title">
                  {filterMode === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <span className="empty-subtext">
                  You will receive updates when your complaint status changes.
                </span>
              </div>
            ) : (
              <ul className="notification-items-list">
                {filteredNotifications.map((item) => (
                  <li
                    key={item._id}
                    className={`notification-item ${item.isRead ? 'read' : 'unread'}`}
                    onClick={() => handleItemClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleItemClick(item);
                      }
                    }}
                  >
                    {/* Event Type Icon */}
                    <div className="notification-item-icon">
                      {getNotificationIcon(item.type)}
                    </div>

                    {/* Content */}
                    <div className="notification-item-content">
                      <div className="notification-item-header">
                        <span className="notification-item-title">{item.title}</span>
                        {!item.isRead && <span className="unread-dot" title="Unread notification" />}
                      </div>

                      <p className="notification-item-message">{item.message}</p>

                      <div className="notification-item-footer">
                        {item.complaintId && (
                          <span className="notification-complaint-chip">
                            {item.complaintId}
                          </span>
                        )}
                        <span className="notification-time">
                          {formatTimeAgo(item.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Navigation Arrow */}
                    {item.complaintId && (
                      <div className="notification-item-arrow" title="View Complaint">
                        <ChevronRight size={14} color="#64748b" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
