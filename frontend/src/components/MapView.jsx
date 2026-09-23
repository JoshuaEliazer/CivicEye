import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Vite / bundler Leaflet default marker icon path issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/**
 * Subcomponent to handle map click events
 */
function MapEvents({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
        });
      }
    },
  });
  return null;
}

/**
 * Subcomponent to automatically update view or fit bounds when coordinates change
 */
function MapController({ center, zoom, bounds }) {
  const map = useMap();

  useEffect(() => {
    if (bounds && bounds.length > 0) {
      try {
        if (bounds.length === 1) {
          map.setView(bounds[0], zoom || 14, { animate: true });
        } else {
          map.fitBounds(bounds, {
            padding: [40, 40],
            maxZoom: 16,
            animate: true,
          });
        }
      } catch (err) {
        console.warn('Failed to fit bounds:', err);
      }
    } else if (center && typeof center[0] === 'number' && typeof center[1] === 'number') {
      map.setView(center, zoom || 14, { animate: true });
    }
  }, [map, center, zoom, bounds]);

  return null;
}

/**
 * Neutral fallback center (configured in one place)
 * Default: Central India geographic centroid for civic context
 */
export const NEUTRAL_MAP_CENTER = [20.5937, 78.9629];
export const DEFAULT_MAP_ZOOM = 13;

/**
 * Create custom SVG-based map pin with specific category colors
 */
export function createCustomMarkerIcon(color = '#3b82f6', label = '') {
  return L.divIcon({
    className: 'civic-custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 30px;
        height: 30px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 10px rgba(0,0,0,0.4);
        cursor: pointer;
      ">
        <span style="
          transform: rotate(45deg);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
        ">${label}</span>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

/**
 * Reusable generic Leaflet MapView with OpenStreetMap tiles
 */
export default function MapView({
  center = NEUTRAL_MAP_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  bounds = null,
  onMapClick = null,
  height = '400px',
  children = null,
  className = '',
  scrollWheelZoom = true,
}) {
  return (
    <div
      className={`leaflet-map-wrapper ${className}`}
      style={{ width: '100%', height, minHeight: '350px', position: 'relative' }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        style={{ width: '100%', height: '100%', borderRadius: '12px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapController center={center} zoom={zoom} bounds={bounds} />
        {onMapClick && <MapEvents onMapClick={onMapClick} />}
        {children}
      </MapContainer>
    </div>
  );
}
