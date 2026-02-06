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
exports.seedRoles = exports.updateRole = exports.getRoles = void 0;
const Role_1 = __importDefault(require("../models/Role"));
// Get all roles
const getRoles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const roles = yield Role_1.default.find().sort({ accessLevel: -1 });
        res.json(roles);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching roles', error });
    }
});
exports.getRoles = getRoles;
// Update a role
const updateRole = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { permissions } = req.body;
        // Prevent updating critical roles if needed, but for now allow all
        const role = yield Role_1.default.findByIdAndUpdate(req.params.id, { permissions }, { new: true });
        if (!role) {
            return res.status(404).json({ message: 'Role not found' });
        }
        res.json(role);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating role', error });
    }
});
exports.updateRole = updateRole;
// Seed default roles (Internal use)
const seedRoles = () => __awaiter(void 0, void 0, void 0, function* () {
    const defaultRoles = [
        {
            name: "Super Admin",
            slug: "super_admin",
            accessLevel: 10,
            description: "Full system access",
            permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: true, systemSettings: true }
        },
        {
            name: "COO",
            slug: "coo",
            accessLevel: 9,
            description: "Chief Operating Officer access",
            permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: true, systemSettings: false }
        },
        {
            name: "Appraisal Committee",
            slug: "appraisal_committee",
            accessLevel: 8,
            description: "Appraisal committee member access",
            permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: false, systemSettings: false }
        },
        {
            name: "HR Admin",
            slug: "hr_admin",
            accessLevel: 7,
            description: "HR management access",
            permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: true, systemSettings: false }
        },
        {
            name: "Division Head",
            slug: "division_head",
            accessLevel: 6,
            description: "Division level management",
            permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
        },
        {
            name: "Department Head",
            slug: "department_head",
            accessLevel: 5,
            description: "Department level management",
            permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
        },
        {
            name: "HR Officer",
            slug: "hr_officer",
            accessLevel: 4,
            description: "HR operational access",
            permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
        },
        {
            name: "Unit Head",
            slug: "unit_head",
            accessLevel: 3,
            description: "Unit level management",
            permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
        },
        {
            name: "Supervisor",
            slug: "supervisor",
            accessLevel: 2,
            description: "Team supervision",
            permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
        },
        {
            name: "Employee",
            slug: "employee",
            accessLevel: 1,
            description: "Standard employee access",
            permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: false, manageTemplates: false, manageUsers: false, systemSettings: false }
        },
        {
            name: "Guest",
            slug: "guest",
            accessLevel: 0,
            description: "Limited access",
            permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: false, manageTemplates: false, manageUsers: false, systemSettings: false }
        }
    ];
    for (const roleData of defaultRoles) {
        // Only create if it doesn't exist to prevent overwriting custom permissions
        const existing = yield Role_1.default.findOne({ slug: roleData.slug });
        if (!existing) {
            yield Role_1.default.create(roleData);
        }
    }
    console.log('Roles seeded successfully');
});
exports.seedRoles = seedRoles;
