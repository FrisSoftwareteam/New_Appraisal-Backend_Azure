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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkUpdateUsers = exports.getUserByEmail = exports.deleteUser = exports.updateUser = exports.getUserById = exports.getUsers = exports.createUser = void 0;
const User_1 = __importDefault(require("../models/User"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const XLSX = __importStar(require("xlsx"));
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const _a = req.body, { password } = _a, userData = __rest(_a, ["password"]);
        let hashedPassword;
        if (password) {
            hashedPassword = yield bcryptjs_1.default.hash(password, 8);
        }
        const user = new User_1.default(Object.assign(Object.assign({}, userData), { password: hashedPassword }));
        yield user.save();
        res.status(201).send(user);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.createUser = createUser;
const getUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield User_1.default.find({});
        res.send(users);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getUsers = getUsers;
const getUserById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield User_1.default.findById(req.params.id);
        if (!user) {
            return res.status(404).send();
        }
        res.send(user);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getUserById = getUserById;
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const updates = Object.keys(req.body);
        const allowedUpdates = [
            "firstName",
            "lastName",
            "email",
            "role",
            "department",
            "division",
            "grade",
            "supervisor",
            "dateEmployed",
            "dateOfLastPromotion",
            "avatar",
        ];
        const isValidOperation = updates.every((update) => allowedUpdates.includes(update));
        if (!isValidOperation) {
            return res.status(400).send({ error: "Invalid updates!" });
        }
        const user = yield User_1.default.findById(req.params.id);
        if (!user) {
            return res.status(404).send();
        }
        updates.forEach((update) => (user[update] = req.body[update]));
        yield user.save();
        res.send(user);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.updateUser = updateUser;
const deleteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield User_1.default.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).send();
        }
        res.send(user);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.deleteUser = deleteUser;
const getUserByEmail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const email = req.params.email.toLowerCase();
        const user = yield User_1.default.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.send(user);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getUserByEmail = getUserByEmail;
