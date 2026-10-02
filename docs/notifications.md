# CivicEye Phase 12: Notifications & Complaint Status Updates

## Overview

Phase 12 introduces a persistent, in-app notification system that connects civic complaint lifecycle events directly to citizen accounts. When a citizen submits a complaint or when an administrator transitions a complaint through its review, repair, resolution, or rejection stages, a persistent notification is generated and stored in MongoDB. Authenticated citizens can inspect notifications via an interactive header bell, track unread counts, mark items as read individually or in bulk, and click any notification to navigate directly to the associated complaint record.

---

## 1. Notification Architecture

The notification architecture strictly preserves the three-tier pattern:
- **React Frontend**: Communicates only with the Express REST API. Never connects directly to MongoDB or FastAPI.
- **Express Backend**: Contains authentication middleware, controller endpoints, and business service logic.
- **MongoDB**: Persists notification records with strict user indexing and reference associations.

```
React Frontend (Header / UserDashboard)
             │
             │ HTTP GET/PATCH /api/notifications
             │ Authorization: Bearer <JWT>
             ▼
      Express REST API
             │
             ├── authMiddleware.js (Validates JWT -> req.user._id)
             ├── notificationController.js
             ▼
  notificationService.js
             │
             ├── MongoDB Notifications Collection
             └── Linked to Complaints Collection
```

### Event Trigger Architecture

```
1. Citizen files complaint (POST /api/complaints)
   └── complaintController.js -> notificationService.notifyComplaintSubmitted()
       └── Saves 'complaint_submitted' notification for citizen in MongoDB

2. Admin updates status (PATCH /api/admin/complaints/:id/status)
   └── adminController.js -> validates oldStatus !== newStatus
       └── notificationService.notifyComplaintStatusChanged()
           └── Saves status transition notification for complaint owner in MongoDB
```

---

## 2. Notification MongoDB Schema

Notifications are persisted in the `notifications` collection (`backend/src/models/Notification.js`).

```javascript
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  complaint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    index: true,
  },
  complaintId: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: [
      'complaint_submitted',
      'complaint_under_review',
      'complaint_in_progress',
      'complaint_resolved',
      'complaint_rejected',
      'general',
    ],
    default: 'general',
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true,
  },
  readAt: {
    type: Date,
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  }
}
```

### Database Indexes

To ensure fast query performance as notification volume grows:
- `{ user: 1, createdAt: -1 }`: Optimizes user-scoped reverse-chronological pagination.
- `{ user: 1, isRead: 1 }`: Optimizes unread count calculation and unread filtering.

---

## 3. Notification Types

| Event Type | Title | Description / Context |
|---|---|---|
| `complaint_submitted` | Complaint Submitted | Emitted immediately after successful complaint creation and persistence. |
| `complaint_under_review` | Complaint Under Review | Emitted when municipal administrator moves complaint to `under_review`. |
| `complaint_in_progress` | Complaint In Progress | Emitted when maintenance crew or field team begins resolving the issue. |
| `complaint_resolved` | Complaint Resolved | Emitted when civic repairs are completed and marked resolved. |
| `complaint_rejected` | Complaint Rejected | Emitted when complaint is rejected (e.g. outside jurisdiction or duplicate). |
| `general` | Notice | General system or administrative communication. |

---

## 4. Notification Creation Flow

1. **Validation & Persistence Pre-requisite**:
   - Notifications are generated **only after** the associated entity (complaint creation or status change) has been successfully saved to MongoDB.
   - If complaint creation fails, no orphan notification is created.
2. **Isolation of Ownership**:
   - The recipient is derived strictly from the complaint owner's verified MongoDB identity (`complaint.user` or `complaint.userId`).
   - The client never provides or controls recipient `userId`.
3. **Non-Blocking Resilience**:
   - Controller calls to `notificationService` are wrapped in guarded error handlers so notification delivery issues never abort or corrupt valid complaint submissions or status updates.

---

## 5. Complaint Status → Notification Flow

When an administrator updates a complaint's status:
1. Admin client calls existing endpoint: `PATCH /api/admin/complaints/:complaintId/status`.
2. Controller verifies administrative authorization (`req.user.role === 'ADMIN'`).
3. Controller validates status validity (`submitted`, `under_review`, `in_progress`, `resolved`, `rejected`).
4. Controller checks if `oldStatus === newStatus`. If unchanged, notification dispatch is skipped entirely.
5. If status has changed, complaint is updated in MongoDB.
6. Server dispatches `notifyComplaintStatusChanged(...)` to create a notification for the complaint's creator.

---

## 6. API Endpoints

