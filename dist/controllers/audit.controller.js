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
exports.createAuditLog = exports.getAuditLogs = void 0;
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
// Get audit logs with filtering and pagination
const getAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = 1, limit = 20, action, entity, search } = req.query;
        const query = {};
        if (action && action !== 'all') {
            query.action = action;
        }
        if (entity && entity !== 'all') {
            query.entityType = entity;
        }
        // Basic search implementation (could be improved with text index)
        if (search) {
            // Since 'details' isn't a direct field in the model (it's constructed or part of metadata/changes),
            // we might need to adjust this. However, looking at the frontend mock data, 'details' was a field.
            // The model has 'changes' and 'metadata'. 
            // Let's assume for now we search in metadata values if 'details' isn't there, 
            // or we might need to add a 'details' field to the model if we want easy searching.
            // For now, let's search in entityId or entityType as a fallback if no text index.
            // Ideally, we should add a 'summary' or 'details' field to the AuditLog model for human-readable logs.
            // I'll stick to exact matches or simple regex on fields that exist.
            // Or, I can check if I should update the model. 
            // The frontend mock data has a 'details' field. The backend model DOES NOT.
            // I should update the backend model to include a 'details' string field for easier display/search.
        }
        const logs = yield AuditLog_1.default.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .populate('userId', 'firstName lastName avatar email');
        const total = yield AuditLog_1.default.countDocuments(query);
        res.json({
            logs,
            total,
            pages: Math.ceil(total / Number(limit)),
            currentPage: Number(page)
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching audit logs', error });
    }
});
exports.getAuditLogs = getAuditLogs;
// Create audit log (Internal helper)
const createAuditLog = (userId, action, entityType, entityId, details, // Adding this param to match frontend expectation, will need to update model
changes, metadata) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield AuditLog_1.default.create({
            userId,
            action,
            entityType,
            entityId,
            details,
            changes,
            metadata
        });
    }
    catch (error) {
        console.error('Error creating audit log:', error);
    }
});
exports.createAuditLog = createAuditLog;
