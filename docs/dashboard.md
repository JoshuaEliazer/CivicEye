# CivicEye Phase 10: User Dashboard & Complaint History

## Overview

The **User Dashboard** provides authenticated citizens with a comprehensive portal to view, monitor, search, and track all their submitted civic issue complaints. It connects the citizen with real-time municipal resolution progress, YOLO26 computer vision detection breakdown, and OpenStreetMap geolocation visualization.

---

## Architecture & Data Flow

```
Authenticated Citizen (React Frontend)
                 │
                 │ HTTP GET /api/complaints
                 │ Authorization: Bearer <JWT>
                 ▼
          Express Backend
                 │
                 │ Verify JWT Bearer Token (req.user)
                 ▼
          MongoDB Database
                 │
                 │ Filter: { $or: [{ user: req.user._id }, { userId: req.user._id }] }
                 ▼
       Express Controller
                 │
                 │ Returns only authenticated citizen's complaints
                 ▼
       React User Dashboard
                 │
                 ├── Summary Cards (Total, Pending, In Progress, Resolved, Rejected)
                 ├── Filter & Search Controls (Status, Issue Type, Free-text)
                 ├── View Switcher (Cards Grid vs Interactive Leaflet Map)
                 └── Full Complaint Detail Modal (via GET /api/complaints/:complaintId)
```

---

## Functional Flow

1. **Authentication Check**:
   - The citizen logs in or registers at `/` using JWT Bearer authentication.
   - The token and user profile are saved in secure browser session storage.
2. **Dashboard Navigation**:
   - Navigating to `/dashboard` renders the `<UserDashboard />` component.
   - If accessed unauthenticated, a clear "Authentication Required" prompt directs the visitor to sign in.
3. **Complaint Retrieval**:
   - React calls `GET /api/complaints` with the `Authorization: Bearer <token>` header.
   - Express verifies the token using `protect` middleware and queries MongoDB strictly for documents owned by `req.user._id`.
4. **Complaint Cards & Map Visualization**:
   - Complaints are formatted with tracking ID (e.g., `CE-2026-000123`), AI confidence, status badge, formatted submission date, and GPS coordinates/address.
   - The citizen can toggle between **Cards Grid** and **Map View** powered by Leaflet and OpenStreetMap.
5. **Detailed Inspection Modal**:
   - Clicking **View Details** calls `GET /api/complaints/:complaintId`.
   - Express validates that the requester is the owner of the complaint (or municipal `ADMIN`).
   - The modal renders:
     - Evidence photo (with safe fallback for missing/unrenderable images)
     - Problem description
     - Coordinates and address
     - Interactive Leaflet mini map with category-colored pin
     - YOLO26 detection breakdown (model architecture, variant, confidence score, bounding boxes)
     - 4-stage resolution workflow progress tracker (`Submitted` → `Under Review` → `In Progress` → `Resolved` / `Rejected`)
     - Submission and last updated timestamps

---

