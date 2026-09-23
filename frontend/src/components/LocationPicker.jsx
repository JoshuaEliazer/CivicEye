import React, { useState, useEffect } from 'react';
import { Marker, Popup } from 'react-leaflet';
import {
  MapPin,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HelpCircle,
  Check,
  Navigation,
} from 'lucide-react';
import MapView, { NEUTRAL_MAP_CENTER, createCustomMarkerIcon } from './MapView.jsx';

/**
 * Validates coordinate ranges
 */
export const isValidCoordinate = (lat, lng) => {
  if (lat === '' || lat === null || lat === undefined) return false;
  if (lng === '' || lng === null || lng === undefined) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  return (
    !isNaN(numLat) &&
    !isNaN(numLng) &&
    Number.isFinite(numLat) &&
    Number.isFinite(numLng) &&
    numLat >= -90 &&
    numLat <= 90 &&
    numLng >= -180 &&
    numLng <= 180
  );
};

export default function LocationPicker({
  latitude = '',
  longitude = '',
  address = '',
  onChange,
}) {
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState(null); // { type: 'success'|'error'|'info', message: string }
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [mapCenter, setMapCenter] = useState(NEUTRAL_MAP_CENTER);

  // Parse numeric values if valid
  const hasValidCoords = isValidCoordinate(latitude, longitude);
  const numLat = hasValidCoords ? parseFloat(latitude) : null;
  const numLng = hasValidCoords ? parseFloat(longitude) : null;

  // Sync map center whenever valid coordinates are set
  useEffect(() => {
    if (hasValidCoords) {
      setMapCenter([numLat, numLng]);
    }
  }, [latitude, longitude, hasValidCoords]);

  // Request browser geolocation
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus({
        type: 'error',
        message: 'Geolocation is not supported by your current browser.',
      });
      return;
    }

    setLocating(true);
    setLocationStatus({
      type: 'info',
      message: 'Requesting device GPS coordinates...',
    });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);

        setMapCenter([parseFloat(lat), parseFloat(lng)]);
        setIsConfirmed(false);
        setLocationStatus({
          type: 'success',
          message: 'Location captured from browser! Review and confirm on the map below.',
        });

        if (onChange) {
          onChange({
            latitude: lat,
            longitude: lng,
            address,
            isConfirmed: false,
          });
        }
      },
      (err) => {
        setLocating(false);
        let msg = 'Could not obtain location.';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = 'Location permission was denied. You can enter or confirm the location manually.';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = 'Location information is unavailable on this device or network.';
            break;
          case err.TIMEOUT:
            msg = 'Location request timed out. Please try again or enter coordinates manually.';
            break;
          default:
            msg = err.message || 'An unknown geolocation error occurred.';
            break;
        }
        setLocationStatus({ type: 'error', message: msg });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  // Map click handler to adjust pin
  const handleMapClick = ({ lat, lng }) => {
    const fixedLat = lat.toFixed(6);
    const fixedLng = lng.toFixed(6);
    setIsConfirmed(false);
    setLocationStatus({
      type: 'info',
      message: 'Pin moved. Click "Confirm Location" to lock in these coordinates.',
    });

    if (onChange) {
      onChange({
        latitude: fixedLat,
        longitude: fixedLng,
        address,
        isConfirmed: false,
      });
    }
  };

  // Handle manual coordinate input changes
  const handleCoordChange = (field, val) => {
    setIsConfirmed(false);
    const updated = {
      latitude: field === 'latitude' ? val : latitude,
      longitude: field === 'longitude' ? val : longitude,
      address,
      isConfirmed: false,
    };
    if (onChange) {
      onChange(updated);
    }
  };

  // Handle address input change
  const handleAddressChange = (val) => {
    if (onChange) {
      onChange({
        latitude,
        longitude,
        address: val,
        isConfirmed,
      });
    }
  };

  // Confirm selected location
  const handleConfirmLocation = () => {
    if (!hasValidCoords) {
      setLocationStatus({
        type: 'error',
        message: 'Please provide valid latitude (-90 to 90) and longitude (-180 to 180) before confirming.',
      });
      return;
    }

    setIsConfirmed(true);
    setLocationStatus({
      type: 'success',
      message: `Location confirmed: [${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}]`,
    });

    if (onChange) {
      onChange({
        latitude,
        longitude,
        address,
        isConfirmed: true,
      });
    }
  };

  const pickerPinIcon = createCustomMarkerIcon('#ef4444', '📍');

  return (
    <div className="location-picker-container">
      {/* Header and Capture Action */}
      <div className="location-picker-header">
        <div className="location-picker-title-group">
          <MapPin size={18} color="#60a5fa" />
          <h4 className="location-picker-title">Complaint Location</h4>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleGetCurrentLocation}
          disabled={locating}
          title="Detect GPS coordinates using your browser"
        >
          {locating ? (
            <RefreshCw size={14} className="spin-icon" />
          ) : (
            <Crosshair size={14} />
          )}
          {locating ? 'Locating...' : 'Use My Current Location'}
        </button>
      </div>

      {/* Status Feedback Alert */}
      {locationStatus && (
        <div
          className={`location-status-banner ${locationStatus.type}`}
          role="alert"
        >
          {locationStatus.type === 'success' && <CheckCircle2 size={16} />}
          {locationStatus.type === 'error' && <AlertCircle size={16} />}
          {locationStatus.type === 'info' && <Navigation size={16} />}
          <span>{locationStatus.message}</span>
        </div>
      )}

      {/* Coordinate & Address Input Fields */}
      <div className="location-inputs-grid">
        <div className="form-group">
          <label htmlFor="loc-latitude">Latitude (-90 to 90)</label>
          <div className="input-with-icon">
            <MapPin size={16} className="input-icon" />
            <input
              id="loc-latitude"
              type="number"
              step="any"
              placeholder="e.g. 16.5062"
              className="text-input"
              value={latitude}
              onChange={(e) => handleCoordChange('latitude', e.target.value)}
              min="-90"
              max="90"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="loc-longitude">Longitude (-180 to 180)</label>
          <div className="input-with-icon">
            <MapPin size={16} className="input-icon" />
            <input
              id="loc-longitude"
              type="number"
              step="any"
              placeholder="e.g. 80.6480"
              className="text-input"
              value={longitude}
              onChange={(e) => handleCoordChange('longitude', e.target.value)}
              min="-180"
              max="180"
            />
          </div>
        </div>
      </div>

      <div className="form-group" style={{ marginTop: '0.5rem' }}>
        <label htmlFor="loc-address">Street Address / Landmark (Optional)</label>
        <input
          id="loc-address"
          type="text"
          className="text-input"
          placeholder="e.g. Near City Center Gate 2, Main Highway"
          value={address}
          onChange={(e) => handleAddressChange(e.target.value)}
          maxLength={500}
        />
        <span className="input-subtext">
          Coordinates and addresses are handled independently. Address is saved as provided.
        </span>
      </div>

      {/* Interactive Map Preview & Pin Placement */}
      <div className="location-map-section">
        <div className="location-map-label-row">
          <span className="location-map-hint">
            Click anywhere on the map to set or adjust the complaint pin:
          </span>
          {isConfirmed ? (
            <span className="location-confirmed-pill">
              <Check size={12} /> Confirmed
            </span>
          ) : hasValidCoords ? (
            <span className="location-pending-pill">Unconfirmed</span>
          ) : null}
        </div>

        <div className="location-map-card">
          <MapView
            center={hasValidCoords ? [numLat, numLng] : mapCenter}
            zoom={hasValidCoords ? 15 : 6}
            onMapClick={handleMapClick}
            height="280px"
          >
            {hasValidCoords && (
              <Marker
                position={[numLat, numLng]}
                icon={pickerPinIcon}
              >
                <Popup>
                  <div className="map-popup-inner">
                    <strong>Selected Location</strong>
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      Lat: {numLat.toFixed(6)}
                      <br />
                      Lng: {numLng.toFixed(6)}
                      {address ? (
                        <>
                          <br />
                          Address: {address}
                        </>
                      ) : null}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapView>
        </div>

        {/* Location Confirmation Action */}
        <div className="location-confirm-bar">
          <div className="coords-display">
            {hasValidCoords ? (
              <span>
                Coordinates: <strong>{numLat.toFixed(5)}, {numLng.toFixed(5)}</strong>
              </span>
            ) : (
              <span className="coords-none">No valid coordinates selected yet</span>
            )}
          </div>

          <button
            type="button"
            className={`btn ${isConfirmed ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            onClick={handleConfirmLocation}
            disabled={!hasValidCoords}
          >
            {isConfirmed ? (
              <>
                <CheckCircle2 size={14} color="#34d399" /> Location Confirmed
              </>
            ) : (
              <>
                <Check size={14} /> Confirm Location
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
