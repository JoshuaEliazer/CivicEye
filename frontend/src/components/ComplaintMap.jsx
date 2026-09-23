import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import {
  MapPin,
  Calendar,
  Layers,
  Eye,
  AlertCircle,
  FileText,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import MapView, { NEUTRAL_MAP_CENTER, createCustomMarkerIcon } from './MapView.jsx';

/**
 * Maps civic issue type to icon character and color
 */
const ISSUE_CONFIG = {
  pothole: { color: '#f97316', label: 'P', name: 'Pothole' },
  leakage: { color: '#3b82f6', label: 'L', name: 'Leakage' },
  garbage: { color: '#10b981', label: 'G', name: 'Garbage' },
  other: { color: '#8b5cf6', label: 'O', name: 'Other' },
  none: { color: '#64748b', label: 'N', name: 'None' },
  unknown: { color: '#64748b', label: 'U', name: 'Unknown' },
};

export default function ComplaintMap({
  complaints = [],
  onSelectComplaint = null,
  role = 'citizen',
  height = '500px',
  getStatusBadge = null,
  getIssueBadgeColor = null,
}) {
  // Extract and filter complaints with valid geographic coordinates
  const { geocodedComplaints, missingCoordsCount, bounds } = useMemo(() => {
    const valid = [];
    let missing = 0;

    complaints.forEach((c) => {
      const rawLat =
        c.latitude !== undefined && c.latitude !== null
          ? c.latitude
          : c.location?.latitude;
      const rawLng =
        c.longitude !== undefined && c.longitude !== null
          ? c.longitude
          : c.location?.longitude;

      if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) {
        missing += 1;
        return;
      }

      const lat = Number(rawLat);
      const lng = Number(rawLng);

      if (
        isNaN(lat) ||
        isNaN(lng) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        missing += 1;
        return;
      }

      valid.push({
        ...c,
        parsedLat: lat,
        parsedLng: lng,
      });
    });

    const b = valid.map((c) => [c.parsedLat, c.parsedLng]);

    return {
      geocodedComplaints: valid,
      missingCoordsCount: missing,
      bounds: b.length > 0 ? b : null,
    };
  }, [complaints]);

  // Default color resolver
  const getColor = (issue) => {
    if (getIssueBadgeColor) return getIssueBadgeColor(issue);
    const key = issue?.toLowerCase() || 'unknown';
    return ISSUE_CONFIG[key]?.color || '#3b82f6';
  };

  // Render empty state if no complaints with location data exist
  if (complaints.length === 0 || geocodedComplaints.length === 0) {
    return (
      <div className="complaint-map-container" style={{ minHeight: height }}>
        <div className="map-empty-overlay">
          <MapPin size={48} color="#64748b" />
          <h4 className="map-empty-title">No complaints with location data to display</h4>
          <p className="map-empty-desc">
            {complaints.length === 0
              ? 'There are currently no complaints matching your criteria.'
              : `${complaints.length} complaint(s) exist, but none contain valid coordinates.`}
          </p>
        </div>
        <MapView height={height} center={NEUTRAL_MAP_CENTER} zoom={5} />
      </div>
    );
  }

  return (
    <div className="complaint-map-container">
      {/* Legend & Summary Info Bar */}
      <div className="map-info-bar">
        <div className="map-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#f97316' }} /> Pothole
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#3b82f6' }} /> Leakage
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#10b981' }} /> Garbage
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#8b5cf6' }} /> Other
          </span>
        </div>

        <div className="map-count-summary">
          <span>
            Showing <strong>{geocodedComplaints.length}</strong> location(s)
            {missingCoordsCount > 0 && ` (${missingCoordsCount} without GPS)`}
          </span>
        </div>
      </div>

      {/* Leaflet Map with Markers */}
      <div className="map-canvas-card">
        <MapView
          bounds={bounds}
          height={height}
          zoom={13}
        >
          {geocodedComplaints.map((item) => {
            const issueKey = item.issueType?.toLowerCase() || 'unknown';
            const pinColor = getColor(issueKey);
            const pinLabel = ISSUE_CONFIG[issueKey]?.label || '•';
            const markerIcon = createCustomMarkerIcon(pinColor, pinLabel);

            return (
              <Marker
                key={item.complaintId || item._id}
                position={[item.parsedLat, item.parsedLng]}
                icon={markerIcon}
              >
                <Popup className="complaint-popup">
                  <div className="complaint-marker-popup">
                    <div className="popup-header">
                      <span className="complaint-id-badge">{item.complaintId}</span>
                      {getStatusBadge ? (
                        getStatusBadge(item.status)
                      ) : (
                        <span className="status-pill">{item.status}</span>
                      )}
                    </div>

                    <div className="popup-body">
                      <div className="popup-row">
                        <span className="popup-label">Issue Type:</span>
                        <span
                          className="popup-issue-tag"
                          style={{
                            backgroundColor: `${pinColor}20`,
                            color: pinColor,
                            borderColor: `${pinColor}40`,
                          }}
                        >
                          {item.issueType?.toUpperCase()}
                        </span>
                      </div>

                      {item.confidence !== undefined && (
                        <div className="popup-row">
                          <span className="popup-label">AI Confidence:</span>
                          <strong>{(item.confidence * 100).toFixed(1)}%</strong>
                        </div>
                      )}

                      {item.severity && (
                        <div className="popup-row">
                          <span className="popup-label">Severity:</span>
                          <span className={`severity-tag ${item.severity.toLowerCase()}`}>
                            {item.severity.toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div className="popup-desc">
                        "{item.description?.length > 90
                          ? `${item.description.substring(0, 90)}...`
                          : item.description}"
                      </div>

                      <div className="popup-coords">
                        <MapPin size={12} color="#60a5fa" />
                        <span>
                          {item.location?.address
                            ? item.location.address
                            : `${item.parsedLat.toFixed(4)}, ${item.parsedLng.toFixed(4)}`}
                        </span>
                      </div>

                      <div className="popup-date">
                        <Calendar size={12} />
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {onSelectComplaint && (
                      <div className="popup-footer">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm popup-action-btn"
                          onClick={() => onSelectComplaint(item)}
                        >
                          <Eye size={13} />
                          {role === 'admin' ? 'Inspect Details' : 'View Details'}
                        </button>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapView>
      </div>
    </div>
  );
}
