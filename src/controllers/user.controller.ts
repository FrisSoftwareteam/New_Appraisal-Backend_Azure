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
  if (!value) return undefined;
  // If it's a number (Excel serial date)
  if (typeof value === 'number') {
    // Excel base date is 1900-01-01. JS is 1970-01-01.
    // Standard conversion formula: (value - 25569) * 86400 * 1000
    // 25569 is the number of days between 1900-01-01 and 1970-01-01
    return new Date((value - 25569) * 86400 * 1000);
  }
  // If it's a string, try standard Date parsing
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed;
};

export const bulkUpdateUsers = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: "Please upload an Excel file" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

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

    for (const row of data as any[]) {
      const email = row.email || row.Email || row.EmailAddress;

      if (!email) {
        results.failed++;
        results.errors.push({ email: "Unknown", reason: "Missing email in row" });
        continue;
      }

      try {
        const user = await User.findOne({ email: email.toLowerCase().trim() }); // Trim email for safety

        if (!user) {
          results.failed++;
          results.errors.push({ email, reason: "User not found" });
          continue;
        }

        // Pre-process row to handle field synonyms
        // e.g. "Date of Birth" or "DOB" -> "dateOfBirth"
        if (row["Date of Birth"] || row["Date of birth"] || row["DOB"] || row["DateOfBirth"]) {
           row["dateOfBirth"] = row["Date of Birth"] || row["Date of birth"] || row["DOB"] || row["DateOfBirth"];
        }

        if (row["Date Employed"] || row["Date employed"] || row["dateEmployed"] || row["DateEmployed"]) {
           row["dateEmployed"] = row["Date Employed"] || row["Date employed"] || row["dateEmployed"] || row["DateEmployed"];
        }

        if (row["Date of Last Promotion"] || row["Date Of Last Promotion"] || row["Date of last promotion"] || row["DateOfLastPromotion"]) {
           row["dateOfLastPromotion"] = row["Date of Last Promotion"] || row["Date Of Last Promotion"] || row["Date of last promotion"] || row["DateOfLastPromotion"];
        }

        // Handle Date Confirmed
        if (row["Date Confirmed"]) {
           row["dateConfirmed"] = row["Date Confirmed"];
        }

        // Handle Ranking
        if (row["Ranking"]) {
           row["ranking"] = row["Ranking"];
        }

        let hasUpdates = false;

        allowedUpdates.forEach((field) => {
          const rawValue = row[field];
          
          if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
             // Handle dates specifically
             if (dateFields.includes(field)) {
                const parsedDate = parseExcelDate(rawValue);
                if (parsedDate) {
                  (user as any)[field] = parsedDate;
                  hasUpdates = true;
                } else {
                  // Log warning but don't fail entire user? 
                  // For now, we skip invalid date updates to be safe.
                  console.warn(`Invalid date for user ${email}, field ${field}: ${rawValue}`);
                }
             } else {
                // Determine if we should allow partial overwrites?
                // The prompt implies we are UPDATING info.
                // We will trim strings to be safe.
                const valueToSave = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
                
                // Only update if changed
                if ((user as any)[field] !== valueToSave) {
                   (user as any)[field] = valueToSave;
                   hasUpdates = true;
                }
             }
          }
        });

        if (hasUpdates) {
          await user.save();
          results.success++;
        } else {
          // No changes needed is effectively a success
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