// Helper to safely parse Excel dates or strings
const parseExcelDate = (value) => {
    if (!value || value === 'NA' || value === 'N/A')
        return undefined;
    if (typeof value === 'number') {
        return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
    const str = String(value).trim();
    // 1. Try to match regional formats like DD/MM/YYYY or MM/DD/YYYY, ignoring time parts
    // Matches "1/4/2021", "1-4-2021", "01.04.2021", "1/4/2021 12:00:00 AM", etc.
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
            // Default to DMY (Nigeria/Europe)
            day = p1;
            month = p2 - 1;
        }
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime()))
            return d;
    }
    // 2. Fallback to native translation for ISO strings or other formats
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
const bulkUpdateUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).send({ error: "Please upload an Excel file" });
        }
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        console.log(`[BulkUpdate] Workbook sheets: ${workbook.SheetNames.join(', ')}`);
        // Find first sheet that actually has data
        let sheetName = workbook.SheetNames[0];
        let data = [];
        for (const name of workbook.SheetNames) {
            const sheet = workbook.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(sheet);
            if (rows.length > 0) {
                sheetName = name;
                data = rows;
                break;
            }
        }
        console.log(`[BulkUpdate] Using sheet: "${sheetName}" with ${data.length} rows`);
        const results = {
            success: 0,
            failed: 0,
            errors: [],
        };
        const allowedUpdates = [
            "firstName",
            "lastName",
            "department",
            "division",
            "unit",
            "grade",
            "jobTitle",
            "designation",
            "gender",
            "ranking",
            "category",
            "dateConfirmed",
            "dateOfLastPromotion",
            "mdRecommendationPreviousYear",
            "rolesAndResponsibilities",
            "dateEmployed",
            "dateOfBirth",
        ];
        const dateFields = ["dateConfirmed", "dateOfLastPromotion", "dateOfBirth", "dateEmployed"];
        let firstRowLogged = false;
        for (const row of data) {
            const rowKeys = Object.keys(row);
            if (!firstRowLogged) {
                console.log(`[BulkUpdate] Row keys found: ${rowKeys.join(' | ')}`);
                firstRowLogged = true;
            }
            const emailKey = rowKeys.find(k => {
                const nk = k.toLowerCase().replace(/\s/g, '');
                return nk === 'email' || nk === 'emailaddress' || nk === 'e-mail';
            });
            const email = emailKey ? row[emailKey] : null;
            if (!email) {
                results.failed++;
                results.errors.push({ email: "Unknown", reason: "Missing email in row" });
                continue;
            }
            try {
                const user = yield User_1.default.findOne({ email: String(email).toLowerCase().trim() });
                if (!user) {
                    results.failed++;
                    results.errors.push({ email, reason: "User not found" });
                    continue;
                }
                // Map Excel keys to model fields
                const normalizedRow = {};
                const foundHeaders = [];
                const unmatchedKeys = [];
                rowKeys.forEach(key => {
                    const cleanKey = key.toLowerCase().replace(/[^a-z]/g, '');
                    let targetField = '';
                    if (cleanKey === 'firstname' || (cleanKey.includes('first') && cleanKey.includes('name')))
                        targetField = 'firstName';
                    if (cleanKey === 'lastname' || (cleanKey.includes('last') && cleanKey.includes('name') && !cleanKey.includes('promotion')))
                        targetField = 'lastName';
                    if (cleanKey.includes('fullname')) {
                        const val = String(row[key]).trim();
                        const parts = val.split(' ');
                        normalizedRow['firstName'] = parts[0];
                        normalizedRow['lastName'] = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
                        foundHeaders.push(`${key} -> firstName/lastName`);
                        return;
                    }
                    if (cleanKey === 'department')
                        targetField = 'department';
                    if (cleanKey === 'division')
                        targetField = 'division';
                    if (cleanKey === 'unit')
                        targetField = 'unit';
                    if (cleanKey === 'grade')
                        targetField = 'grade';
                    if (cleanKey === 'jobtitle')
                        targetField = 'jobTitle';
                    if (cleanKey === 'designation')
                        targetField = 'designation';
                    if (cleanKey === 'gender')
                        targetField = 'gender';
                    if (cleanKey === 'ranking')
                        targetField = 'ranking';
                    if (cleanKey === 'category')
                        targetField = 'category';
                    if (cleanKey === 'dateconfirmed' || cleanKey.includes('confirmed'))
                        targetField = 'dateConfirmed';
                    if (cleanKey === 'dateoflastpromotion' || (cleanKey.includes('last') && cleanKey.includes('promotion')))
                        targetField = 'dateOfLastPromotion';
                    if (cleanKey === 'dateemployed' || cleanKey.includes('employed') || cleanKey.includes('employment'))
                        targetField = 'dateEmployed';
                    if (cleanKey === 'dateofbirth' || cleanKey === 'dob' || cleanKey.includes('birth'))
                        targetField = 'dateOfBirth';
                    if (cleanKey === 'mdrecommendation' || cleanKey.includes('mdrecommendation'))
                        targetField = 'mdRecommendationPreviousYear';
                    if (cleanKey === 'rolesandresponsibilities' || cleanKey.includes('roles'))
                        targetField = 'rolesAndResponsibilities';
                    if (targetField) {
                        normalizedRow[targetField] = row[key];
                        foundHeaders.push(`${key} -> ${targetField}`);
                    }
                    else {
                        unmatchedKeys.push(key);
                    }
                });
                let hasUpdates = false;
                const updatedFields = [];
                const skipReasons = [];
                allowedUpdates.forEach((field) => {
                    const rawValue = normalizedRow[field];
                    if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
                        if (dateFields.includes(field)) {
                            const parsedDate = parseExcelDate(rawValue);
                            if (parsedDate) {
                                const currentVal = user[field];
                                const existingTime = currentVal ? new Date(currentVal).getTime() : 0;
                                const newTime = parsedDate.getTime();
                                if (Math.abs(existingTime - newTime) > 1000) {
                                    user.set(field, parsedDate);
                                    hasUpdates = true;
                                    updatedFields.push(`${field} (Date: ${parsedDate.toISOString()})`);
                                }
                                else {
                                    skipReasons.push(`${field} (Date already same: ${existingTime})`);
                                }
                            }
                            else {
                                skipReasons.push(`${field} (Date parsing failed for: ${rawValue})`);
                            }
                        }
                        else {
                            const valueToSave = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
                            if (user[field] !== valueToSave) {
                                user.set(field, valueToSave);
                                hasUpdates = true;
                                updatedFields.push(field);
                            }
                            else {
                                skipReasons.push(`${field} (String already same: ${valueToSave})`);
                            }
                        }
                    }
                });
                if (hasUpdates) {
                    console.log(`[BulkUpdate] Pending save for ${email}. Modified: ${user.modifiedPaths().join(', ')}`);
                    yield user.save();
                    console.log(`[BulkUpdate] Successfully saved ${email}. Fields: ${updatedFields.join(', ')}`);
                    results.success++;
                }
                else {
                    console.log(`[BulkUpdate] No changes for ${email}. Matched: ${foundHeaders.join(', ')} | Unmatched: ${unmatchedKeys.join(', ')} | Skips: ${skipReasons.slice(0, 3).join(', ')}...`);
                    results.success++;
                }
            }
            catch (error) {
                results.failed++;
                results.errors.push({ email, reason: error.message || "Update failed" });
            }
        }
        res.send(results);
    }
    catch (error) {
        console.error("Bulk update error:", error);
        res.status(500).send({ error: "Failed to process bulk update" });
    }
});
exports.bulkUpdateUsers = bulkUpdateUsers;
