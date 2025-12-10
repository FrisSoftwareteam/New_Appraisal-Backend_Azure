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
exports.deleteFlow = exports.updateFlow = exports.getFlowById = exports.getFlows = exports.createFlow = void 0;
const AppraisalFlow_1 = __importDefault(require("../models/AppraisalFlow"));
const createFlow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const flow = new AppraisalFlow_1.default(Object.assign(Object.assign({}, req.body), { createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id }));
        yield flow.save();
        res.status(201).send(flow);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.createFlow = createFlow;
const getFlows = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const flows = yield AppraisalFlow_1.default.find({});
        res.send(flows);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getFlows = getFlows;
const getFlowById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const flow = yield AppraisalFlow_1.default.findById(req.params.id);
        if (!flow) {
            return res.status(404).send();
        }
        res.send(flow);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getFlowById = getFlowById;
const updateFlow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const flow = yield AppraisalFlow_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!flow) {
            return res.status(404).send();
        }
        res.send(flow);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.updateFlow = updateFlow;
const deleteFlow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const flow = yield AppraisalFlow_1.default.findByIdAndDelete(req.params.id);
        if (!flow) {
            return res.status(404).send();
        }
        res.send(flow);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.deleteFlow = deleteFlow;
