import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import User from '../models/User';
import LeaveBalance from '../models/LeaveBalance';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getComputedUserBalance,
  getComputedUserBalancesBatch,
  getLiveEntitlementForUser,
  getOrInitLeaveBalanceForYear,
  computeMigratedBalanceSeed,
  MigratedBalanceSeed,
} from '../services/salary.service';
import { createAuditLog } from './audit.controller';

function parseYear(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const getMyLeaveBalance = async (req: AuthRequest, res: Response) => {
  try {
    const year = parseYear(req.query.year);
    const balance = await getComputedUserBalance(req.user!._id, year);
    res.json(balance);
  } catch (error: any) {
    console.error('Error fetching leave balance:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || 'Error fetching leave balance' });
  }
};

export const getUserLeaveBalance = async (req: AuthRequest, res: Response) => {
  try {
    const year = parseYear(req.query.year);
    const balance = await getComputedUserBalance(req.params.userId, year);
    res.json(balance);
  } catch (error: any) {
    console.error('Error fetching leave balance:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || 'Error fetching leave balance' });
  }
};

export const listAllLeaveBalances = async (req: AuthRequest, res: Response) => {
  try {
    const year = parseYear(req.query.year);
    const targetYear = year ?? new Date().getFullYear();

    const staff = await User.find({ role: { $nin: ['guest', 'super_admin'] } })
      .select('firstName lastName email department division grade notch')
      .sort({ lastName: 1, firstName: 1 });

    const balancesByUserId = await getComputedUserBalancesBatch(staff, targetYear);

    const balances = staff.map((u) => {
      const balance = balancesByUserId.get(u._id.toString())!;
      return {
        userId: u._id.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        department: u.department,
        division: u.division,
        ...balance,
        hasTakenLeaveThisYear: balance.daysUsed > 0,
        hasClaimedAllowanceThisYear: balance.allowanceClaimed > 0,
      };
    });

    res.json({ year: targetYear, balances });
  } catch (error: any) {
    console.error('Error listing leave balances:', error);
    res.status(500).json({ message: 'Error listing leave balances' });
  }
};

// One-time migration of the legacy pre-platform leave spreadsheet into LeaveBalance.
// See computeMigratedBalanceSeed for the derivation rules. Always seeds the current
// year only - prior years are assumed already fully settled/claimed.
export const bulkImportLeaveBalances = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel file' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

    let sheetName = workbook.SheetNames[0];
    let data: any[] = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const rows = xlsx.utils.sheet_to_json(sheet);
      if (rows.length > 0) {
        sheetName = name;
        data = rows;
        break;
      }
    }
    console.log(`[BulkImportLeaveBalances] Using sheet: "${sheetName}" with ${data.length} rows`);

    const results = { success: 0, failed: 0, errors: [] as { email: string; reason: string }[] };
    const currentYear = new Date().getFullYear();

    for (const row of data as any[]) {
      const rowKeys = Object.keys(row);
      const findKey = (matcher: (cleanKey: string) => boolean) =>
        rowKeys.find((k) => matcher(k.toLowerCase().replace(/[^a-z]/g, '')));

      const emailKey = findKey((k) => k === 'email' || k === 'emailaddress');
      const email = emailKey ? row[emailKey] : null;

      if (!email) {
        results.failed++;
        results.errors.push({ email: 'Unknown', reason: 'Missing email in row' });
        continue;
      }

      try {
        const user = await User.findOne({ email: String(email).toLowerCase().trim() });
        if (!user) {
          results.failed++;
          results.errors.push({ email, reason: 'User not found' });
          continue;
        }

        const notchKey = findKey((k) => k === 'notch');
        const totalKey = findKey((k) => k.includes('total')); // "Total leave remaining"
        const yearRemainingKey = findKey((k) => k.includes('remaining') && k.includes('year')); // "remaining leave days for the year"

        const notchRaw = notchKey ? row[notchKey] : undefined;
        const notch = parseInt(String(notchRaw), 10);
        if (!Number.isInteger(notch) || notch < 1 || notch > 20) {
          results.failed++;
          results.errors.push({ email, reason: `Invalid or missing notch value: ${notchRaw}` });
          continue;
        }

        const totalRaw = totalKey ? row[totalKey] : undefined;
        const totalLeaveRemaining =
          totalRaw !== undefined && totalRaw !== '' ? parseFloat(String(totalRaw)) : NaN;
        if (!Number.isFinite(totalLeaveRemaining)) {
          results.failed++;
          results.errors.push({ email, reason: 'Missing/invalid "Total leave remaining" value' });
          continue;
        }

        const yearRemainingRaw = yearRemainingKey ? row[yearRemainingKey] : undefined;
        const currentYearRemainingDays =
          yearRemainingRaw !== undefined && yearRemainingRaw !== '' ? parseFloat(String(yearRemainingRaw)) : NaN;
        if (!Number.isFinite(currentYearRemainingDays)) {
          results.failed++;
          results.errors.push({ email, reason: 'Missing/invalid "remaining leave days for the year" value' });
          continue;
        }

        user.notch = notch;
        await user.save();

        const existingBalance = await LeaveBalance.findOne({ userId: user._id, leaveYear: currentYear });
        if (existingBalance && (existingBalance.daysUsed > 0 || existingBalance.allowanceClaimed > 0)) {
          results.success++; // already established - notch updated, balance left alone
          continue;
        }

        const entitlement = await getLiveEntitlementForUser(user);
        if (!entitlement.grade) {
          results.failed++;
          results.errors.push({ email, reason: `No Grade record found for grade "${user.grade}" - cannot derive entitlement` });
          continue;
        }

        if (currentYearRemainingDays > entitlement.entitlementDays) {
          results.failed++;
          results.errors.push({
            email,
            reason: `"remaining leave days for the year" (${currentYearRemainingDays}) exceeds the grade's annual entitlement (${entitlement.entitlementDays})`,
          });
          continue;
        }

        const seed: MigratedBalanceSeed = computeMigratedBalanceSeed(
          entitlement,
          totalLeaveRemaining,
          currentYearRemainingDays
        );

        await LeaveBalance.findOneAndUpdate(
          { userId: user._id, leaveYear: currentYear },
          { $set: seed, $setOnInsert: { allowanceClaimHistory: [] } },
          { upsert: true }
        );

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({ email, reason: error.message || 'Update failed' });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Bulk leave balance import error:', error);
    res.status(500).json({ message: 'Failed to process bulk leave balance import' });
  }
};

interface AdjustLeaveBalanceBody {
  year?: number;
  openingCarryoverDays?: number;
  openingCarryoverAllowance?: number;
  daysUsed?: number;
  allowanceClaimed?: number;
  reason: string;
}

// Manual HR correction of a staff member's leave balance for a given year. Separate
// from bulkImportLeaveBalances, which refuses to touch a balance already in use.
export const adjustLeaveBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const body = req.body as AdjustLeaveBalanceBody;
    const year = body.year ?? new Date().getFullYear();

    if (!body.reason || !body.reason.trim()) {
      return res.status(400).json({ message: 'reason is required for a manual balance adjustment' });
    }

    const fields: (keyof MigratedBalanceSeed)[] = [
      'openingCarryoverDays',
      'openingCarryoverAllowance',
      'daysUsed',
      'allowanceClaimed',
    ];
    const updates = fields.filter((f) => typeof body[f] === 'number' && Number.isFinite(body[f] as number));
    if (updates.length === 0) {
      return res.status(400).json({ message: 'At least one balance field must be provided' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    const balance = await getOrInitLeaveBalanceForYear(userId, year);
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const field of updates) {
      changes[field] = { old: balance[field], new: body[field] };
      (balance as any)[field] = body[field];
    }
    await balance.save();

    await createAuditLog(
      req.user!._id.toString(),
      'update',
      'LeaveBalance',
      `${userId}:${year}`,
      `Manually adjusted ${year} leave balance for ${user.firstName} ${user.lastName}: ${body.reason}`,
      changes
    );

    const updated = await getComputedUserBalance(userId, year);
    res.json(updated);
  } catch (error: any) {
    console.error('Error adjusting leave balance:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || 'Error adjusting leave balance' });
  }
};
