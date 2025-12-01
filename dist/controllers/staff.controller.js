"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.importStaff = exports.getStaffFilters = exports.excludeFromCycle = exports.deleteStaff = exports.updateStaff = exports.getAllStaff = void 0;
const xlsx = __importStar(require("xlsx"));
const User_1 = __importDefault(require("../models/User"));
// Get all staff with optional filtering
const getAllStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search, department, division, grade } = req.query;
        // Build query object
        const query = {};
        // Search by name or email
        if (search && typeof search === 'string') {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        // Filter by department
        if (department && department !== 'All Departments') {
            query.department = department;
        }
        // Filter by division
        if (division && division !== 'All Divisions') {
            query.division = division;
        }
        // Filter by grade
        if (grade && grade !== 'All Grades') {
            query.grade = grade;
        }
        // Filter by role
        if (req.query.role) {
            query.role = req.query.role;
        }
        const staff = yield User_1.default.find(query).select('-password');
        res.status(200).json(staff);
    }
    catch (error) {
        console.error('Error fetching staff:', error);
        res.status(500).json({ message: 'Error fetching staff' });
    }
});
exports.getAllStaff = getAllStaff;
// Update staff member
const updateStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Remove fields that shouldn't be updated directly
        delete updates._id;
        delete updates.password;
        delete updates.createdAt;
        const updatedStaff = yield User_1.default.findByIdAndUpdate(id, Object.assign(Object.assign({}, updates), { updatedAt: new Date() }), { new: true, runValidators: true }).select('-password');
        if (!updatedStaff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }
        res.status(200).json(updatedStaff);
    }
    catch (error) {
        console.error('Error updating staff:', error);
        res.status(400).json({ message: 'Error updating staff member' });
    }
});
exports.updateStaff = updateStaff;
// Delete staff member
const deleteStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const deletedStaff = yield User_1.default.findByIdAndDelete(id);
        if (!deletedStaff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }
        res.status(200).json({ message: 'Staff member deleted successfully', id });
    }
    catch (error) {
        console.error('Error deleting staff:', error);
        res.status(500).json({ message: 'Error deleting staff member' });
    }
});
exports.deleteStaff = deleteStaff;
// Exclude staff from current appraisal cycle
const excludeFromCycle = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // For now, we'll just verify the user exists
        // In a real implementation, this would update an Appraisal or UserCycle model
        const staff = yield User_1.default.findById(id);
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }
        // TODO: Implement actual exclusion logic when Appraisal cycle model is ready
        // For now, just return success
        res.status(200).json({
            message: `${staff.firstName} ${staff.lastName} excluded from current cycle`,
            staffId: id
        });
    }
    catch (error) {
        console.error('Error excluding staff from cycle:', error);
        res.status(500).json({ message: 'Error excluding staff from cycle' });
    }
});
exports.excludeFromCycle = excludeFromCycle;
// Get unique filter options (departments, divisions, grades)
const getStaffFilters = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const departments = yield User_1.default.distinct('department');
        const divisions = yield User_1.default.distinct('division');
        const grades = yield User_1.default.distinct('grade');
        res.status(200).json({
            departments: departments.filter(Boolean).sort(),
            divisions: divisions.filter(Boolean).sort(),
            grades: grades.filter(Boolean).sort()
        });
    }
    catch (error) {
        console.error('Error fetching staff filters:', error);
        res.status(500).json({ message: 'Error fetching staff filters' });
    }
});
exports.getStaffFilters = getStaffFilters;
const importStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        const results = {
            added: 0,
            updated: 0,
            errors: 0,
        };
        for (const row of data) {
            try {
                // Extract fields from the actual Excel format
                const fullnames = row.fullnames || row.fullname || row.name;
                const email = row.EmailAddress || row.email || row.Email;
                const department = row.Department || row.department;
                const division = row.division || row.Division;
                const grade = row.Grade || row.grade;
                const roleFromExcel = row.role || row.Role || 'employee';
                // Validate required fields
                if (!email || !fullnames || !department) {
                    console.warn(`Skipping row due to missing required fields (email, fullnames, or department)`);
                    results.errors++;
                    continue;
                }
                // Parse fullnames into firstName and lastName
                const nameParts = fullnames.trim().split(' ');
                const firstName = nameParts[0];
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];
                const existingUser = yield User_1.default.findOne({ email });
                if (existingUser) {
                    existingUser.firstName = firstName;
                    existingUser.lastName = lastName;
                    existingUser.department = department;
                    if (division)
                        existingUser.division = division;
                    if (grade)
                        existingUser.grade = grade;
                    existingUser.role = roleFromExcel;
                    existingUser.updatedAt = new Date();
                    yield existingUser.save();
                    results.updated++;
                }
                else {
                    const newUser = new User_1.default({
                        firstName,
                        lastName,
                        email,
                        department,
                        division: division || 'Unassigned',
                        grade: grade || 'Unassigned',
                        role: roleFromExcel,
                        accessLevel: 1, // Default access level
                        isFirstLogin: true,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                    yield newUser.save();
                    results.added++;
                }
            }
            catch (error) {
                console.error('Error processing row:', error);
                results.errors++;
            }
        }
        res.status(200).json({
            message: 'Import completed',
            results,
        });
    }
    catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Internal server error during import' });
    }
});
exports.importStaff = importStaff;
