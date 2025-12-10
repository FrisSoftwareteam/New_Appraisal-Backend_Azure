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
exports.debugLogin = exports.getMe = exports.loginWithFirebase = exports.login = void 0;
const User_1 = __importDefault(require("../models/User"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Login attempt:', req.body);
        const { email, password } = req.body;
        const user = yield User_1.default.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid login credentials' });
        }
        // For initial dev/testing, if no password set, allow login (or use a default)
        // In production, ALWAYS check password
        if (user.password) {
            const isMatch = yield bcryptjs_1.default.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ error: 'Invalid login credentials' });
            }
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, {
            expiresIn: '24h',
        });
        res.send({ user, token });
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.login = login;
const firebase_1 = require("../config/firebase");
const loginWithFirebase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ error: 'ID Token is required' });
        }
        // Verify Firebase ID Token
        const decodedToken = yield firebase_1.auth.verifyIdToken(idToken);
        const { email, name, picture } = decodedToken;
        if (!email) {
            return res.status(400).json({ error: 'Email is required in token' });
        }
        // Find user by email
        let user = yield User_1.default.findOne({ email });
        if (user) {
            // User exists (e.g. imported from Excel), update their details
            let updated = false;
            if (user.isFirstLogin) {
                user.isFirstLogin = false;
                updated = true;
            }
            if (picture && user.avatar !== picture) {
                user.avatar = picture;
                updated = true;
            }
            if (updated) {
                yield user.save();
            }
        }
        else {
            // User doesn't exist, create new one (Auto-registration)
            const names = name ? name.split(' ') : ['Unknown', 'User'];
            const firstName = names[0];
            const lastName = names.length > 1 ? names.slice(1).join(' ') : 'User';
            user = yield User_1.default.create({
                email,
                firstName,
                lastName,
                role: 'guest', // Default to guest until assigned
                department: 'Unassigned',
                division: 'Unassigned',
                grade: 'Unassigned',
                avatar: picture,
                accessLevel: 1,
                isFirstLogin: true
            });
        }
        // Generate internal JWT
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, {
            expiresIn: '24h',
        });
        res.send({ user, token });
    }
    catch (error) {
        console.error('Firebase Login Error:', error);
        res.status(401).json({ error: 'Invalid authentication token' });
    }
});
exports.loginWithFirebase = loginWithFirebase;
const getMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.send(req.user);
});
exports.getMe = getMe;
// Debug login endpoint for development only
const debugLogin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Only allow in development
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Debug login not available in production' });
        }
        const { role } = req.body;
        const targetRole = role || 'super_admin';
        const email = targetRole === 'employee' ? 'employee@company.com' : 'admin@company.com';
        // Find or create a test user
        let user = yield User_1.default.findOne({ email });
        if (!user) {
            if (targetRole === 'employee') {
                user = yield User_1.default.create({
                    email: 'employee@company.com',
                    firstName: 'John',
                    lastName: 'Doe',
                    role: 'employee',
                    department: 'Engineering',
                    division: 'Technology',
                    grade: 'Senior',
                    accessLevel: 1,
                    isFirstLogin: false
                });
            }
            else {
                user = yield User_1.default.create({
                    email: 'admin@company.com',
                    firstName: 'System',
                    lastName: 'Administrator',
                    role: 'super_admin',
                    department: 'IT',
                    division: 'Corporate',
                    grade: 'Executive',
                    accessLevel: 10,
                    isFirstLogin: false
                });
            }
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, {
            expiresIn: '24h',
        });
        res.send({ user, token });
    }
    catch (error) {
        console.error('Debug login error:', error);
        res.status(500).json({ error: 'Debug login failed' });
    }
});
exports.debugLogin = debugLogin;
