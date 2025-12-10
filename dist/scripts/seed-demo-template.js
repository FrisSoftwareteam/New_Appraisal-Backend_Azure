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
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
const User_1 = __importDefault(require("../models/User"));
dotenv_1.default.config();
const seedDemoTemplate = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
        yield mongoose_1.default.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        // Find a system admin to be the creator
        const admin = yield User_1.default.findOne({ role: 'super_admin' });
        if (!admin) {
            console.error('No super_admin found to create template');
            process.exit(1);
        }
        const demoTemplate = {
            name: 'Global Demo Template',
            description: 'A general purpose template for demonstration and testing. Visible to all staff.',
            status: 'active',
            applicableDepartments: [], // Empty means all
            applicableGrades: [], // Empty means all
            createdBy: admin._id,
            questions: [
                {
                    id: 'q1',
                    text: 'How would you rate your overall performance this period?',
                    type: 'rating',
                    category: 'Performance',
                    weight: 20,
                    maxScore: 5,
                    isRequired: true,
                    isScored: true
                },
                {
                    id: 'q2',
                    text: 'What were your key achievements?',
                    type: 'text',
                    category: 'Achievements',
                    weight: 0,
                    maxScore: 0,
                    isRequired: true,
                    isScored: false
                },
                {
                    id: 'q3',
                    text: 'Rate your communication skills',
                    type: 'rating',
                    category: 'Skills',
                    weight: 15,
                    maxScore: 5,
                    isRequired: true,
                    isScored: true
                },
                {
                    id: 'q4',
                    text: 'Rate your teamwork and collaboration',
                    type: 'rating',
                    category: 'Skills',
                    weight: 15,
                    maxScore: 5,
                    isRequired: true,
                    isScored: true
                },
                {
                    id: 'q5',
                    text: 'Which of the following best describes your leadership style?',
                    type: 'multiple_choice',
                    category: 'Leadership',
                    weight: 10,
                    maxScore: 5,
                    options: ['Directive', 'Supportive', 'Participative', 'Achievement-oriented'],
                    isRequired: false,
                    isScored: true
                }
            ]
        };
        // Check if it already exists to avoid duplicates
        const existing = yield AppraisalTemplate_1.default.findOne({ name: demoTemplate.name });
        if (existing) {
            console.log('Demo template already exists. Updating...');
            yield AppraisalTemplate_1.default.findByIdAndUpdate(existing._id, demoTemplate);
            console.log('Demo template updated successfully');
        }
        else {
            yield AppraisalTemplate_1.default.create(demoTemplate);
            console.log('Demo template created successfully');
        }
        process.exit(0);
    }
    catch (error) {
        console.error('Error seeding demo template:', error);
        process.exit(1);
    }
});
seedDemoTemplate();
