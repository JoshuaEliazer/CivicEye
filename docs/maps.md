# CivicEye Maps, Geolocation & Location-Based Complaint Visualization Specification

## 1. Overview

**Phase 9** integrates interactive map visualization, browser geolocation capture, and location-based complaint monitoring into the CivicEye ecosystem. The subsystem employs **Leaflet**, **React Leaflet**, and **OpenStreetMap** tile layers without external paid APIs, enabling citizens to pinpoint civic hazards accurately and municipal administrators to monitor geospatial complaint distribution city-wide.

```
Citizen Browser (Geolocation / Pin Drop)
                    │
                    ▼
          Express REST API (Strict Numeric Validation)
                    │
                    ▼
          MongoDB (Persistent Coordinates & Address)
                    │
                    ▼
  Geospatial Visualization (Citizen & Admin Maps)
```

---

## 2. Technology Stack & Tile Provider

- **Mapping Engine**: Leaflet `^1.9.4`
- **React Bindings**: React Leaflet `^4.2.1`
- **Tile Provider**: OpenStreetMap Standard Tile Layer
  - URL Template: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
  - Max Zoom: 19
  - Mandatory Attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`
- **Browser Geolocation API**: `navigator.geolocation.getCurrentPosition()`
- **No Paid APIs**: Completely free of Google Maps, Mapbox, or proprietary billable services.

---

## 3. Citizen Location Capture & Confirmation Flow

### 3.1 Browser Geolocation
Citizens filing a civic complaint can automatically capture device GPS coordinates using the **[Use My Current Location]** button.

- **Permission Flow**:
  - Browser displays an OS/browser prompt requesting location access. User permission is strictly required by modern browser security policies.
  - **Permission Granted**: Latitude and longitude are populated to 6 decimal places, and the map immediately centers on the device coordinates.
  - **Permission Denied**: The system provides an informative notification:
    > *"Location permission was denied. You can enter or confirm the location manually."*
  - **Position Unavailable / Timeout**: Caught gracefully with user-friendly messages without crashing the application.

### 3.2 Interactive Pin Placement & Confirmation
- Citizens can click or drag on the embedded Leaflet map to adjust the exact location of the issue.
- Updating the pin dynamically refreshes the latitude and longitude inputs.
- Citizens review coordinates and click **[Confirm Location]** to lock the position before submitting the complaint.
- Manual address or landmark entry is supported as an optional field (e.g., *"5th Cross, MG Road"*). Coordinates and addresses are decoupled; the system never fabricates or hallucinates street addresses from coordinates alone.

---

## 4. Coordinate Validation Rules

Geographic coordinates must satisfy strict mathematical limits across both client and server layers.

### 4.1 Boundary Limits
- **Latitude**: `-90.0 <= latitude <= 90.0`
- **Longitude**: `-180.0 <= longitude <= 180.0`

### 4.2 Server-Side Rejection
The Express controller (`POST /api/complaints`) validates incoming coordinate parameters:
- Rejects non-numeric strings (e.g. `"invalid"`, `"12abc"`) with `400 Bad Request` (`INVALID_LATITUDE` / `INVALID_LONGITUDE`).
- Rejects `NaN`, `Infinity`, and `-Infinity`.
- Rejects out-of-range coordinates (e.g. `latitude: 95.0`, `longitude: -185.0`) with `400 Bad Request`.
- Does not silently clamp or coerce invalid values.

### 4.3 Database Persistence
When validated, coordinates are saved in the `Complaint` document:
- Direct fields: `latitude` (Number), `longitude` (Number)
- Structured subdocument: `location: { latitude, longitude, address }`
- Synchronized seamlessly via Mongoose `pre('validate')` hooks.

---

## 5. Citizen Complaint Map

Accessible under **My Submitted Complaints**:
- **View Toggle**: Citizens can switch between `[ List View ]` and `[ Map View ]`.
- **Data Isolation**: The citizen map fetches complaints strictly via `GET /api/complaints`, displaying only reports authored by the authenticated citizen.
- **Marker Details**: Clicking a complaint pin opens a popup containing:
  - Complaint ID (`CE-YYYY-NNNNNN`)
  - Issue Type with colored badge (Pothole: Orange, Leakage: Blue, Garbage: Green, Other: Purple)
  - Resolution Status pill
  - Severity level (`LOW`, `MEDIUM`, `HIGH`)
  - AI Detection confidence score
  - Description snippet and address
  - Date reported
  - *"View Details"* action button

---

## 6. Municipal Admin Geospatial Dashboard

Integrated into the **Admin Dashboard** (`/admin`):
- **View Switcher**: Municipal officers can toggle between `[ Table View ]` and `[ Geospatial Map ]`.
- **City-Wide Coverage**: Visualizes all complaints matching active query parameters across the entire municipality.
- **Filter Synchronization**:
  - Filter by **Issue Type** (Pothole, Leakage, Garbage, Other, None)
  - Filter by **Status** (Submitted, Under Review, In Progress, Resolved, Rejected)
  - Filter by **Search query** (Complaint ID, description, address)
  - Changing any filter dynamically updates markers rendered on the map.
- **Marker Inspection**: Clicking *"Inspect Details"* inside any marker popup triggers the administrative detail modal, allowing municipal officers to review YOLO26 bounding boxes, inspect reporter profile details, and update lifecycle statuses in real time.

---

## 7. Map Centering & Empty States

### 7.1 Dynamic Bounds Fitting
- The map automatically calculates geographic bounds (`fitBounds`) encompassing all active markers with appropriate padding.
- Does not hard-code a single city as the permanent center.
- If no complaint coordinates exist, the map falls back to a neutral geographic centroid (`[20.5937, 78.9629]`).

### 7.2 Informative Empty States
- **No complaints with coordinates**: *"No complaints with location data to display."*
- **Complaint without coordinates**: Displays *"No coordinates provided"* in details without crashing.
- **Permission denied**: Shows clear manual coordinate entry guidance.

---

## 8. Location Privacy Considerations

1. **Authentication Required**: All complaint filing and location viewing requires valid JWT Bearer tokens.
2. **Citizen Isolation**: Citizens cannot query or inspect other users' complaint locations.
3. **Admin Exclusivity**: City-wide location distribution is only accessible to users with the verified `ADMIN` role.
4. **Credential Safeguards**: User passwords and JWT secrets are never exposed in map popups or payload responses.

---

## 9. Automated Testing & Verification

### 9.1 Test Suites

1. **Phase 9 Location Test Suite** (15 Scenarios):
   ```bash
   node backend/test/locationTest.js
   ```
   - Scenario 1: Unauthenticated complaint request rejected (401 NO_TOKEN)
   - Scenario 2: Authenticated user retrieves own complaints (200)
   - Scenario 3: Complaint with valid latitude accepted (201)
   - Scenario 4: Complaint with negative coordinates accepted (201)
   - Scenario 5: Latitude > 90 rejected (400 INVALID_LATITUDE)
   - Scenario 6: Latitude < -90 rejected (400 INVALID_LATITUDE)
   - Scenario 7: Longitude > 180 rejected (400 INVALID_LONGITUDE)
   - Scenario 8: Longitude < -180 rejected (400 INVALID_LONGITUDE)
   - Scenario 9: Non-numeric latitude rejected (400 INVALID_LATITUDE)
   - Scenario 10: Non-numeric longitude rejected (400 INVALID_LONGITUDE)
   - Scenario 11: Admin retrieves complaints with location metadata
   - Scenario 12: Citizen forbidden from admin complaints endpoint (403)
   - Scenario 13: MongoDB coordinate & address persistence verified
   - Scenario 14: Citizen data isolation verified across users
   - Scenario 15: End-to-end complaint creation with YOLO26 ML inference verified

2. **Full Regression Test Suite**:
   ```bash
   # Phase 8 Admin Dashboard & Complaint Management
   node backend/test/adminTest.js

   # Phase 7 Civic Complaint Reporting & Persistence
   node backend/test/complaintTest.js

   # Phase 6 Authentication & JWT Authorization
   node backend/test/authTest.js

   # Phase 5 Express <-> FastAPI ML Integration
   node backend/test/mlIntegrationTest.js

   # Phase 4 FastAPI ML Service Tests
   python ml-service/test_api.py

   # Phase 2 Database & Schema Verification
   node backend/test/dbVerification.js

   # Frontend Production Build
   cd frontend && npm run build
   ```

---

## 10. Known Limitations

- **Browser Permissions**: Geolocation depends on device hardware and browser permission grants. If denied by the user, manual entry is required.
- **Reverse Geocoding**: Automatic reverse-geocoding (converting GPS coordinates to postal street names) is omitted to avoid external paid API dependencies; addresses are stored as manually entered by the citizen.
- **Offline Map Tiles**: OpenStreetMap raster tiles require internet connectivity for the client browser.
