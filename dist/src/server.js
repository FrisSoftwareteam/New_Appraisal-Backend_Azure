"use strict";
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
const flow_routes_1 = __importDefault(require("./routes/flow.routes"));
const template_routes_1 = __importDefault(require("./routes/template.routes"));
const appraisal_routes_1 = __importDefault(require("./routes/appraisal.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
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
app.use('/api/flows', flow_routes_1.default);
app.use('/api/templates', template_routes_1.default);
app.use('/api/appraisals', appraisal_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.get('/', (req, res) => {
    res.json({ message: 'HR Appraisal System API is running' });
});
// Database Connection
mongoose_1.default
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
exports.default = app;
