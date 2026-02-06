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
exports.getEligibleStaffForTemplate = exports.rejectTemplate = exports.approveTemplate = exports.assignTemplate = exports.deleteAllTemplates = exports.deleteTemplate = exports.updateTemplate = exports.getTemplateById = exports.getAllTemplates = exports.createTemplate = void 0;
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
const User_1 = __importDefault(require("../models/User"));
// Create a new template
const createTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, description, questions, applicableGrades, applicableDepartments, assignedUsers, status } = req.body;
        // Deduplicate arrays
        const uniqueAssignedUsers = assignedUsers ? [...new Set(assignedUsers)] : [];
        const uniqueGrades = applicableGrades ? [...new Set(applicableGrades)] : [];
        const uniqueDepartments = applicableDepartments ? [...new Set(applicableDepartments)] : [];
        // Validate assigned users if provided
        if (uniqueAssignedUsers.length > 0) {
            const users = yield User_1.default.find({ _id: { $in: uniqueAssignedUsers } });
            if (users.length !== uniqueAssignedUsers.length) {
                return res.status(400).json({ message: 'One or more assigned users not found' });
            }
        }
        const template = new AppraisalTemplate_1.default({
            name,
            description,
            questions,
            applicableGrades: uniqueGrades,
            applicableDepartments: uniqueDepartments,
            assignedUsers: uniqueAssignedUsers,
            status: status || 'draft',
            createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
        });
        yield template.save();
        res.status(201).json(template);
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating template', error });
    }
});
exports.createTemplate = createTemplate;
// Get all templates
const getAllTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templates = yield AppraisalTemplate_1.default.find()
            .populate('createdBy', 'firstName lastName')
            .populate('assignedUsers', 'firstName lastName email')
            .sort({ createdAt: -1 });
        res.json(templates);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching templates', error });
    }
});
exports.getAllTemplates = getAllTemplates;
// Get single template
const getTemplateById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const template = yield AppraisalTemplate_1.default.findById(req.params.id)
            .populate('createdBy', 'firstName lastName')
            .populate('assignedUsers', 'firstName lastName email');
        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json(template);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching template', error });
    }
});
exports.getTemplateById = getTemplateById;
// Update template
const updateTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, questions, applicableGrades, applicableDepartments, assignedUsers, status } = req.body;
        // Deduplicate arrays
        const uniqueAssignedUsers = assignedUsers ? [...new Set(assignedUsers)] : undefined; // undefined to skip update if not provided
        const uniqueGrades = applicableGrades ? [...new Set(applicableGrades)] : undefined;
        const uniqueDepartments = applicableDepartments ? [...new Set(applicableDepartments)] : undefined;
        // Validate assigned users if provided
        if (uniqueAssignedUsers && uniqueAssignedUsers.length > 0) {
            const users = yield User_1.default.find({ _id: { $in: uniqueAssignedUsers } });
            if (users.length !== uniqueAssignedUsers.length) {
                return res.status(400).json({ message: 'One or more assigned users not found' });
            }
        }
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, Object.assign(Object.assign(Object.assign(Object.assign({ name,
            description,
            questions }, (uniqueGrades && { applicableGrades: uniqueGrades })), (uniqueDepartments && { applicableDepartments: uniqueDepartments })), (uniqueAssignedUsers && { assignedUsers: uniqueAssignedUsers })), { status }), { new: true }).populate('assignedUsers', 'firstName lastName email');
        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json(template);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating template', error });
    }
});
exports.updateTemplate = updateTemplate;
// Delete template
const deleteTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const template = yield AppraisalTemplate_1.default.findByIdAndDelete(req.params.id);
        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json({ message: 'Template deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting template', error });
    }
});
exports.deleteTemplate = deleteTemplate;
const deleteAllTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield AppraisalTemplate_1.default.deleteMany({});
        res.status(200).json({
            message: 'All templates deleted successfully',
            deletedCount: result.deletedCount
        });
    }
    catch (error) {
        console.error('Error deleting all templates:', error);
        res.status(500).json({ message: 'Error deleting all templates' });
    }
});
exports.deleteAllTemplates = deleteAllTemplates;
// Assign template to users (convenience endpoint)
const assignTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userIds } = req.body;
        if (!userIds || !Array.isArray(userIds)) {
            return res.status(400).json({ message: 'userIds array is required' });
        }
        const uniqueUserIds = [...new Set(userIds)];
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, { assignedUsers: uniqueUserIds }, // Direct assignment to allow replacing/removing
        { new: true }).populate('assignedUsers', 'firstName lastName email');
        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json(template);
    }
    catch (error) {
        res.status(500).json({ message: 'Error assigning template', error });
    }
});
exports.assignTemplate = assignTemplate;
// Approve template (HR Admin only)
const approveTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Approve Template called for ID:', req.params.id);
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
        if (!template) {
            console.log('Template not found');
            return res.status(404).json({ message: 'Template not found' });
        }
        console.log('Template approved:', template.name);
        // Return the template object with an added message field
        const responseObj = Object.assign(Object.assign({}, template.toJSON()), { message: `Template approved successfully. You can now initiate appraisals.` });
        res.json(responseObj);
    }
    catch (error) {
        console.error('Error approving template:', error);
        res.status(500).json({ message: 'Error approving template', error });
    }
});
exports.approveTemplate = approveTemplate;
// Reject template (HR Admin only)
const rejectTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Reject Template called for ID:', req.params.id);
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true });
        if (!template) {
            console.log('Template not found');
            return res.status(404).json({ message: 'Template not found' });
        }
        console.log('Template rejected:', template.name);
        res.json(Object.assign(Object.assign({}, template.toJSON()), { message: 'Template rejected successfully' }));
    }
    catch (error) {
        console.error('Error rejecting template:', error);
        res.status(500).json({ message: 'Error rejecting template', error });
    }
});
exports.rejectTemplate = rejectTemplate;
// Get eligible staff for a template
const getEligibleStaffForTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const template = yield AppraisalTemplate_1.default.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }
        const query = { role: 'employee' }; // Base query
        // If explicit users assigned, they are eligible
        if (template.assignedUsers && template.assignedUsers.length > 0) {
            query._id = { $in: template.assignedUsers };
        }
        else {
            // Otherwise check departments and grades
            const conditions = [];
            if (template.applicableDepartments && template.applicableDepartments.length > 0) {
                conditions.push({ department: { $in: template.applicableDepartments } });
            }
            if (template.applicableGrades && template.applicableGrades.length > 0) {
                conditions.push({ grade: { $in: template.applicableGrades } });
            }
            if (conditions.length > 0) {
                query.$or = conditions;
            }
        }
        const staff = yield User_1.default.find(query).select('firstName lastName email department grade jobTitle');
        res.json(staff);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching eligible staff', error });
    }
});
exports.getEligibleStaffForTemplate = getEligibleStaffForTemplate;