All notification endpoints require authentication (`Authorization: Bearer <JWT>`).

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/api/notifications` | Citizen JWT | Retrieve authenticated citizen's notifications with pagination |
| `GET` | `/api/notifications/unread-count` | Citizen JWT | Retrieve current count of unread notifications |
| `PATCH` | `/api/notifications/:notificationId/read` | Citizen JWT | Mark a single notification as read |
| `PATCH` | `/api/notifications/read-all` | Citizen JWT | Mark all notifications belonging to authenticated citizen as read |

---

## 7. Authentication

- Implemented via `protect` middleware (`backend/src/middleware/authMiddleware.js`).
- Requests without a token return `401 Unauthorized` (`NO_TOKEN`).
- Requests with invalid signatures or expired tokens return `401 Unauthorized` (`INVALID_TOKEN` / `TOKEN_EXPIRED`).
- Identity is securely attached to `req.user`.

---

## 8. Authorization

- **User Ownership Isolation**:
  - `GET /api/notifications` strictly scopes database queries to `{ user: req.user._id }`.
  - A citizen cannot read or infer another citizen's notifications.
- **Cross-User Modification Prevention**:
  - `PATCH /api/notifications/:notificationId/read` verifies `notification.user.toString() === req.user._id.toString()`.
  - If a user attempts to mark another user's notification, the request is rejected with `403 Forbidden` (`FORBIDDEN`).
- **Administrative Privacy**:
  - Admins retain administrative rights over civic complaints but do not automatically browse private citizen notification records unless explicit auditing is configured.

---

## 9. Read / Unread Behavior

- **Unread state**: `isRead: false`, `readAt: null`.
- **Read state**: `isRead: true`, `readAt: <ISO Timestamp>`.
- **Single Mark Read**: Sets `isRead: true` and `readAt: new Date()`. Operation is idempotent (subsequent requests on an already-read notification return `200 OK` safely).
- **Mark All Read**: Bulk-updates all unread notifications for `req.user._id` using `updateMany({ user: req.user._id, isRead: false }, ...)`. Leaves other citizens' notifications completely untouched.

---

## 10. Pagination

- Endpoints support query parameters: `GET /api/notifications?page=1&limit=20`.
- Limits are validated and capped at a maximum of 100 items per page to prevent unreasonable resource consumption.
- Response payload provides pagination metadata:
  ```json
  {
    "success": true,
    "notifications": [...],
    "count": 20,
    "unreadCount": 3,
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3,
      "hasMore": true
    }
  }
  ```

---

## 11. Unread Count

- Endpoint: `GET /api/notifications/unread-count`.
- Returns `{ "success": true, "unreadCount": 3 }`.
- Evaluated via optimized index-assisted query `Notification.countDocuments({ user: req.user._id, isRead: false })`.
- Displayed prominently in the frontend header as a badge over the notification bell.

---

## 12. Frontend Notification UI

The frontend notification interface is implemented in `frontend/src/components/NotificationPanel.jsx`:
- **Bell Trigger Button**: Positioned in the application header next to the user session badge. Features an unread count badge (shows exact count or `99+`).
- **Interactive Dropdown Panel**: Glassmorphism design matching CivicEye styling.
- **Filter Tabs**: Toggle between "All (N)" and "Unread (N)".
- **Visual Distinction**: Unread notifications feature a vibrant blue unread dot, tinted background, and bold title. Read notifications show subdued styling.
- **Controls**: "Mark all read" button updates all notifications in one click.
- **Empty / Loading / Error States**: Handled with dedicated illustrations, spinner icons, and retry buttons.
- **Auto-Refresh**: Polls at a conservative 30-second interval, plus triggers immediately upon complaint submission or opening the panel.

---

## 13. Complaint Navigation

- When a notification references a civic complaint, clicking the notification:
  1. Marks the notification as read.
  2. Extracts the `complaintId` (e.g. `CE-2026-000004`).
  3. Seamlessly switches the application view to `dashboard` and opens the Phase 10 Complaint Detail Modal.
- The complaint detail modal displays the evidence photo, YOLO26 AI detection breakdown, geolocation coordinates, and mini map.

---

## 14. Duplicate Prevention

- **Status Transition Guard**: In `adminController.js` and `notificationService.js`, the new status is compared to `oldStatus`.
- If `oldStatus.trim().toLowerCase() === newStatus.trim().toLowerCase()`, the update proceeds without generating duplicate notification documents.
- Opening or refreshing complaints generates no notifications.

---

## 15. Error Handling

- **Invalid ObjectId**: Handled gracefully (`400 Bad Request`, `INVALID_NOTIFICATION_ID`).
- **Non-existent Notification**: Returns `404 Not Found` (`NOTIFICATION_NOT_FOUND`).
- **Unauthorized Access**: Returns `403 Forbidden` (`FORBIDDEN`).
- **Missing Related Complaint**: If a complaint was deleted or missing, notification endpoints populate `complaint: null` without crashing or throwing database exceptions.

---

## 16. Testing

The test suite in `backend/test/notificationTest.js` verifies 24 automated test scenarios:
1. Authenticated citizen can retrieve notifications.
2. Unauthenticated notification request returns 401.
3. Invalid token returns 401.
4. Citizen receives complaint-submitted notification.
5. Notification contains correct complaint reference.
6. Notification contains correct user/recipient.
7. Status transition creates notification.
8. submitted → under_review creates notification.
9. under_review → in_progress creates notification.
10. in_progress → resolved creates notification.
11. Status transition to rejected creates notification.
12. Updating to the SAME status does NOT create duplicate notification.
13. Citizen can retrieve only their own notifications.
14. Citizen cannot access another user's notification (403).
15. Citizen can mark own notification as read.
16. Marking another user's notification as read is rejected.
17. Mark-all-read only affects authenticated user's notifications.
18. Unread count is accurate.
19. Pagination works correctly.
20. Notifications are ordered newest first.
21. Missing related complaint handled safely.
22. Invalid and nonexistent notification IDs handled safely.
23. Frontend notification component/API integration verified.
24. Frontend production build verified.

**Result**: 24/24 PASSED.

---

## 17. Current Limitations

- Notifications are strictly **in-app**.
- **No external delivery providers**: Email (SendGrid/SMTP), SMS (Twilio), WhatsApp, and Web Push are intentionally not included in Phase 12.
- **No WebSockets**: Delivery uses conservative polling and lifecycle event triggers rather than persistent socket connections.

---

## 18. Future Extension Possibilities

1. **Email Delivery**: Optional email notifications via SMTP/SendGrid when a complaint is resolved or rejected.
2. **WebSockets / Server-Sent Events (SSE)**: Instantaneous real-time push to open browser tabs without polling.
3. **SMS / WhatsApp Alerts**: For urgent public hazards or citizen preference channels.
4. **Digest Summaries**: Weekly or monthly summary of resolved complaints in the citizen's neighborhood.
