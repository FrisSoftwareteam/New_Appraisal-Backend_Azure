# HR Appraisal System - Backend

Node.js + TypeScript backend for the HR Appraisal System.

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (running locally or accessible via connection string)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update:
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A secure secret key for JWT tokens
   - `PORT`: Server port (default: 8000)

3. **Ensure MongoDB is running:**
   
   **macOS (using Homebrew):**
   ```bash
   brew services start mongodb-community
   ```
   
   **Or start manually:**
   ```bash
   mongod --config /usr/local/etc/mongod.conf
   ```

4. **Seed the database:**
   ```bash
   npm run seed
   ```
   
   This creates initial users:
   - Admin: `admin@company.com` / `password123`
   - Employee: `john.doe@company.com` / `password123`
   - Department Head: `jane.smith@company.com` / `password123`

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   
   Server will run on `http://localhost:8000`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (requires auth)

### Users
- `GET /api/users` - List all users
- `POST /api/users` - Create user (admin only)
- `GET /api/users/:id` - Get user by ID
- `PATCH /api/users/:id` - Update user (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)

### Appraisal Periods
- `GET /api/periods` - List all periods
- `POST /api/periods` - Create period (admin only)
- `GET /api/periods/:id` - Get period by ID
- `PATCH /api/periods/:id` - Update period (admin only)
- `DELETE /api/periods/:id` - Delete period (admin only)

### Appraisal Flows
- `GET /api/flows` - List all flows
- `POST /api/flows` - Create flow (admin only)
- `GET /api/flows/:id` - Get flow by ID
- `PATCH /api/flows/:id` - Update flow (admin only)
- `DELETE /api/flows/:id` - Delete flow (admin only)

### Appraisal Templates
- `GET /api/templates` - List all templates
- `POST /api/templates` - Create template (admin only)
- `GET /api/templates/:id` - Get template by ID
- `PATCH /api/templates/:id` - Update template (admin only)
- `DELETE /api/templates/:id` - Delete template (admin only)

### Appraisals
- `GET /api/appraisals` - List appraisals (filtered by role)
- `POST /api/appraisals` - Create appraisal (admin only)
- `GET /api/appraisals/:id` - Get appraisal by ID
- `POST /api/appraisals/:appraisalId/submit` - Submit a review step

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## Project Structure

```
backend/
├── src/
│   ├── controllers/      # Request handlers
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API routes
│   ├── middleware/      # Auth & other middleware
│   ├── utils/           # Utilities (seed script)
│   ├── config/          # Configuration files
│   └── server.ts        # Entry point
├── scripts/             # Utility scripts
└── dist/               # Compiled JavaScript (generated)
```

## Development

- **Build:** `npm run build`
- **Start (production):** `npm start`
- **Lint:** `npm run lint`

## Notes

- Port 5000 may conflict with macOS AirPlay Receiver. Use port 8000 or configure a different port.
- MongoDB must be running before starting the server.
- All routes except `/api/auth/login` require authentication via JWT Bearer token.
