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
exports.deleteTemplate = exports.updateTemplate = exports.getTemplateById = exports.getTemplates = exports.createTemplate = void 0;
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
const createTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const template = new AppraisalTemplate_1.default(Object.assign(Object.assign({}, req.body), { createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id }));
        yield template.save();
        res.status(201).send(template);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.createTemplate = createTemplate;
const getTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templates = yield AppraisalTemplate_1.default.find({});
        res.send(templates);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getTemplates = getTemplates;
const getTemplateById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const template = yield AppraisalTemplate_1.default.findById(req.params.id);
        if (!template) {
            return res.status(404).send();
        }
        res.send(template);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getTemplateById = getTemplateById;
const updateTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!template) {
            return res.status(404).send();
        }
        res.send(template);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.updateTemplate = updateTemplate;
const deleteTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const template = yield AppraisalTemplate_1.default.findByIdAndDelete(req.params.id);
        if (!template) {
            return res.status(404).send();
        }
        res.send(template);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.deleteTemplate = deleteTemplate;
