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
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("../models/User"));
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
const AppraisalPeriod_1 = __importDefault(require("../models/AppraisalPeriod"));
const AppraisalFlow_1 = __importDefault(require("../models/AppraisalFlow"));
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
dotenv_1.default.config();
const assignDemoAppraisal = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
        yield mongoose_1.default.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        // 1. Find Debug User
        const debugUserEmail = 'admin@company.com';
        const user = yield User_1.default.findOne({ email: debugUserEmail });
        if (!user) {
            console.error(`Debug user ${debugUserEmail} not found`);
            process.exit(1);
        }
        console.log(`Found debug user: ${user.firstName} ${user.lastName}`);
        // 2. Find Demo Template
        const templateName = 'Global Demo Template';
        const template = yield AppraisalTemplate_1.default.findOne({ name: templateName });
        if (!template) {
            console.error(`Template "${templateName}" not found. Run seed-demo-template.ts first.`);
            process.exit(1);
        }
        console.log(`Found template: ${template.name}`);
        // 3. Find Active Period
        let period = yield AppraisalPeriod_1.default.findOne({ status: 'active' });
        if (!period) {
            console.log('No active period found, creating default...');
            period = yield AppraisalPeriod_1.default.create({
                name: `Period ${new Date().getFullYear()}`,
                startDate: new Date(),
                endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
                status: 'active',
                createdBy: user._id
            });
        }
        console.log(`Using period: ${period.name}`);
        // 4. Find Default Workflow
        let workflow = yield AppraisalFlow_1.default.findOne({ isDefault: true });
        if (!workflow) {
            console.log('No default workflow found, creating default...');
            workflow = yield AppraisalFlow_1.default.create({
                name: 'Standard Appraisal Flow',
                isDefault: true,
                createdBy: user._id,
                steps: [
                    { name: 'Self Appraisal', rank: 1, assignedRole: 'employee', isRequired: true, dueInDays: 7 },
                    { name: 'Manager Review', rank: 2, assignedRole: 'supervisor', isRequired: true, dueInDays: 7 }
                ]
            });
        }
        console.log(`Using workflow: ${workflow.name}`);
        // 5. Create Appraisal
        // Check if exists first
        const existing = yield Appraisal_1.default.findOne({
            employee: user._id,
            template: template._id,
            period: period.name
        });
        if (existing) {
            console.log('Appraisal already exists for this user and template.');
            // Reset status if completed so they can test again
            if (existing.status === 'completed') {
                existing.status = 'in_progress'; // Valid status
                existing.currentStep = 0;
                yield existing.save();
                console.log('Reset existing completed appraisal to active status.');
            }
        }
        else {
            // Resolve step assignments
            const stepAssignments = workflow.steps.map((step) => {
                let assignedUser = null;
                if (step.assignedRole === 'employee') {
                    assignedUser = user._id;
                }
                else if (step.assignedRole === 'supervisor') {
                    // For debug user (admin), they might not have a supervisor. 
                    // Assign to themselves or leave null? 
                    // Let's assign to themselves for testing flow if no supervisor.
                    assignedUser = user.supervisor || user._id;
                }
                return {
                    stepId: step._id || step.id,
                    assignedUser: assignedUser,
                    status: 'pending'
                };
            });
            yield Appraisal_1.default.create({
                employee: user._id,
                template: template._id,
                workflow: workflow._id,
                period: period.name,
                status: 'in_progress', // Valid status
                currentStep: 0,
                stepAssignments,
                reviews: [],
                history: [{
                        action: 'initiated',
                        actor: user._id,
                        timestamp: new Date(),
                        comment: 'Auto-assigned via debug script'
                    }]
            });
            console.log('Appraisal created successfully!');
        }
        process.exit(0);
    }
    catch (error) {
        console.error('Error assigning appraisal:', error);
        process.exit(1);
    }
});
assignDemoAppraisal();
