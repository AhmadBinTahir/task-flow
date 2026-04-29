# TaskFlow Pro

TaskFlow Pro is a full-stack task management app with a secure Node.js/Express API and a premium monochrome dashboard UI.

It combines authentication, advanced task workflows, filtering, analytics, and bulk actions in a responsive interface.

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Authentication Modes](#authentication-modes)
- [Scripts](#scripts)
- [License](#license)

## Features

- JWT-based authentication with bcrypt password hashing and account lockout protection
- Environment-aware auth rules for development and production
- Complete task lifecycle: create, update, archive, delete, and bulk status updates
- Rich task fields: category, status, priority, tags, due date, recurrence, archived, completedAt
- Recurring tasks (daily/weekly/monthly) with automatic next occurrence generation on completion
- Filtering, search, sorting, and pagination-ready list endpoints
- Task insights endpoint with completion and overdue analytics
- API protection via rate limiting, security middleware, request logging, and centralized error handling
- Responsive dashboard with KPI cards, list + board views, and modal editing

## Screenshots

![Dashboard view 1](Screenshots/Screenshot%202026-04-26%20181256.png)
![Dashboard view 2](Screenshots/Screenshot%202026-04-26%20181337.png)
![Board and modal view](Screenshots/Screenshot%202026-04-26%20181503.png)
![Task interaction view](Screenshots/Screenshot%202026-04-26%20181518.png)

## Tech Stack

- **Backend:** Node.js, Express, JWT, bcryptjs
- **Middleware:** helmet, cors, express-rate-limit, morgan, compression
- **Email:** nodemailer (SMTP)
- **Storage:** SQLite datastore with indexed tables and parameterized queries
- **Frontend:** vanilla HTML, CSS, and JavaScript
- **Testing:** Jest + Supertest

## Quick Start

```bash
npm install
copy .env.example .env
npm run dev
```

Open:

- Dashboard: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

Run tests:

```bash
npm test
```

## Environment Variables

```env
PORT=4000
NODE_ENV=development
APP_MODE=development
JWT_SECRET=change-this-secret
JWT_EXPIRES_IN=1d
DB_PATH=data\task-db.sqlite
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=120
LOG_FILE=logs\access.log
CORS_ORIGIN=*
TRUST_PROXY=false
ENABLE_COMPRESSION=true
PUBLIC_APP_URL=http://localhost:4000
AUTH_PASSWORD_MIN_LENGTH=10
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCK_MINUTES=15
AUTH_VERIFY_TOKEN_TTL_MINUTES=30
AUTH_FORCE_EMAIL_VERIFICATION=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## API Reference

All task routes require:

`Authorization: Bearer <token>`

### Auth Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `GET /api/auth/config`
- `GET /api/auth/me`

### Task Endpoints

- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `PATCH /api/tasks/bulk/status`
- `GET /api/tasks/insights`

### Task Query Parameters

- `status`: `pending | in-progress | done`
- `category`: `work | personal | urgent`
- `priority`: `low | medium | high | critical`
- `due`: `overdue | today | upcoming | none`
- `archived`: `true | false`
- `search`: free text on title/description/tags
- `sortBy`: `createdAt | updatedAt | dueDate | priority | title | status`
- `sortDir`: `asc | desc`
- `limit`: `1..200`
- `offset`: `0+`

### Example Task Payload

```json
{
  "title": "Ship release",
  "description": "Finalize release notes",
  "category": "work",
  "status": "in-progress",
  "priority": "high",
  "tags": ["release", "q2"],
  "dueDate": "2026-06-01T10:00:00.000Z",
  "recurrence": "weekly",
  "recurrenceEndDate": "2026-12-31T10:00:00.000Z",
  "archived": false
}
```

## Project Structure

```txt
src/
  config/          # environment + domain constants
  controllers/     # request orchestration
  db/              # file datastore abstraction
  middleware/      # auth, limiter, logger, errors
  repositories/    # persistence layer
  routes/          # API routing
  services/        # business logic
  utils/           # validators + shared helpers
public/            # dashboard UI
tests/             # integration tests
```

## Authentication Modes

### Development / Test (`APP_MODE=development`)

- Signup returns a JWT immediately by default
- Optional verification token preview can be returned for local testing

### Production (`APP_MODE=production`)

- Stronger password policy
- Email verification required before login
- Account lockout after repeated failed login attempts
- SMTP configuration required for email delivery

## Scripts

- `npm start`
- `npm run dev`
- `npm test`
- `npm run test:watch`

## License

MIT — see `LICENSE`.

