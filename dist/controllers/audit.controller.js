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
exports.deleteAllAuditLogs = exports.createAuditLog = exports.getAuditLogs = void 0;
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Maps frontend filter values to backend action values (exact or prefix) */
const ACTION_FILTER_MAP = {
    create: ['create'],
    update: ['update', 'admin_edit', 'appraisal_admin_edit'],
    delete: ['delete'],
    submit: ['submit', 'submit_review'],
    approve: ['approve'],
    reject: ['reject', 'appraisal_rejected'],
    comment: ['comment'],
    reassign: ['reassign'],
    committee_review: ['committee_review'],
    appraisal_completed: ['appraisal_completed', 'appraisal_accepted_intermediate'],
};
// Get audit logs with filtering and pagination
const getAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { page = 1, limit = 20, action, entity, search } = req.query;
        const query = {};
        if (action && String(action) !== 'all') {
            const actionStr = String(action).trim();
            const mappedActions = (_a = ACTION_FILTER_MAP[actionStr]) !== null && _a !== void 0 ? _a : [actionStr];
            query.action = mappedActions.length === 1 ? mappedActions[0] : { $in: mappedActions };
        }
        if (entity && String(entity) !== 'all') {
            query.entityType = String(entity).trim();
        }
        const searchStr = typeof search === 'string' ? search.trim() : '';
        if (searchStr) {
            const searchRegex = new RegExp(escapeRegex(searchStr), 'i');
            query.$or = [
                { details: searchRegex },
                { entityId: searchRegex },
                { entityType: searchRegex },
            ];
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
// Delete all audit logs (super_admin only)
const deleteAllAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield AuditLog_1.default.deleteMany({});
        res.json({ message: 'All audit logs cleared successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error clearing audit logs', error });
    }
});
exports.deleteAllAuditLogs = deleteAllAuditLogs;
