# CivicEye Image Storage & Media Management Documentation

## 1. Why Image Storage Exists

In prior phases, civic complaint photos were uploaded to Express in-memory (`multer.memoryStorage()`) and forwarded directly to the FastAPI ML service for real-time YOLO26 inference. However, photos were not persisted beyond the duration of the HTTP request, leaving complaint records without access to visual evidence after initial submission.

Phase 11 introduces a production-oriented, abstracted storage architecture that:
- Persists civic evidence photos safely on the server filesystem.
- Stores comprehensive image metadata and retrieval references in MongoDB without saving raw image binaries in the database.
- Provides a secure image retrieval API that enforces authentication, ownership authorization, and admin access control.
- Decouples storage provider implementations (local disk, future Cloudinary/S3) from controllers via a unified service contract.

---

## 2. Current Architecture

The media management architecture follows CivicEye's strict layered flow:

```
React (Citizen / Admin)
  │
  ▼
Express REST API (port 5000)
  ├── 1. uploadSingleImage (multer in-memory validation)
  ├── 2. storageService.saveImage() ──► backend/uploads/complaints/
  ├── 3. predictCivicIssue() ──────────► FastAPI ML Service (port 8000)
  │                                        │
  │                                        ▼
  │                                      Ultralytics YOLO26
  └── 4. new Complaint({ image: metadata }) ──► MongoDB
```

**Key Architectural Rules:**
1. **React never communicates directly with FastAPI or MongoDB.** All requests flow through Express.
2. **Express handles authentication and authorization.** Direct static file exposure (`express.static`) is prohibited so unauthorized users cannot enumerate or guess other citizens' evidence photos.
3. **Rollback Safety:** If ML inference or database persistence fails after an image has been saved to disk, the newly written image is automatically unlinked and cleaned up.

---

## 3. Storage Abstraction

The storage system is modularized under `backend/src/services/storage/`:

- `storageService.js`: Facade/factory that reads `STORAGE_TYPE` from the environment (defaults to `'local'`) and exposes a unified interface.
- `localStorageService.js`: Local filesystem implementation with boundary enforcement, safe filename generation, and streaming capabilities.
- `index.js`: Clean module re-export for the application.

### Service Interface Contract:

```javascript
class StorageProvider {
  async saveImage({ buffer, originalName, mimetype, complaintId, subDir })
  async getImagePath(storageKey)
  async getImageStream(storageKey)
  async deleteImage(storageKey)
  async exists(storageKey)
  async ensureDirectory(dirPath)
}
```

---

## 4. Local Storage Implementation

In `LocalStorageService`:
- Resolves paths using Node's `path` module, ensuring compatibility across Windows and Linux environments.
- Generates safe, collision-resistant filenames:
  ```
  complaint_<complaintId_or_id>_<timestamp>_<entropy>.<extension>
  ```
  Example: `complaint_CE-2026-000003_1790604827326_a7a663e6.jpg`
- User-provided original filenames are sanitized with `path.basename()` and truncated to 255 characters, never used as filesystem keys.
- Streaming: Serves images via Node readable streams (`fs.createReadStream`) directly to the Express HTTP response pipeline.

---

## 5. Directory Structure

```
backend/
├── uploads/              <-- Ignored in Git (.gitignore)
│   └── complaints/       <-- Auto-created on initialization/upload
│       └── complaint_CE-2026-000001_1790600000_a1b2c3d4.jpg
├── src/
│   ├── services/
│   │   └── storage/
│   │       ├── index.js
│   │       ├── localStorageService.js
│   │       └── storageService.js
│   ├── controllers/
│   │   └── complaintController.js
│   └── routes/
│       └── complaintRoutes.js
└── test/
    └── imageStorageTest.js
```

---

## 6. MongoDB Image Metadata

Complaint documents store reference metadata inside the `image` subdocument:

```json
{
  "complaintId": "CE-2026-000003",
  "issueType": "pothole",
  "image": {
    "filename": "complaint_CE-2026-000003_1790604827326_a7a663e6.jpg",
    "originalName": "road_evidence.jpg",
    "mimetype": "image/jpeg",
    "size": 11943,
    "storageType": "local",
    "storageKey": "complaints/complaint_CE-2026-000003_1790604827326_a7a663e6.jpg",
    "path": "complaints/complaint_CE-2026-000003_1790604827326_a7a663e6.jpg",
    "url": "/api/complaints/CE-2026-000003/image"
  },
  "imageUrl": "/api/complaints/CE-2026-000003/image"
}
```

> [!NOTE]
> MongoDB stores only references, hashes, and metadata. Binary image payloads are never stored in the database.

---

## 7. Image Retrieval API

### `GET /api/complaints/:complaintId/image`

Retrieves the stored evidence image for a specific complaint.

