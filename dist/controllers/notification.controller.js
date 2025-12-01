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
exports.createNotification = exports.deleteNotification = exports.markAsRead = exports.getNotifications = void 0;
const Notification_1 = __importDefault(require("../models/Notification"));
// Get notifications for the current user
const getNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const notifications = yield Notification_1.default.find({ userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(notifications);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching notifications', error });
    }
});
exports.getNotifications = getNotifications;
// Mark notifications as read
const markAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { ids, all } = req.body;
        if (all) {
            yield Notification_1.default.updateMany({ userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id, isRead: false }, { isRead: true });
        }
        else if (ids && Array.isArray(ids)) {
            yield Notification_1.default.updateMany({ _id: { $in: ids }, userId: (_b = req.user) === null || _b === void 0 ? void 0 : _b._id }, { isRead: true });
        }
        res.json({ message: 'Notifications marked as read' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating notifications', error });
    }
});
exports.markAsRead = markAsRead;
// Delete a notification
const deleteNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const notification = yield Notification_1.default.findOneAndDelete({
            _id: id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id
        });
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({ message: 'Notification deleted' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting notification', error });
    }
});
exports.deleteNotification = deleteNotification;
// Create a notification (Internal helper)
const createNotification = (userId_1, title_1, message_1, ...args_1) => __awaiter(void 0, [userId_1, title_1, message_1, ...args_1], void 0, function* (userId, title, message, type = 'info', link) {
    try {
        yield Notification_1.default.create({
            userId,
            title,
            message,
            type,
            link
        });
    }
    catch (error) {
        console.error('Error creating notification:', error);
    }
});
exports.createNotification = createNotification;
