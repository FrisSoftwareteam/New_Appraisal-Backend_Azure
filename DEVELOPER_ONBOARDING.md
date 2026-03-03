# Backend Developer Onboarding Guide

This document is the primary onboarding and maintenance guide for the backend service in `New_Appraisal-Backend_Azure`.

## 1. Service Overview

- Name: `hr-appraisal-backend`
- Runtime: Node.js + TypeScript + Express + MongoDB (Mongoose)
- Default local port: `8001` (from `.env`)
- Entry point: `src/server.ts`
- Build output: `dist/`

The backend exposes REST APIs under `/api/*` for:
- Authentication and user/role management
- Appraisal lifecycle (periods, templates, workflows, appraisals)
- Staff, reports, audit, notifications
- Attendance + exception request and HR approval workflows
- Training assignments and recommendations

## 2. Prerequisites

- Node.js 20.x or 22.x LTS recommended
- npm 10+ (or newer compatible)
- MongoDB reachable from your machine (Atlas or local)

## 3. First-Time Setup

1. Install dependencies:
```bash
npm ci
```

2. Create `.env` in backend root (no `.env.example` exists currently):
```env
PORT=8001
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
JWT_SECRET=<strong-random-secret>
NODE_ENV=development

# Optional hard override.
# true = force paused, false = allow HR toggle to control capture.
ATTENDANCE_CAPTURE_FORCE_PAUSED=false

# Optional weekend capture control (defaults to true if omitted).
# true = weekends are auto-paused for capture, false = weekends follow admin toggle.
ATTENDANCE_WEEKENDS_AUTO_PAUSED=true

# Optional exception behavior.
# false = exceptions do not pause attendance capture.
# true = approved exceptions can pause capture for affected users/dates.
ATTENDANCE_EXCEPTIONS_AFFECT_CAPTURE=false

# Reverse geocoding provider config (aligned with AttendanceApp env keys).
REVERSE_GEOCODE_PROVIDER=nominatim
REVERSE_GEOCODE_USER_AGENT=attendance-app
REVERSE_GEOCODE_LANGUAGE=en
MAPBOX_TOKEN=
GOOGLE_MAPS_KEY=

# Cloudinary (photo upload storage, aligned with AttendanceApp env keys)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=attendance-app

# Optional (if using Firebase-integrated features)
FIREBASE_SERVICE_ACCOUNT='<json-service-account>'
```

3. Start server:
```bash
npm run dev
```

4. Verify health:
```bash
curl http://localhost:8001/api/health
```

## 4. Daily Development Commands

- Start dev server: `npm run dev`
- Build TypeScript: `npm run build`
- Start built server: `npm start`
- Lint: `npm run lint`
- Seed basic users: `npm run seed`
- Seed appraisal data: `npm run seed:appraisal`

## 5. Backend Architecture

## 5.1 Folder Structure

```text
src/
  controllers/   HTTP handlers per domain
  middleware/    auth, error handling
  models/        Mongoose schemas
  routes/        Express route wiring
  services/      domain services (attendance logic, etc.)
  utils/         pure utility modules + seed scripts
  scripts/       diagnostics and tooling scripts
  server.ts      app bootstrap + route mounting + db connection
```

## 5.2 Request Flow

1. Route in `src/routes/*` receives request.
2. `authenticate` middleware validates `Authorization: Bearer <jwt>`.
3. Optional `requirePermission(...)` checks role permissions from `Role` model.
4. Controller in `src/controllers/*` validates payload/query and calls model/service.
5. Response is returned as JSON.
6. Errors flow to global handler in `middleware/error.middleware`.

## 5.3 Auth and Authorization

- JWT auth:
  - Login endpoints issue JWT with 24h expiry.
  - `authenticate` middleware loads `req.user`.
- Permission model:
  - `Role` documents store permission flags (e.g. `manageUsers`).
  - `requirePermission` enforces permission checks.
- Microsoft login:
  - Frontend NextAuth calls `/api/auth/microsoft-login`.
  - Backend maps existing user by email and returns backend JWT.

## 6. Attendance and Exception Workflow (Important)

Recent policy flow is implemented as:
- Staff submit individual exception requests (`pending`).
- HR reviews and `approve` / `reject`.
- Only `approved` exceptions influence attendance analytics.
- Exception-based check-in gating is controlled by `ATTENDANCE_EXCEPTIONS_AFFECT_CAPTURE`.

