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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
dotenv_1.default.config();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-appraisal';
const seed = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield mongoose_1.default.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        // Clear existing users
        yield User_1.default.deleteMany({});
        const hashedPassword = yield bcryptjs_1.default.hash('password123', 8);
        const users = [
            {
                email: "admin@company.com",
                password: hashedPassword,
                firstName: "Sarah",
                lastName: "Johnson",
                role: "hr_admin",
                department: "Human Resources",
                division: "Operations",
                grade: "Senior",
                avatar: "/professional-woman-hr.jpg",
            },
            {
                email: "john.doe@company.com",
                password: hashedPassword,
                firstName: "John",
                lastName: "Doe",
                role: "employee",
                department: "Engineering",
                division: "Technology",
                grade: "Mid-Level",
                avatar: "/professional-engineer.png",
            },
            {
                email: "jane.smith@company.com",
                password: hashedPassword,
                firstName: "Jane",
                lastName: "Smith",
                role: "department_head",
                department: "Engineering",
                division: "Technology",
                grade: "Senior",
                avatar: "/professional-woman-manager.png",
            }
        ];
        yield User_1.default.insertMany(users);
        console.log('Database seeded successfully');
        process.exit(0);
    }
    catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
});
seed();
