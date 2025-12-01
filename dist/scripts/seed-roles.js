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
const role_controller_1 = require("../controllers/role.controller");
dotenv_1.default.config();
const runSeed = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
        yield mongoose_1.default.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        yield (0, role_controller_1.seedRoles)();
        console.log('Seeding completed');
        process.exit(0);
    }
    catch (error) {
        console.error('Error seeding roles:', error);
        process.exit(1);
    }
});
runSeed();
