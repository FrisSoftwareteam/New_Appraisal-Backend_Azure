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
exports.getEligibleStaffForTemplate = exports.approveTemplate = exports.assignTemplate = exports.deleteTemplate = exports.updateTemplate = exports.getTemplateById = exports.getAllTemplates = exports.createTemplate = void 0;
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
const User_1 = __importDefault(require("../models/User"));
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
const AppraisalPeriod_1 = __importDefault(require("../models/AppraisalPeriod"));
const AppraisalFlow_1 = __importDefault(require("../models/AppraisalFlow"));
// Create a new template
const createTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, description, questions, applicableGrades, applicableDepartments, assignedUsers, status } = req.body;
        // Validate assigned users if provided
        if (assignedUsers && assignedUsers.length > 0) {
            const users = yield User_1.default.find({ _id: { $in: assignedUsers } });
            if (users.length !== assignedUsers.length) {
                return res.status(400).json({ message: 'One or more assigned users not found' });
            }
        }
        const template = new AppraisalTemplate_1.default({
            name,
            description,
            questions,
            applicableGrades,
            applicableDepartments,
            assignedUsers,
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
        // Validate assigned users if provided
        if (assignedUsers && assignedUsers.length > 0) {
            const users = yield User_1.default.find({ _id: { $in: assignedUsers } });
            if (users.length !== assignedUsers.length) {
                return res.status(400).json({ message: 'One or more assigned users not found' });
            }
        }
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, {
            name,
            description,
            questions,
            applicableGrades,
            applicableDepartments,
            assignedUsers,
            status,
        }, { new: true }).populate('assignedUsers', 'firstName lastName email');
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
// Assign template to users (convenience endpoint)
const assignTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userIds } = req.body;
        if (!userIds || !Array.isArray(userIds)) {
            return res.status(400).json({ message: 'userIds array is required' });
        }
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, { $addToSet: { assignedUsers: { $each: userIds } } }, { new: true }).populate('assignedUsers', 'firstName lastName email');
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
    var _a, _b, _c;
    try {
        console.log('Approve Template called for ID:', req.params.id);
        const template = yield AppraisalTemplate_1.default.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
        if (!template) {
            console.log('Template not found');
            return res.status(404).json({ message: 'Template not found' });
        }
        console.log('Template approved:', template.name);
        // Auto-create appraisals for eligible staff
        // 1. Get Active Period
        console.log('Finding active period...');
        let period = yield AppraisalPeriod_1.default.findOne({ status: 'active' });
        if (!period) {
            console.log('No active period found, checking for any period...');
            // Fallback: Find any period or create default
            period = yield AppraisalPeriod_1.default.findOne().sort({ createdAt: -1 });
            if (!period) {
                console.log('No periods exist, creating default...');
                period = yield AppraisalPeriod_1.default.create({
                    name: `Period ${new Date().getFullYear()}`,
                    startDate: new Date(),
                    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
                    status: 'active',
                    createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id
                });
            }
        }
        console.log('Using period:', period.name);
        // 2. Get Default Workflow
        console.log('Finding default workflow...');
        let workflow = yield AppraisalFlow_1.default.findOne({ isDefault: true });
        if (!workflow) {
            console.log('No default workflow, checking for any...');
            workflow = yield AppraisalFlow_1.default.findOne();
            if (!workflow) {
                console.log('No workflows exist, creating default...');
                // Create a default workflow if none exists
                workflow = yield AppraisalFlow_1.default.create({
                    name: 'Standard Appraisal Flow',
                    isDefault: true,
                    createdBy: (_b = req.user) === null || _b === void 0 ? void 0 : _b._id,
                    steps: [
                        { name: 'Self Appraisal', rank: 1, assignedRole: 'employee', isRequired: true, dueInDays: 7 },
                        { name: 'Manager Review', rank: 2, assignedRole: 'supervisor', isRequired: true, dueInDays: 7 }
                    ]
                });
            }
        }
        console.log('Using workflow:', workflow.name);
        // 3. Get Eligible Staff (Reuse logic)
        console.log('Finding eligible staff...');
        const query = { role: 'employee' };
        if (template.assignedUsers && template.assignedUsers.length > 0) {
            console.log('Using explicit assigned users:', template.assignedUsers.length);
            query._id = { $in: template.assignedUsers };
        }
        else {
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
            console.log('Using conditions:', JSON.stringify(conditions));
        }
        const staffList = yield User_1.default.find(query);
        console.log(`Found ${staffList.length} eligible staff members`);
        // 4. Create Appraisals
        let createdCount = 0;
        for (const employee of staffList) {
            // Check if exists
            const exists = yield Appraisal_1.default.findOne({
                employee: employee._id,
                template: template._id,
                period: period.name // Using name as period string in Appraisal model
            });
            if (!exists) {
                console.log(`Creating appraisal for ${employee.firstName} ${employee.lastName}`);
                // Resolve step assignments
                const stepAssignments = workflow.steps.map((step) => {
                    let assignedUser = null;
                    if (step.assignedRole === 'employee') {
                        assignedUser = employee._id;
                    }
                    else if (step.assignedRole === 'supervisor') {
                        assignedUser = employee.supervisor;
                    }
                    // Add other role resolutions here (e.g. HOD) if available in User model
                    return {
                        stepId: step._id || step.id, // Ensure we capture the step ID
                        assignedUser: assignedUser,
                        status: 'pending'
                    };
                });
                yield Appraisal_1.default.create({
                    employee: employee._id,
                    template: template._id,
                    workflow: workflow._id,
                    period: period.name,
                    status: 'setup',
                    currentStep: 0,
                    stepAssignments,
                    reviews: [], // Initialize empty reviews
                    history: [{
                            action: 'initiated',
                            actor: (_c = req.user) === null || _c === void 0 ? void 0 : _c._id,
                            timestamp: new Date(),
                            comment: 'Auto-initiated upon template approval'
                        }]
                });
                createdCount++;
            }
            else {
                console.log(`Appraisal already exists for ${employee.firstName} ${employee.lastName}`);
            }
        }
        console.log(`Total appraisals created: ${createdCount}`);
        // Return the template object with an added message field
        // Use toJSON() to ensure populated fields are preserved
        const responseObj = Object.assign(Object.assign({}, template.toJSON()), { message: `Template approved and ${createdCount} appraisals initiated` });
        res.json(responseObj);
    }
    catch (error) {
        console.error('Error approving template:', error);
        res.status(500).json({ message: 'Error approving template', error });
    }
});
exports.approveTemplate = approveTemplate;
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
