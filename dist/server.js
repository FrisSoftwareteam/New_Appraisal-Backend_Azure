"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const period_routes_1 = __importDefault(require("./routes/period.routes"));
const staff_routes_1 = __importDefault(require("./routes/staff.routes"));
const workflow_routes_1 = __importDefault(require("./routes/workflow.routes"));
const template_routes_1 = __importDefault(require("./routes/template.routes"));
const appraisal_routes_1 = __importDefault(require("./routes/appraisal.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const role_routes_1 = __importDefault(require("./routes/role.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
const periodStaffAssignment_routes_1 = __importDefault(require("./routes/periodStaffAssignment.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const appraisal_admin_edit_routes_1 = __importDefault(require("./routes/appraisal-admin-edit.routes"));
const error_middleware_1 = require("./middleware/error.middleware");
// Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
app.use((0, cors_1.default)());
// app.use(helmet());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/periods', period_routes_1.default);
app.use('/api/staff', staff_routes_1.default);
app.use('/api/workflows', workflow_routes_1.default);
app.use('/api/templates', template_routes_1.default);
// Admin edit routes must come BEFORE main appraisal routes for proper route matching
app.use('/api/appraisals', appraisal_admin_edit_routes_1.default);
app.use('/api/appraisals', appraisal_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/roles', role_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/audit', audit_routes_1.default);
app.use('/api', periodStaffAssignment_routes_1.default);
app.use('/api/reports', report_routes_1.default);
app.get('/', (req, res) => {
    res.json({ message: 'HR Appraisal System API is running' });
});
// Health check endpoint
app.get('/api/health', (req, res) => {
    const dbConnected = (0, error_middleware_1.checkDatabaseConnection)();
    res.status(dbConnected ? 200 : 503).json({
        status: dbConnected ? 'healthy' : 'unhealthy',
        database: dbConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});
const role_controller_1 = require("./controllers/role.controller");
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
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥', err.name, err.message);
    // Ideally, close server and exit, but for now we log strictly.
});
// Mongoose connection events
mongoose_1.default.connection.on('connected', () => {
    console.log('Mongoose connection established');
});
mongoose_1.default.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
    // Check if it's a temporary network issue vs fatal
});
mongoose_1.default.connection.on('disconnected', () => {
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
app.use(error_middleware_1.errorHandler);
// Connect to MongoDB (async, non-blocking)
mongoose_1.default
    .connect(MONGODB_URI, mongooseOptions)
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log('MongoDB connected successfully');
    // Seed roles on startup
    try {
        yield (0, role_controller_1.seedRoles)();
    }
    catch (err) {
        console.error('Error seeding roles:', err);
    }
}))
    .catch((err) => {
    console.error('Initial MongoDB connection error:', err);
    console.warn('⚠️  Server is running but database is unavailable. API requests will return 503.');
});
// Auto-reconnect on disconnection
mongoose_1.default.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
});
mongoose_1.default.connection.on('reconnected', () => {
    console.log('MongoDB reconnected successfully');
});
exports.default = app;
