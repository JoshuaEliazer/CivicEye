# CivicEye — Phase 13: Analytics, Reporting & City Insights

## 1. Analytics Architecture

CivicEye Phase 13 implements an administrative analytics and city-level reporting engine built entirely on real MongoDB data. The architecture adheres strictly to the existing decoupled, multi-tier system:

```
┌────────────────────────────────────────────────────────┐
│                       React 18                         │
│   (AdminAnalytics, SVG Visualizations, Leaflet Map)    │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON & CSV (JWT)
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Express Backend                     │
│  (authMiddleware -> analyticsController -> Service)    │
└───────────────────────────┬────────────────────────────┘
                            │ MongoDB Aggregation Pipeline ($facet)
                            ▼
┌────────────────────────────────────────────────────────┐
│                    MongoDB Database                    │
│   (Indexed 'complaints' Collection, real-time data)    │
└────────────────────────────────────────────────────────┘
```

- **Frontend Isolation**: React communicates solely with Express via authenticated REST endpoints. It never interacts directly with MongoDB or FastAPI for analytics.
- **Aggregation Efficiency**: Data processing is executed at the database layer via a high-performance MongoDB `$facet` aggregation pipeline, avoiding the transmission of unaggregated raw records to the browser.
- **Data Integrity**: All metrics, counts, durations, and rates are calculated from actual stored MongoDB records. No metrics, accuracy figures, or dates are hardcoded or fabricated.

---

## 2. Admin Authorization & Security

Analytics and city-level intelligence are administrative features.

- **Role Requirement**: Strictly limited to users with authenticated `role === 'ADMIN'`.
- **JWT Verification**: Validated server-side via `protect` (`authMiddleware.js`).
- **Role Verification**: Enforced via `requireAdmin` (`authMiddleware.js`).
- **Authorization Responses**:
  - Unauthenticated (missing token): `401 Unauthorized` (`NO_TOKEN`).
  - Invalid / Malformed / Expired JWT: `401 Unauthorized` (`INVALID_TOKEN` / `TOKEN_EXPIRED`).
  - Authenticated Citizen (`role === 'USER'`): `403 Forbidden` (`FORBIDDEN_ADMIN_REQUIRED`).
  - Authenticated Administrator (`role === 'ADMIN'`): `200 OK`.
- **Client Elevation Immunity**: Role values passed in request bodies, query strings (`?role=ADMIN`), or custom headers (`X-User-Role`) are completely ignored. Authorization relies solely on the cryptographic signature and payload of the verified JWT.

---

## 3. API Endpoints

The dedicated administrative analytics routes are mounted at `/api/admin/analytics`:

| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/analytics/overview` | Admin (JWT) | Comprehensive dashboard analytics payload containing overview counts, status breakdown, category distribution, time trends, resolution performance, ML statistics, location geospatial markers, and factual city insights. |
| `GET` | `/api/admin/analytics/export` | Admin (JWT) | Generates and streams a CSV report file of aggregated metrics, category percentages, and status breakdown for the selected period with zero citizen PII. |

---

## 4. Query Parameters

Both endpoints accept consistent query parameters:

| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `preset` / `range` | String | Optional | Preset date filter window: `all`, `today`, `7d`, `30d`, `90d`. Defaults to `all`. | `?range=30d` |
| `from` | ISO Date String | Optional | Starting timestamp (inclusive) in `YYYY-MM-DD` or full ISO format. | `?from=2026-09-01` |
| `to` | ISO Date String | Optional | Ending timestamp (inclusive to 23:59:59.999 of the specified date). | `?to=2026-10-02` |

---

## 5. Date Filtering & Validation

- **Presets**:
  - `today`: From start of today (00:00:00.000) to current moment. Daily trend aggregation.
  - `7d` / `last_7_days`: Trailing 7 days. Daily trend aggregation.
  - `30d` / `last_30_days`: Trailing 30 days. Daily trend aggregation.
  - `90d` / `last_90_days`: Trailing 90 days. Weekly trend aggregation.
  - `all` / `all_time`: Unbounded historical range. Monthly trend aggregation.
- **Custom Range**:
  - Validated using strict ISO parsing.
  - Inclusivity: `to` date strings without explicit time components automatically span to `23:59:59.999` of that calendar day.
  - Constraint: `from <= to`. An inverted range (`from > to`) or malformed date string immediately returns `400 Bad Request` with error code `INVALID_DATE_RANGE` or `INVALID_FROM_DATE` / `INVALID_TO_DATE`.

---

## 6. Overview Statistics

High-level summary cards provide immediate municipal visibility:

- `totalAllTime`: Grand total of all complaints ever submitted to CivicEye.
- `totalInRange`: Complaints created within the selected date window.
- `submitted`: Complaints in `submitted` or `pending` status.
- `underReview`: Complaints currently `under_review`.
- `inProgress`: Complaints actively being remediated in `in_progress`.
- `resolved`: Complaints verified as completed in `resolved`.
- `rejected`: Ineligible or non-civic complaints flagged as `rejected`.
- `resolutionRate`: Percentage of period complaints successfully resolved:
  $$\text{Resolution Rate} = \frac{\text{Resolved Complaints in Range}}{\text{Total Complaints in Range}} \times 100$$

---

## 7. Category Analytics

CivicEye's core issue categories are tracked using stored `issueType` enums:

- `pothole`: Road pavement failures, potholes, craters.
- `leakage`: Water supply pipeline ruptures, drainage leaks, sewage overflow.
- `garbage`: Uncollected refuse piles, illegal dumping, public bin overflow.
- `other` / `none`: Miscellaneous community hazards or baseline submissions.

Response includes absolute complaint counts and percentage shares relative to the period's total. Categories are presented factually without editorial ranking (no "best" or "worst" labels).

---

## 8. Status Analytics

Displays the real-time distribution across the municipal lifecycle:

- `submitted`
- `under_review`
- `in_progress`
- `resolved`
- `rejected`

Rendered in the UI using an interactive pure-SVG donut chart with animated segments, percentage tooltips, and an accessible data table.

---

## 9. Trend Analytics

Monitors complaint velocity over time with dynamic grouping intervals:

- **Daily interval** for spans $\le 31$ days (`today`, `7d`, `30d`, or custom $\le 31$ days). Format: `YYYY-MM-DD`.
- **Weekly interval** for spans between $32$ and $180$ days (`90d`, or custom $\le 180$ days). Format: `YYYY-Www`.
- **Monthly interval** for all-time view or spans $> 180$ days. Format: `YYYY-MM`.

Visualized via a clean SVG trend line chart featuring coordinate grid lines, filled area under the curve, data point markers, and interactive hover states.

---

## 10. Resolution Analytics

### Schema Field: `resolvedAt`
To support accurate resolution time metrics without relying on `updatedAt` (which updates on non-resolution actions like adding notes or reviewing), Phase 13 introduces:
```javascript
resolvedAt: {
  type: Date,
  default: null,
  index: true
}
```

### Lifecycle Maintenance
When an administrator updates a complaint status via `PATCH /api/admin/complaints/:id/status`:
- Transition to `resolved`: `complaint.resolvedAt = new Date()`.
- Transition away from `resolved` (e.g. reopening to `in_progress`): `complaint.resolvedAt = null`.

### Duration Calculation
Resolution duration is computed strictly as:
$$\text{Duration (Hours)} = \frac{\text{resolvedAt} - \text{createdAt}}{3,600,000\text{ ms}}$$

### Data Integrity Rules
- Only complaints with both non-null `resolvedAt` and `createdAt` where `resolvedAt >= createdAt` are included in duration calculations.
- If fewer than 1 compliant record exists in the date range, the system outputs:
  - `hasSufficientData: false`
  - `message: "Insufficient resolution timestamp data"`
  - All duration values set to `null` (never fabricated).
- When sufficient data exists, calculates:
  - `averageHours` and `averageDays`
  - `medianHours` (robust against outliers)
  - `minHours` and `maxHours`

---

## 11. ML Prediction Analytics

CivicEye captures AI inference telemetry produced by YOLO26 at complaint submission time:

- **Analyzed Complaints**: Number of complaints evaluated with valid inference scores.
- **Average Confidence**: Mean confidence level across detected complaints.
- **Range Boundaries**: Observed minimum and maximum confidence scores.
- **Uncertain Detections**: Count of predictions flagged with `isUncertain: true`.
- **Confidence Distribution Histogram**:
  - `0–50%`: Low / Baseline.
  - `50–70%`: Moderate confidence.
  - `70–85%`: Confident detection.
  - `85–100%`: High confidence detection.

> [!IMPORTANT]
> **Strict Semantic Boundary**: Recorded inference confidence is clearly labeled as **"Recorded Model Confidence"**. It is NOT model accuracy, precision, recall, or mAP. Model evaluation metrics require an annotated test dataset with ground-truth verification and are never fabricated from unverified complaints.

---

## 12. Location Analytics & Privacy

Leverages the Leaflet / OpenStreetMap geospatial infrastructure from Phase 9:

- **GPS Coverage**: Tracks complaints with valid coordinates vs. unlocated complaints (`coordinateRate`).
- **Interactive Map**: Renders up to 300 recent complaints within the filtered period.
- **Privacy Preservation**:
  - Markers include strictly civic information: `complaintId`, `issueType`, `status`, `latitude`, `longitude`, `location.address`, and `createdAt`.
  - Zero citizen PII is returned or displayed: no user names, emails, phone numbers, or user IDs.

---

## 13. City Insights

Generates factual, neutral observations derived directly from MongoDB records:

- Total complaint volume during the period.
- Most frequently reported category by volume and percentage.
- Geographic GPS coverage proportion.
- Municipal resolution rate and completed count.
- Observed average resolution turnaround time (when valid timestamps exist).
- Active municipal queue (complaints currently under review or in progress).

> [!NOTE]
> Insights use neutral language such as *"Highest reported issue category: Potholes with 42 complaints"* or *"15 complaints recorded in this sector"*. Subjective or political editorializing (*"worst area"*, *"failing municipality"*, *"crisis"*) is strictly prohibited.

---

## 14. Export Functionality

Administrators can export an aggregated civic report via `GET /api/admin/analytics/export`:

- **MIME Type**: `text/csv; charset=utf-8`.
- **Content-Disposition**: `attachment; filename="civiceye-analytics-YYYY-MM-DD.csv"`.
- **Sections**:
  1. Header metadata: Export timestamp, selected date range, total all-time, total in range, resolution rate.
  2. Category Breakdown: Category name, complaint count, percentage of period.
  3. Status Breakdown: Status name, complaint count, percentage of period.
  4. Resolution Performance: Timed complaints, average hours, median hours, min/max hours.
  5. ML Inference Telemetry: Analyzed count, average confidence, confidence bins.
  6. Geographic Telemetry: Located vs. unlocated counts, GPS coverage percentage.
- **Privacy Assurance**: The export strictly aggregates statistical data and contains no citizen personal identifying information.

---

## 15. MongoDB Aggregation Strategy

The core overview query executes a single `$facet` aggregation over the matching date range:

```javascript
Complaint.aggregate([
  { $match: dateMatch },
  {
    $facet: {
      byStatus: [
        { $group: { _id: { $toLower: '$status' }, count: { $sum: 1 } } }
      ],
      byCategory: [
        { $group: { _id: { $toLower: '$issueType' }, count: { $sum: 1 } } }
      ],
      resolutionMetrics: [
        {
          $match: {
            status: { $in: ['resolved', 'RESOLVED'] },
            resolvedAt: { $ne: null, $exists: true },
            createdAt: { $ne: null, $exists: true },
          }
        },
        {
          $project: {
            durationHours: {
              $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000]
            }
          }
        },
        { $match: { durationHours: { $gte: 0 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgHours: { $avg: '$durationHours' },
            minHours: { $min: '$durationHours' },
            maxHours: { $max: '$durationHours' },
            durations: { $push: '$durationHours' }
          }
        }
      ],
      mlMetrics: [
        { $match: { confidence: { $gte: 0, $lte: 1 } } },
        {
          $group: {
            _id: null,
            totalWithConfidence: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' },
            minConfidence: { $min: '$confidence' },
            maxConfidence: { $max: '$confidence' },
            confidences: { $push: '$confidence' },
            uncertainCount: { $sum: { $cond: [{ $eq: ['$isUncertain', true] }, 1, 0] } }
          }
        }
      ],
      locationCounts: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            withCoords: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ['$location.latitude', '$latitude'] }, null] },
                      { $ne: [{ $ifNull: ['$location.longitude', '$longitude'] }, null] },
                      { $gte: [{ $ifNull: ['$location.latitude', '$latitude'] }, -90] },
                      { $lte: [{ $ifNull: ['$location.latitude', '$latitude'] }, 90] },
                      { $gte: [{ $ifNull: ['$location.longitude', '$longitude'] }, -180] },
                      { $lte: [{ $ifNull: ['$location.longitude', '$longitude'] }, 180] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ],
      totalCount: [{ $count: 'count' }]
    }
  }
]);
```

---

## 16. Database Indexes

To support rapid filtering and aggregation on large datasets, compound and single-field indexes were established on `Complaint`:

- `{ createdAt: -1 }`: Optimizes chronological range queries.
- `{ status: 1, createdAt: -1 }`: Speeds status-based filtering across date windows.
- `{ issueType: 1, createdAt: -1 }`: Accelerates category grouping and filtering.
- `{ resolvedAt: 1 }`: Supports fast lookup of complaints with valid resolution timestamps.
- `{ latitude: 1, longitude: 1 }`: Accelerates bounding-box geospatial coordinate queries.

---

## 17. Empty-State Behavior

When the database contains zero complaints or the selected date range has no activity:
- API responds with `200 OK` (does not error).
- `totalInRange`: `0`.
- `resolution.hasSufficientData`: `false` (`"Insufficient resolution timestamp data"`).
- `trends`: Empty array `[]`.
- `byCategory` and `byStatus`: Empty arrays or zero counts.
- `cityInsights`: `["No complaints have been recorded within the selected date range."]`.
- Frontend displays informative empty states without crashing or showing NaN/undefined.

---

## 18. Testing & Verification

A dedicated automated test suite was implemented in `backend/test/analyticsTest.js` covering 22 comprehensive scenarios:

1. Admin access to `/api/admin/analytics/overview` (200 OK).
2. Unauthenticated request rejection (401 NO_TOKEN).
3. Malformed/invalid token rejection (401 INVALID_TOKEN).
4. Citizen token access rejection (403 FORBIDDEN_ADMIN_REQUIRED).
5. Verification of total all-time complaint count against database.
6. Verification of status aggregation counts against direct database queries.
7. Verification of category aggregation counts against database records.
8. Verification of date range filtering (`7d` vs. `all`).
9. Rejection of invalid date ranges (`from > to` and malformed dates) with 400 Bad Request.
10. Verification of time trend interval grouping and count consistency.
11. Validation that resolution duration uses only non-null `resolvedAt` records.
12. Validation of resolution rate calculation accuracy.
13. Validation of ML category predictions against stored metadata.
14. Validation that ML confidence calculations ignore missing or invalid values.
15. Verification of GPS coordinate coverage rate calculation.
16. Validation of zero-data empty range response handling.
17. Verification that analytics payloads strictly contain zero citizen PII.
18. Verification that client parameters cannot override admin authorization.
19. Verification of all preset date ranges (`today`, `7d`, `30d`, `90d`, `all`).
20. Verification of CSV export file format, headers, and privacy guarantees.
21. Verification of `resolvedAt` lifecycle (set on `resolved`, cleared when moving away).
22. Verification of frontend production build bundle existence and integrity.

---

## 19. Known Limitations

1. **Historical Complaints Without `resolvedAt`**: Complaints resolved prior to Phase 13 lack a dedicated `resolvedAt` timestamp. They are not backfilled with fake timestamps; resolution duration metrics honestly report on complaints with verified timestamps.
2. **Inference vs. Model Accuracy**: The dashboard strictly presents recorded YOLO26 prediction confidence. Real evaluation accuracy (mAP, precision, recall) cannot be computed from unlabeled production complaints and is omitted.

---

## 20. Future Enhancements

1. **PDF Executive Summary Export**: Automated generation of printable administrative briefing packets with embedded chart snapshots.
2. **Geospatial Density Heatmaps**: Extended Leaflet heat-layer clustering for visual identification of municipal maintenance corridors.
3. **Automated Departmental Routing Analytics**: Tracking resolution velocity categorized by assigned municipal department or contractor zone.
