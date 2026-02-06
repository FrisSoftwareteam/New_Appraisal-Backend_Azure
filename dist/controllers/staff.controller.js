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
exports.getStaffStats = exports.deleteAllStaff = exports.deletePendingStaff = exports.resolvePendingStaff = exports.getPendingStaff = exports.importStaff = exports.getStaffFilters = exports.excludeFromCycle = exports.deleteStaff = exports.updateStaff = exports.getAllStaff = void 0;
const xlsx = __importStar(require("xlsx"));
const User_1 = __importDefault(require("../models/User"));
const PendingStaff_1 = __importDefault(require("../models/PendingStaff"));
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
const AppraisalPeriod_1 = __importDefault(require("../models/AppraisalPeriod"));
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
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
        const staff = yield User_1.default.find(query).select('-password').lean();
        // Fetch latest appraisals for these staff members
        const staffIds = staff.map(s => s._id);
        const latestAppraisals = yield Appraisal_1.default.find({
            employee: { $in: staffIds }
        }).sort({ createdAt: -1 }).lean();
        // Map appraisals to staff for quick lookup (latest one first per employee)
        const appraisalMap = new Map();
        latestAppraisals.forEach(app => {
            if (!appraisalMap.has(String(app.employee))) {
                appraisalMap.set(String(app.employee), app);
            }
        });
        const staffWithTraining = staff.map((member) => {
            var _a;
            const app = appraisalMap.get(String(member._id));
            let trainingNeededByEmployee = "";
            let trainingRecommendedByAppraiser = "";
            if (app) {
                // Find latest review for "q1766971270364"
                const reviews = app.reviews || [];
                for (let i = reviews.length - 1; i >= 0; i--) {
                    const resp = (reviews[i].responses || []).find((r) => r.questionId === "q1766971270364");
                    if (resp) {
                        trainingNeededByEmployee = String(resp.response);
                        break;
                    }
                }
                // Find latest adminEditedVersion review for "q1766971484543"
                const adminReviews = (((_a = app.adminEditedVersion) === null || _a === void 0 ? void 0 : _a.reviews) || []);
                for (let i = adminReviews.length - 1; i >= 0; i--) {
                    const resp = (adminReviews[i].responses || []).find((r) => r.questionId === "q1766971484543");
                    if (resp) {
                        trainingRecommendedByAppraiser = String(resp.response);
                        break;
                    }
                }
            }
            return Object.assign(Object.assign({}, member), { trainingNeededByEmployee,
                trainingRecommendedByAppraiser });
        });
        res.status(200).json(staffWithTraining);
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
// Helper to safely parse Excel dates or strings
const parseExcelDate = (value) => {
    if (!value || value === 'NA' || value === 'N/A')
        return undefined;
    if (typeof value === 'number') {
        return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
    const str = String(value).trim();
    // 1. Try to match regional formats like DD/MM/YYYY or MM/DD/YYYY, ignoring time parts
    const datePartMatch = str.match(/^(\d+)[/.\-](\d+)[/.\-](\d+)/);
    if (datePartMatch) {
        const p1 = parseInt(datePartMatch[1], 10);
        const p2 = parseInt(datePartMatch[2], 10);
        let year = parseInt(datePartMatch[3], 10);
        if (year < 100)
            year += (year < 50 ? 2000 : 1900);
        let day, month;
        if (p1 > 12) {
            day = p1;
            month = p2 - 1;
        }
        else if (p2 > 12) {
            day = p2;
            month = p1 - 1;
        }
        else {
            // Default to DMY
            day = p1;
            month = p2 - 1;
        }
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime()))
            return d;
    }
    // 2. Fallback to native translation for ISO strings
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
        let year = parsed.getFullYear();
        if (year < 100) {
            parsed.setFullYear(year + (year < 50 ? 2000 : 1900));
        }
        return parsed;
    }
    return undefined;
};
const importStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        console.log(`[ImportStaff] Workbook sheets: ${workbook.SheetNames.join(', ')}`);
        // Find first sheet that actually has data
        let sheetName = workbook.SheetNames[0];
        let data = [];
        for (const name of workbook.SheetNames) {
            const sheet = workbook.Sheets[name];
            const rows = xlsx.utils.sheet_to_json(sheet);
            if (rows.length > 0) {
                sheetName = name;
                data = rows;
                break;
            }
        }
        console.log(`[ImportStaff] Using sheet: "${sheetName}" with ${data.length} rows`);
        const results = {
            added: 0,
            updated: 0,
            pending: 0,
            errors: 0,
        };
        for (const row of data) {
            try {
                // Normalizing headers (aggressive char removal)
                const rowKeys = Object.keys(row);
                const normalizedRow = {};
                const unmatchedKeys = [];
                rowKeys.forEach(key => {
                    const cleanKey = key.toLowerCase().replace(/[^a-z]/g, '');
                    let targetField = '';
                    if (cleanKey === 'fullname' || cleanKey === 'fullnames')
                        targetField = 'fullname';
                    if (cleanKey === 'emailaddress' || cleanKey === 'email' || cleanKey === 'e-mail')
                        targetField = 'email';
                    if (cleanKey === 'department')
                        targetField = 'department';
                    if (cleanKey === 'division')
                        targetField = 'division';
                    if (cleanKey === 'grade')
                        targetField = 'grade';
                    if (cleanKey === 'role')
                        targetField = 'role';
                    if (cleanKey === 'jobtitle')
                        targetField = 'jobTitle';
                    if (cleanKey === 'designation')
                        targetField = 'designation';
                    if (cleanKey === 'gender')
                        targetField = 'gender';
                    if (cleanKey === 'supervisor')
                        targetField = 'supervisor';
                    if (cleanKey === 'rolesandresponsibilities' || cleanKey.includes('roles'))
                        targetField = 'rolesAndResponsibilities';
                    if (cleanKey === 'dateoflastpromotion' || (cleanKey.includes('last') && cleanKey.includes('promotion')))
                        targetField = 'dateOfLastPromotion';
                    if (cleanKey === 'dateemployed' || cleanKey.includes('employed') || cleanKey.includes('employment'))
                        targetField = 'dateEmployed';
                    if (cleanKey === 'dateofbirth' || cleanKey === 'dob' || cleanKey.includes('birth'))
                        targetField = 'dateOfBirth';
                    if (cleanKey === 'dateconfirmed' || cleanKey.includes('confirmed'))
                        targetField = 'dateConfirmed';
                    if (cleanKey.includes('educational'))
                        targetField = 'educationalQualifications';
                    if (cleanKey.includes('professional') || cleanKey.includes('certification') || cleanKey.includes('additionalqualification'))
                        targetField = 'professionalCertifications';
                    if (targetField) {
                        normalizedRow[targetField] = row[key];
                    }
                    else {
                        unmatchedKeys.push(key);
                    }
                });
                // Helper function to parse comma/semicolon-separated lists
                const parseList = (value) => {
                    if (!value)
                        return [];
                    const stringValue = String(value);
                    return stringValue.split(/[;,]/).map(item => item.trim()).filter(Boolean);
                };
                const fullnames = normalizedRow.fullname;
                const email = normalizedRow.email;
                const department = normalizedRow.department;
                const division = normalizedRow.division;
                const grade = normalizedRow.grade;
                const roleFromExcel = normalizedRow.role || 'employee';
                const jobTitle = normalizedRow.jobTitle;
                const designation = normalizedRow.designation;
                const gender = normalizedRow.gender;
                const supervisor = normalizedRow.supervisor;
                const rolesAndResponsibilities = normalizedRow.rolesAndResponsibilities;
                const dateOfLastPromotionRaw = normalizedRow.dateOfLastPromotion;
                const dateEmployedRaw = normalizedRow.dateEmployed;
                const dateOfBirthRaw = normalizedRow.dateOfBirth;
                const dateConfirmedRaw = normalizedRow.dateConfirmed;
                const educationalQualifications = normalizedRow.educationalQualifications ? (Array.isArray(normalizedRow.educationalQualifications) ? normalizedRow.educationalQualifications : parseList(normalizedRow.educationalQualifications)) : [];
                const professionalCertifications = normalizedRow.professionalCertifications ? (Array.isArray(normalizedRow.professionalCertifications) ? normalizedRow.professionalCertifications : parseList(normalizedRow.professionalCertifications)) : [];
                // Check for missing required fields
                const missingFields = [];
                if (!email)
                    missingFields.push('email');
                if (!fullnames)
                    missingFields.push('fullnames');
                if (!department)
                    missingFields.push('department');
                if (missingFields.length > 0) {
                    // Add to PendingStaff
                    const pending = new PendingStaff_1.default({
                        email,
                        firstName: fullnames ? String(fullnames).split(' ')[0] : undefined,
                        lastName: fullnames ? (String(fullnames).split(' ').length > 1 ? String(fullnames).split(' ').slice(1).join(' ') : String(fullnames).split(' ')[0]) : undefined,
                        role: roleFromExcel,
                        department,
                        division,
                        grade,
                        missingFields,
                        originalData: row
                    });
                    yield pending.save();
                    results.pending++;
                    continue;
                }
                // Parse fullnames into firstName and lastName
                const nameParts = String(fullnames).trim().split(' ');
                const firstName = nameParts[0];
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];
                const existingUser = yield User_1.default.findOne({ email: String(email).toLowerCase().trim() });
                if (existingUser) {
                    existingUser.firstName = firstName;
                    existingUser.lastName = lastName;
                    existingUser.department = department;
                    if (division)
                        existingUser.set('division', String(division));
                    if (grade)
                        existingUser.set('grade', String(grade));
                    existingUser.role = roleFromExcel;
                    // Update additional fields if provided
                    if (jobTitle)
                        existingUser.set('jobTitle', String(jobTitle));
                    if (designation)
                        existingUser.set('designation', String(designation));
                    if (gender)
                        existingUser.set('gender', String(gender));
                    if (supervisor)
                        existingUser.set('supervisor', supervisor);
                    if (rolesAndResponsibilities)
                        existingUser.set('rolesAndResponsibilities', String(rolesAndResponsibilities));
                    // Use robust date parsing
                    if (dateOfLastPromotionRaw) {
                        const parsed = parseExcelDate(dateOfLastPromotionRaw);
                        if (parsed) {
                            existingUser.set('dateOfLastPromotion', parsed);
                            console.log(`[ImportStaff] Setting dateOfLastPromotion for ${email} to ${parsed.toISOString()}`);
                        }
                    }
                    if (dateEmployedRaw) {
                        const parsed = parseExcelDate(dateEmployedRaw);
                        if (parsed)
                            existingUser.set('dateEmployed', parsed);
                    }
                    if (dateOfBirthRaw) {
                        const parsed = parseExcelDate(dateOfBirthRaw);
                        if (parsed)
                            existingUser.set('dateOfBirth', parsed);
                    }
                    if (dateConfirmedRaw) {
                        const parsed = parseExcelDate(dateConfirmedRaw);
                        if (parsed)
                            existingUser.set('dateConfirmed', parsed);
                    }
                    if (educationalQualifications.length > 0)
                        existingUser.set('educationalQualifications', educationalQualifications);
                    if (professionalCertifications.length > 0)
                        existingUser.set('professionalCertifications', professionalCertifications);
                    existingUser.updatedAt = new Date();
                    console.log(`[ImportStaff] Pending save for ${email}. Modified: ${existingUser.modifiedPaths()}`);
                    yield existingUser.save();
                    console.log(`[ImportStaff] Successfully saved ${email}`);
                    results.updated++;
                }
                else {
                    const newUser = new User_1.default({
                        firstName,
                        lastName,
                        email: String(email).toLowerCase().trim(),
                        department,
                        division: division || 'Unassigned',
                        grade: grade || 'Unassigned',
                        role: roleFromExcel,
                        accessLevel: 1,
                        isFirstLogin: true,
                        jobTitle: jobTitle ? String(jobTitle) : undefined,
                        designation: designation ? String(designation) : undefined,
                        gender: gender ? String(gender) : undefined,
                        supervisor: supervisor || undefined,
                        rolesAndResponsibilities: rolesAndResponsibilities ? String(rolesAndResponsibilities) : undefined,
                        dateOfLastPromotion: parseExcelDate(dateOfLastPromotionRaw),
                        dateEmployed: parseExcelDate(dateEmployedRaw),
                        dateOfBirth: parseExcelDate(dateOfBirthRaw),
                        dateConfirmed: parseExcelDate(dateConfirmedRaw),
                        educationalQualifications: educationalQualifications.length > 0 ? educationalQualifications : undefined,
                        professionalCertifications: professionalCertifications.length > 0 ? professionalCertifications : undefined,
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
// Get all pending staff
const getPendingStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pending = yield PendingStaff_1.default.find().sort({ createdAt: -1 });
        res.status(200).json(pending);
    }
    catch (error) {
        console.error('Error fetching pending staff:', error);
        res.status(500).json({ message: 'Error fetching pending staff' });
    }
});
exports.getPendingStaff = getPendingStaff;
// Resolve pending staff (move to User)
const resolvePendingStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { firstName, lastName, email, department, division, grade, role } = req.body;
        // Validate required fields again
        if (!firstName || !lastName || !email || !department) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        const pending = yield PendingStaff_1.default.findById(id);
        if (!pending) {
            return res.status(404).json({ message: 'Pending staff record not found' });
        }
        // Check if user with email already exists
        const existingUser = yield User_1.default.findOne({ email });
        if (existingUser) {
            // Update existing user instead of creating new? Or error?
            // Let's update for now as it might be a correction of an existing user import
            existingUser.firstName = firstName;
            existingUser.lastName = lastName;
            existingUser.department = department;
            existingUser.division = division || existingUser.division;
            existingUser.grade = grade || existingUser.grade;
            existingUser.role = role;
            yield existingUser.save();
        }
        else {
            // Create new user
            const newUser = new User_1.default({
                firstName,
                lastName,
                email,
                department,
                division: division || 'Unassigned',
                grade: grade || 'Unassigned',
                role: role || 'employee',
                accessLevel: 1,
                isFirstLogin: true,
            });
            yield newUser.save();
        }
        // Delete from PendingStaff
        yield PendingStaff_1.default.findByIdAndDelete(id);
        res.status(200).json({ message: 'Staff member resolved and added/updated successfully' });
    }
    catch (error) {
        console.error('Error resolving pending staff:', error);
        res.status(500).json({ message: 'Error resolving pending staff' });
    }
});
exports.resolvePendingStaff = resolvePendingStaff;
// Delete pending staff
const deletePendingStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pending = yield PendingStaff_1.default.findByIdAndDelete(req.params.id);
        if (!pending) {
            return res.status(404).json({ message: 'Pending staff record not found' });
        }
        res.status(200).json({ message: 'Pending staff record deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting pending staff:', error);
        res.status(500).json({ message: 'Error deleting pending staff' });
    }
});
exports.deletePendingStaff = deletePendingStaff;
// Delete all staff (except current user)
const deleteAllStaff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        // Find users to delete first to get their IDs
        const usersToDelete = yield User_1.default.find({ _id: { $ne: currentUserId } }).select('_id');
        const userIds = usersToDelete.map(u => u._id);
        if (userIds.length > 0) {
            // Delete associated appraisals
            yield Appraisal_1.default.deleteMany({ employee: { $in: userIds } });
            // Remove from periods and templates
            yield AppraisalPeriod_1.default.updateMany({ assignedEmployees: { $in: userIds } }, { $pull: { assignedEmployees: { $in: userIds } } });
            yield AppraisalTemplate_1.default.updateMany({ assignedUsers: { $in: userIds } }, { $pull: { assignedUsers: { $in: userIds } } });
            // Delete users
            const result = yield User_1.default.deleteMany({ _id: { $in: userIds } });
            // Also clear pending staff
            yield PendingStaff_1.default.deleteMany({});
            res.status(200).json({
                message: 'All staff records and associated appraisals deleted successfully',
                deletedCount: result.deletedCount
            });
        }
        else {
            res.status(200).json({
                message: 'No staff records to delete',
                deletedCount: 0
            });
        }
    }
    catch (error) {
        console.error('Error deleting all staff:', error);
        res.status(500).json({ message: 'Error deleting all staff' });
    }
});
exports.deleteAllStaff = deleteAllStaff;
// Get staff statistics
const getStaffStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const totalEmployees = yield User_1.default.countDocuments({ role: { $nin: ['guest', 'super_admin'] } });
        // Find active period
        const activePeriod = yield AppraisalPeriod_1.default.findOne({ status: 'active' });
        let activeInCycle = 0;
        let pendingAssignment = 0;
        if (activePeriod) {
            // Count employees assigned to the active period
            activeInCycle = activePeriod.assignedEmployees.length;
            pendingAssignment = Math.max(0, totalEmployees - activeInCycle);
        }
        else {
            pendingAssignment = totalEmployees;
        }
        // For now, excluded is 0 as we don't have an explicit 'excluded' status
        const excluded = 0;
        res.json({
            totalEmployees,
            activeInCycle,
            excluded,
            pendingAssignment
        });
    }
    catch (error) {
        console.error('Error fetching staff stats:', error);
        res.status(500).json({ message: 'Error fetching staff stats', error });
    }
});
exports.getStaffStats = getStaffStats;
