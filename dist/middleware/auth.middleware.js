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
exports.requirePermission = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const authenticate = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const token = (_a = req.header('Authorization')) === null || _a === void 0 ? void 0 : _a.replace('Bearer ', '');
        if (!token) {
            throw new Error();
        }
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = yield User_1.default.findById(decoded.id);
        if (!user) {
            throw new Error();
        }
        req.user = user;
        next();
    }
    catch (error) {
        res.status(401).send({ error: 'Please authenticate.' });
    }
});
exports.authenticate = authenticate;
const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).send({ error: 'Access denied.' });
        }
        next();
    };
};
exports.authorize = authorize;
const Role_1 = __importDefault(require("../models/Role"));
const requirePermission = (permission) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (!req.user) {
                return res.status(401).send({ error: 'Please authenticate.' });
            }
            // Super admin always has access
            if (req.user.role === 'super_admin') {
                return next();
            }
            const role = yield Role_1.default.findOne({ slug: req.user.role });
            if (!role) {
                return res.status(403).send({ error: 'Role not found.' });
            }
            // Check if permission exists and is true
            // We use 'any' here because permissions is a Map/Object in the schema
            const permissions = role.permissions;
            if (!permissions || !permissions[permission]) {
                return res.status(403).send({ error: 'Insufficient permissions.' });
            }
            next();
        }
        catch (error) {
            console.error('Permission check error:', error);
            res.status(500).send({ error: 'Internal server error checking permissions.' });
        }
    });
};
exports.requirePermission = requirePermission;
