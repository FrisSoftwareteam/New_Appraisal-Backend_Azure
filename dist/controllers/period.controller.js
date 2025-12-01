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
exports.removeStaff = exports.assignStaff = exports.getAssignedStaff = exports.deletePeriod = exports.updatePeriod = exports.getPeriodById = exports.getPeriods = exports.createPeriod = void 0;
const AppraisalPeriod_1 = __importDefault(require("../models/AppraisalPeriod"));
const createPeriod = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const period = new AppraisalPeriod_1.default(Object.assign(Object.assign({}, req.body), { createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id }));
        yield period.save();
        res.status(201).send(period);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.createPeriod = createPeriod;
const getPeriods = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const periods = yield AppraisalPeriod_1.default.find({});
        res.send(periods);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getPeriods = getPeriods;
const getPeriodById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const period = yield AppraisalPeriod_1.default.findById(req.params.id);
        if (!period) {
            return res.status(404).send();
        }
        res.send(period);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getPeriodById = getPeriodById;
const updatePeriod = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const period = yield AppraisalPeriod_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!period) {
            return res.status(404).send();
        }
        res.send(period);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.updatePeriod = updatePeriod;
const deletePeriod = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const period = yield AppraisalPeriod_1.default.findByIdAndDelete(req.params.id);
        if (!period) {
            return res.status(404).send();
        }
        res.send(period);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.deletePeriod = deletePeriod;
// Get assigned staff for a period
const getAssignedStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const period = yield AppraisalPeriod_1.default.findById(req.params.id).populate('assignedEmployees', 'firstName lastName email department role avatar');
        if (!period) {
            return res.status(404).json({ message: 'Period not found' });
        }
        res.json(period.assignedEmployees);
    }
    catch (error) {
        console.error('Error fetching assigned staff:', error);
        res.status(500).json({ message: 'Error fetching assigned staff', error });
    }
});
exports.getAssignedStaff = getAssignedStaff;
// Assign staff to a period (bulk)
const assignStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeIds } = req.body;
        if (!Array.isArray(employeeIds)) {
            return res.status(400).json({ message: 'employeeIds must be an array' });
        }
        const period = yield AppraisalPeriod_1.default.findById(req.params.id);
        if (!period) {
            return res.status(404).json({ message: 'Period not found' });
        }
        // Add new employees, avoiding duplicates
        const newEmployees = employeeIds.filter(id => !period.assignedEmployees.includes(id));
        period.assignedEmployees.push(...newEmployees);
        yield period.save();
        yield period.populate('assignedEmployees', 'firstName lastName email department role avatar');
        res.json(period.assignedEmployees);
    }
    catch (error) {
        console.error('Error assigning staff:', error);
        res.status(500).json({ message: 'Error assigning staff', error });
    }
});
exports.assignStaff = assignStaff;
// Remove staff from a period
const removeStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { employeeId } = req.params;
        const period = yield AppraisalPeriod_1.default.findById(req.params.id);
        if (!period) {
            return res.status(404).json({ message: 'Period not found' });
        }
        period.assignedEmployees = period.assignedEmployees.filter(id => id.toString() !== employeeId);
        yield period.save();
        yield period.populate('assignedEmployees', 'firstName lastName email department role avatar');
        res.json(period.assignedEmployees);
    }
    catch (error) {
        console.error('Error removing staff:', error);
        res.status(500).json({ message: 'Error removing staff', error });
    }
});
exports.removeStaff = removeStaff;