## API Endpoints Used

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/complaints` | Protected (Citizen) | Returns all complaints submitted by the authenticated citizen. Supports optional query filters: `status`, `issueType`, `search`. |
| `GET` | `/api/complaints/:complaintId` | Protected (Owner/ADMIN) | Returns full details of a specific complaint. Strictly blocks non-owners with `403 FORBIDDEN`. |
| `POST` | `/api/complaints` | Protected (Citizen) | Submits a new complaint with evidence photo, description, coordinates, and triggers YOLO26 inference. |
| `GET` | `/api/auth/me` | Protected (Citizen/Admin) | Returns active authenticated user profile. |

---

## Security & User Data Privacy

- **Strict User Isolation**: Normal citizens can **never** view another citizen's complaints. The backend never trusts a `userId` sent from the frontend; the citizen's identity is extracted directly from the verified cryptographic JWT payload.
- **Cross-User Protection**: Attempting to query `GET /api/complaints/:complaintId` for a complaint belonging to another user returns `HTTP 403 Forbidden` (`FORBIDDEN`).
- **No Data Leakage**: User dashboard responses omit sensitive internal database fields, admin metadata, other citizens' emails, and passwords.
- **Admin Compatibility**: Municipal officers with role `ADMIN` retain administrative privileges to inspect complaints across all users via admin routes without breaking citizen isolation.

---

## Dashboard Components

### 1. Welcome & Summary Section
- Citizen welcome title: `Welcome back, {User Name}!`
- Registered email and verification badge
- 5 summary statistics cards:
  - **Total Complaints**: All lifetime reports submitted by the citizen
  - **Pending / Review**: Awaiting municipal triage (`submitted`, `pending`, `under_review`)
  - **In Progress**: Active repair/investigation underway (`in_progress`)
  - **Resolved**: Verified resolved civic issues (`resolved`)
  - **Rejected**: Outside jurisdiction or deemed duplicate (`rejected`)

### 2. Search & Filtering Controls
- Search input matching Complaint ID, problem description, landmark, or address
- Status dropdown filter (`All`, `Pending`, `In Progress`, `Resolved`, `Rejected`)
- Issue type dropdown filter (`All`, `Pothole`, `Leakage`, `Garbage`, `Other`)
- View switcher between **Cards** and **Map View**

### 3. Complaint Cards
- Human-readable Complaint ID (e.g., `CE-2026-000123`)
- Category badge with color coding:
  - Pothole: Orange (`#f97316`)
  - Leakage: Blue (`#3b82f6`)
  - Garbage: Emerald Green (`#10b981`)
  - Other: Purple (`#8b5cf6`)
- Status pill with distinct CSS styling and text
- Confidence score (e.g., `92% Conf`)
- Truncated description snippet
- Location badge (formatted coordinates or street address; "Location unavailable" fallback)
- Submission date formatted (e.g., `28 Sep 2026`)
- "View Details" action button

### 4. Complaint Detail Modal
- Evidence photo container with safe image rendering and graceful "Image not available" fallback
- Interactive mini map centered on coordinates
- Full problem description and street address
- AI Model Metadata: Architecture (`Ultralytics YOLO26`), variant (`YOLO26n`), confidence score
- Detected object bounding boxes `[x1, y1, x2, y2]`
- Visual 4-step resolution workflow timeline

### 5. Empty & Error States
- **Empty History**: Clean informational card with "Report an Issue" button directing the citizen to the reporting form.
- **Loading State**: Animated loading indicator preventing blank screens during fetch.
- **Error Handling**: Friendly error alert banners for 401 (session expired), 403 (unauthorized), 404 (not found), and network timeouts with retry buttons.

---

## Verification & Testing

### Automated Test Suite: `backend/test/userDashboardTest.js`
The test suite validates 12 required test conditions against the live Express backend and MongoDB:
1. Authenticated citizen retrieves complaints list (`200 OK`).
2. Unauthenticated request is rejected (`401 NO_TOKEN`).
3. User data isolation between two distinct citizens verified.
4. Cross-user complaint detail access blocked (`403 FORBIDDEN`).
5. Non-existent complaint ID returns `404 COMPLAINT_NOT_FOUND`.
6. Complaint details contain all required schema fields and data types.
7. Complaint statuses (`submitted`, `in_progress`, `rejected`) returned accurately.
8. Issue types (`pothole`, `leakage`, `garbage`) mapped and returned correctly.
9. Geographic location (latitude, longitude, address) retrieved accurately.
10. Citizen with zero complaints receives empty array with `count: 0`.
11. Expired and malformed JWT tokens rejected with `401`.
12. Municipal Admin role access verified with full backward compatibility.

### Regression Test Suite Results
All previous phase test suites verified and passing:
- **Phase 2**: `node backend/test/dbVerification.js` (Database & Model verification)
- **Phase 4**: `python ml-service/test_api.py` (FastAPI ML Service API tests)
- **Phase 5**: `node backend/test/mlIntegrationTest.js` (Express ↔ FastAPI ML Bridge)
- **Phase 6**: `node backend/test/authTest.js` (Authentication & Session tests)
- **Phase 7**: `node backend/test/complaintTest.js` (Complaint persistence & ML inference)
- **Phase 8**: `node backend/test/adminTest.js` (Admin dashboard & complaint management)
- **Phase 9**: `node backend/test/locationTest.js` (Geospatial coordinate validation & maps)
- **Frontend**: `npm run build` (Vite production build: 1590 modules transformed, 0 errors)
