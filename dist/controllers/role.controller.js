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
const role_permissions_1 = require("../constants/role-permissions");
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
        if (!permissions || typeof permissions !== 'object') {
            return res.status(400).json({ message: 'A permissions object is required' });
        }
        // Only accept known permission keys, and set them field-by-field so a partial
        // payload can't wipe the keys it omitted.
        const update = {};
        for (const key of role_permissions_1.PERMISSION_KEYS) {
            if (key in permissions) {
                update[`permissions.${key}`] = Boolean(permissions[key]);
            }
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ message: 'No recognised permission keys provided' });
        }
        const role = yield Role_1.default.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
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
    for (const roleData of role_permissions_1.DEFAULT_ROLES) {
        // Only create if it doesn't exist to prevent overwriting custom permissions.
        // To repair or backfill roles that already exist, run:
        //   npm run migrate:role-permissions
        const existing = yield Role_1.default.findOne({ slug: roleData.slug });
        if (!existing) {
            yield Role_1.default.create(roleData);
        }
    }
    console.log('Roles seeded successfully');
});
exports.seedRoles = seedRoles;
