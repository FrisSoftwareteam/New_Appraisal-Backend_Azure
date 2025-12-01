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
app.use('/api/appraisals', appraisalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'HR Appraisal System API is running' });
});

// Database Connection
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

export default app;