- **Authentication:** Protected. Accepts standard `Authorization: Bearer <token>` header or `?token=<jwt>` query parameter for `<img>` tags.
- **Authorization:**
  - Citizen: Permitted only if the complaint belongs to the authenticated user.
  - Admin: Permitted for any complaint in the municipal system.
- **Response Headers:**
  - `Content-Type`: Set dynamically to stored MIME type (`image/jpeg`, `image/png`, `image/webp`).
  - `Content-Length`: Accurate file byte length.
  - `Content-Disposition`: `inline; filename="complaint_<id>.jpg"`.
  - `Cache-Control`: `private, max-age=86400`.
- **Status Codes:**
  - `200 OK`: Binary image streamed.
  - `401 Unauthorized`: Missing or invalid JWT.
  - `403 Forbidden`: Citizen attempting to access another user's evidence photo.
  - `404 Not Found`: Complaint not found or image physical file missing on server.
  - `400 Bad Request`: Path traversal sequence detected.

---

## 8. Authentication & Authorization

1. **Bearer Token Authentication:** Evaluated by `authMiddleware.js (protect)`. Supports standard authorization headers and fallback query tokens.
2. **Ownership Verification:** In `complaintController.js`:
   ```javascript
   const isOwner = complaint.user.toString() === req.user._id.toString();
   const isAdmin = req.user.role === 'ADMIN';
   if (!isOwner && !isAdmin) {
     return res.status(403).json({ success: false, error: 'FORBIDDEN' });
   }
   ```
3. **No Guessable Paths:** Files cannot be accessed directly via static paths like `/uploads/...`.

---

## 9. File Validation

- **Allowed Extensions:** `.jpg`, `.jpeg`, `.png`, `.webp`.
- **Allowed MIME Types:** `image/jpeg`, `image/png`, `image/webp`.
- **Maximum File Size:** 10 MB (`10 * 1024 * 1024` bytes).
- **Prohibited Extensions:** Executables, scripts, HTML, SVG, archives (`.exe`, `.bat`, `.cmd`, `.ps1`, `.js`, `.html`, `.svg`, `.zip`, etc.) are rejected with HTTP 400 `INVALID_FILE_TYPE`.
- **Empty / Corrupt Files:** Handled by validation and ML unprocessable entity checks.

---

## 10. Security Protections

- **Path Traversal Containment:** `LocalStorageService.resolveSafePath()` checks for `..`, null byte `\0`, backslash escapes, and ensures the resolved absolute path starts strictly within the configured storage root directory. Attempts throw `PathTraversalError` and return HTTP 400.
- **Server Path Obfuscation:** API error responses and database models never leak internal operating system paths (`C:\Users\...`).
- **Git Exposure:** `backend/uploads/` is added to `.gitignore` to prevent committing citizen uploads to version control.

---

## 11. Cleanup & Rollback Behavior

- **Database Persistence Failure:** If `newComplaint.save()` throws an exception, `storageService.deleteImage()` is invoked immediately to unlink the newly saved image file, preventing disk bloat.
- **ML Failure:** If inference fails, temporary disk allocations are safely deleted before throwing the error.
- **Test Suite Hygiene:** All automated tests register created storage keys and unlink them in a `finally` block upon test completion.

---

## 12. How to Change Storage Provider Later (Phase 12+)

To switch from local storage to Amazon S3 or Cloudinary:
1. Create `s3StorageService.js` or `cloudinaryStorageService.js` implementing the `StorageProvider` interface (`saveImage`, `getImagePath`/`getImageStream`, `deleteImage`, `exists`).
2. Update `storageService.js` to instantiate the cloud provider when `process.env.STORAGE_TYPE === 's3'` or `'cloudinary'`.
3. Set `STORAGE_TYPE=s3` in `.env`.
4. No changes to `complaintController.js` or frontend components are required.

---

## 13. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_TYPE` | `local` | Active storage driver (`local`) |
| `LOCAL_STORAGE_PATH` | `uploads` | Root directory for local storage |
| `PORT` | `5000` | Express backend port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/civiceye` | MongoDB database URI |
| `JWT_SECRET` | Required | Secret for signing and verifying tokens |

---

## 14. Development & Running Instructions

### Start Services:
1. **ML Service:**
   ```bash
   cd ml-service
   python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```
2. **Backend API:**
   ```bash
   cd backend
   npm run dev
   ```
3. **Frontend Dashboard:**
   ```bash
   cd frontend
   npm run dev
   ```

### Run Phase 11 Test Suite:
```bash
cd backend
node test/imageStorageTest.js
```

---

## 15. Current Limitations

- **Local Storage Scope:** In Phase 11, files are stored on the local application server filesystem. Distributed multi-server clustering requires configuring cloud object storage (S3/GCS/Cloudinary) in a future deployment phase.
- **Thumbnail Generation:** Images are served in their uploaded dimensions. Automated thumbnail downscaling and responsive image variants are scheduled for future media optimization.
