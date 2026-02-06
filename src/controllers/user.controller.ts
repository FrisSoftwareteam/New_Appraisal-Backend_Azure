import { Request, Response } from "express";
import User from "../models/User";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";

export const createUser = async (req: Request, res: Response) => {
  try {
    const { password, ...userData } = req.body;

    let hashedPassword;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 8);
    }

    const user = new User({
      ...userData,
      password: hashedPassword,
    });

    await user.save();
    res.status(201).send(user);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find({});
    res.send(users);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send();
    }
    res.send(user);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const updateUser = async (req: Request, res: Response) => {
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
    const isValidOperation = updates.every((update) =>
      allowedUpdates.includes(update)
    );

    if (!isValidOperation) {
      return res.status(400).send({ error: "Invalid updates!" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send();
    }

    updates.forEach((update) => ((user as any)[update] = req.body[update]));
    await user.save();
    res.send(user);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).send();
    }
    res.send(user);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const getUserByEmail = async (req: Request, res: Response) => {
  try {
    const email = req.params.email.toLowerCase();
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.send(user);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Helper to safely parse Excel dates or strings
const parseExcelDate = (value: any): Date | undefined => {
  if (!value || value === 'NA' || value === 'N/A') return undefined;
  
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
    
    if (year < 100) year += (year < 50 ? 2000 : 1900);
    
    let day, month;
    if (p1 > 12) {
      day = p1;
      month = p2 - 1;
    } else if (p2 > 12) {
      day = p2;
      month = p1 - 1;
    } else {
      // Default to DMY (Nigeria/Europe)
      day = p1;
      month = p2 - 1;
    }
    
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
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

export const bulkUpdateUsers = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: "Please upload an Excel file" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    console.log(`[BulkUpdate] Workbook sheets: ${workbook.SheetNames.join(', ')}`);
    
    // Find first sheet that actually has data
    let sheetName = workbook.SheetNames[0];
    let data: any[] = [];
    
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
      errors: [] as { email: string; reason: string }[],
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
    for (const row of data as any[]) {
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
        const user = await User.findOne({ email: String(email).toLowerCase().trim() });

        if (!user) {
          results.failed++;
          results.errors.push({ email, reason: "User not found" });
          continue;
        }

        // Map Excel keys to model fields
        const normalizedRow: any = {};
        const foundHeaders: string[] = [];
        const unmatchedKeys: string[] = [];
        
        rowKeys.forEach(key => {
          const cleanKey = key.toLowerCase().replace(/[^a-z]/g, '');
          
          let targetField = '';
          if (cleanKey === 'firstname' || (cleanKey.includes('first') && cleanKey.includes('name'))) targetField = 'firstName';
          if (cleanKey === 'lastname' || (cleanKey.includes('last') && cleanKey.includes('name') && !cleanKey.includes('promotion'))) targetField = 'lastName';
          if (cleanKey.includes('fullname')) {
             const val = String(row[key]).trim();
             const parts = val.split(' ');
             normalizedRow['firstName'] = parts[0];
             normalizedRow['lastName'] = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
             foundHeaders.push(`${key} -> firstName/lastName`);
             return;
          }
          if (cleanKey === 'department') targetField = 'department';
          if (cleanKey === 'division') targetField = 'division';
          if (cleanKey === 'unit') targetField = 'unit';
          if (cleanKey === 'grade') targetField = 'grade';
          if (cleanKey === 'jobtitle') targetField = 'jobTitle';
          if (cleanKey === 'designation') targetField = 'designation';
          if (cleanKey === 'gender') targetField = 'gender';
          if (cleanKey === 'ranking') targetField = 'ranking';
          if (cleanKey === 'category') targetField = 'category';
          if (cleanKey === 'dateconfirmed' || cleanKey.includes('confirmed')) targetField = 'dateConfirmed';
          if (cleanKey === 'dateoflastpromotion' || (cleanKey.includes('last') && cleanKey.includes('promotion'))) targetField = 'dateOfLastPromotion';
          if (cleanKey === 'dateemployed' || cleanKey.includes('employed') || cleanKey.includes('employment')) targetField = 'dateEmployed';
          if (cleanKey === 'dateofbirth' || cleanKey === 'dob' || cleanKey.includes('birth')) targetField = 'dateOfBirth';
          if (cleanKey === 'mdrecommendation' || cleanKey.includes('mdrecommendation')) targetField = 'mdRecommendationPreviousYear';
          if (cleanKey === 'rolesandresponsibilities' || cleanKey.includes('roles')) targetField = 'rolesAndResponsibilities';

          if (targetField) {
            normalizedRow[targetField] = row[key];
            foundHeaders.push(`${key} -> ${targetField}`);
          } else {
            unmatchedKeys.push(key);
          }
        });

        let hasUpdates = false;
        const updatedFields: string[] = [];
        const skipReasons: string[] = [];

        allowedUpdates.forEach((field) => {
          const rawValue = normalizedRow[field];
          
          if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
             if (dateFields.includes(field)) {
                const parsedDate = parseExcelDate(rawValue);
                if (parsedDate) {
                  const currentVal = (user as any)[field];
                  const existingTime = currentVal ? new Date(currentVal).getTime() : 0;
                  const newTime = parsedDate.getTime();

                  if (Math.abs(existingTime - newTime) > 1000) {
                    user.set(field, parsedDate);
                    hasUpdates = true;
                    updatedFields.push(`${field} (Date: ${parsedDate.toISOString()})`);
                  } else {
                    skipReasons.push(`${field} (Date already same: ${existingTime})`);
                  }
                } else {
                  skipReasons.push(`${field} (Date parsing failed for: ${rawValue})`);
                }
             } else {
                const valueToSave = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
                if ((user as any)[field] !== valueToSave) {
                   user.set(field, valueToSave);
                   hasUpdates = true;
                   updatedFields.push(field);
                } else {
                   skipReasons.push(`${field} (String already same: ${valueToSave})`);
                }
             }
          }
        });

        if (hasUpdates) {
          console.log(`[BulkUpdate] Pending save for ${email}. Modified: ${user.modifiedPaths().join(', ')}`);
          await user.save();
          console.log(`[BulkUpdate] Successfully saved ${email}. Fields: ${updatedFields.join(', ')}`);
          results.success++;
        } else {
          console.log(`[BulkUpdate] No changes for ${email}. Matched: ${foundHeaders.join(', ')} | Unmatched: ${unmatchedKeys.join(', ')} | Skips: ${skipReasons.slice(0, 3).join(', ')}...`);
          results.success++; 
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({ email, reason: error.message || "Update failed" });
      }
    }

    res.send(results);
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).send({ error: "Failed to process bulk update" });
  }
};
