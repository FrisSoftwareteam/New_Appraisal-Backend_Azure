import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import periodRoutes from './routes/period.routes';
import staffRoutes from './routes/staff.routes';
import workflowRoutes from './routes/workflow.routes';
import templateRoutes from './routes/template.routes';
import appraisalRoutes from './routes/appraisal.routes';
import dashboardRoutes from './routes/dashboard.routes';
import roleRoutes from './routes/role.routes';
import notificationRoutes from './routes/notification.routes';
import auditRoutes from './routes/audit.routes';
import periodStaffAssignmentRoutes from './routes/periodStaffAssignment.routes';
import reportRoutes from './routes/report.routes';
import appraisalAdminEditRoutes from './routes/appraisal-admin-edit.routes';
import { errorHandler, checkDatabaseConnection } from './middleware/error.middleware';

// Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use(cors());
// app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/periods', periodRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/templates', templateRoutes);
// Admin edit routes must come BEFORE main appraisal routes for proper route matching
app.use('/api/appraisals', appraisalAdminEditRoutes);
app.use('/api/appraisals', appraisalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api', periodStaffAssignmentRoutes);
app.use('/api/reports', reportRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'HR Appraisal System API is running' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbConnected = checkDatabaseConnection();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

import { seedRoles } from './controllers/role.controller';

// ...

// Database Connection
// Database Connection Handling

// Handle uncaught exceptions to prevent immediate hard crash without logging
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥', err.name, err.message);
  console.error(err);
  // In production, you might want to exit: process.exit(1); 
  // But for resilience against transient DB errors, logging might be preferred if the process is stable.
});

process.on('unhandledRejection', (err: any) => {
  console.error('UNHANDLED REJECTION! 💥', err.name, err.message);
  // Ideally, close server and exit, but for now we log strictly.
});

// Mongoose connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connection established');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
  // Check if it's a temporary network issue vs fatal
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose connection disconnected');
});

// Connect
const mongooseOptions = {
    serverSelectionTimeoutMS: 30000, // Increased to 30s to allow for network latency/failover
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    maxPoolSize: 10, // Maintain up to 10 socket connections
    family: 4, // Use IPv4, skip trying IPv6
    autoIndex: false // Don't build indexes in production
};

// Start server regardless of DB connection status
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Global error handler - MUST be after all routes
app.use(errorHandler);

// Connect to MongoDB (async, non-blocking)
mongoose
  .connect(MONGODB_URI, mongooseOptions)
  .then(async () => {
    console.log('MongoDB connected successfully');
    // Seed roles on startup
    try {
      await seedRoles();
    } catch (err) {
      console.error('Error seeding roles:', err);
    }
  })
  .catch((err) => {
    console.error('Initial MongoDB connection error:', err);
    console.warn('⚠️  Server is running but database is unavailable. API requests will return 503.');
  });

// Auto-reconnect on disconnection
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully');
});

export default app;