### 6.1 Key Models

- `AttendanceRecord`
- `AttendanceSetting`
- `AttendanceException` (status-driven workflow)

`AttendanceException` statuses:
- `pending`
- `approved`
- `rejected`
- `cancelled`

### 6.2 Key Endpoints

Staff:
- `GET /api/attendance/me/exceptions`
- `POST /api/attendance/me/exceptions`

HR/Admin:
- `GET /api/attendance/admin/exception-requests`
- `PUT /api/attendance/admin/exception-requests/:id/review`
- `GET /api/attendance/admin/exceptions`
- `POST /api/attendance/admin/exceptions`
- `PUT /api/attendance/admin/exceptions/:id`
- `DELETE /api/attendance/admin/exceptions/:id`

Capture controls:
- `GET /api/attendance/admin/capture-control`
- `PUT /api/attendance/admin/capture-control`

### 6.3 Capture Pause Behavior

- `ATTENDANCE_CAPTURE_FORCE_PAUSED=true` forces capture off regardless of admin toggle.
- `ATTENDANCE_WEEKENDS_AUTO_PAUSED=true` keeps weekend capture auto-paused.
- `ATTENDANCE_EXCEPTIONS_AFFECT_CAPTURE=false` keeps capture independent from exceptions.
- Appraisal and monthly attendance insights exclude weekend attendance records from metric calculations.
- Recommended baseline for attendance-only rollout:
  - `ATTENDANCE_CAPTURE_FORCE_PAUSED=false`
  - `ATTENDANCE_WEEKENDS_AUTO_PAUSED=true`
  - `ATTENDANCE_EXCEPTIONS_AFFECT_CAPTURE=false`

## 7. How To Add a New Backend Feature

1. Add/extend model in `src/models`.
2. Add business logic helpers in `src/services` (if shared/reusable).
3. Add controller functions in `src/controllers`.
4. Add routes in `src/routes`.
5. Mount route namespace in `src/server.ts` if new route file.
6. Build and verify:
```bash
npm run build
```

## 8. Data and Migration Notes

- This codebase currently uses schema evolution in-place (no migration framework yet).
- For schema updates:
  - Make new fields optional or provide defaults.
  - Keep backward compatibility for existing docs where possible.
  - Avoid destructive one-shot assumptions in controllers/services.

## 9. Troubleshooting

## 9.1 `Cannot find module ...` in `node_modules`

Dependency tree is likely corrupted.
```bash
rm -rf node_modules
npm ci
```

## 9.2 Server fails to bind port (`EADDRINUSE`, `EPERM`, `EACCES`)

- Change `PORT` in `.env`, or stop the process using that port.
- Common symptom: startup logs include "port is already in use".

## 9.3 Mongo connection errors (`ECONNREFUSED`, `querySrv`, etc.)

- Confirm network access to MongoDB.
- Confirm credentials/IP allowlist in Atlas.
- Confirm `MONGODB_URI` has correct DB and cluster DNS.

## 9.4 Unauthorized (`401`) from protected endpoints

- Confirm request has bearer token.
- Confirm token signed with same `JWT_SECRET`.
- Confirm user still exists in DB.

## 10. Security and Ops Rules

- Never commit real secrets to Git.
- Rotate `JWT_SECRET` and cloud credentials periodically.
- Use separate credentials for local, staging, production.
- Keep `ATTENDANCE_CAPTURE_FORCE_PAUSED` deliberate and environment-specific.

## 11. Onboarding Checklist (Backend)

1. Get repository access.
2. Obtain secure environment variables from maintainers.
3. Run `npm ci`.
4. Start server with `npm run dev`.
5. Confirm `/api/health`.
6. Confirm you can login and hit one protected endpoint.
7. Read `src/server.ts` and top 3 domain controllers you will touch.
8. Make one safe local test change and build.

## 12. Offboarding Checklist (Backend)

1. Remove local `.env` and any copied secret files.
2. Revoke DB/API credentials issued to that developer.
3. Remove cloud console access (Azure, Mongo, Vercel-related service accounts).
4. Remove GitHub/repo/team access.
5. Rotate shared secrets if direct secrets were shared.
6. Transfer any in-progress branch/PR ownership.
