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
exports.deletePeriod = exports.updatePeriod = exports.getPeriodById = exports.getPeriods = exports.createPeriod = void 0;
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
