import mongoose from 'mongoose';
import User, { IUser } from '../models/User';
import Grade, { IGrade } from '../models/Grade';
import LeaveBalance, { ILeaveBalance } from '../models/LeaveBalance';
import SystemSetting from '../models/SystemSetting';
import { ILeaveRequest } from '../models/LeaveRequest';
import { isWeekendDateKey } from './attendance.service';
import { getPublicHolidayDateKeysInRange } from './attendance-exception.service';
import { createTtlCache } from '../utils/ttl-cache';

export const DEFAULT_LEAVE_ALLOWANCE_RATE_PERCENT = 12;
const LEAVE_ALLOWANCE_RATE_KEY = 'leaveAllowanceRatePercent';

// Grades and the leave-allowance rate are small, slow-changing collections that
// were previously re-queried once per staff member on the leave-balances list
// endpoint. Cache them briefly so bulk computations hit the DB once per minute
// instead of once per request (or once per staff member, pre-batching).
const CACHE_TTL_MS = 60_000;
const getCachedGrades = createTtlCache(() => Grade.find(), CACHE_TTL_MS);
const getCachedLeaveAllowanceRate = createTtlCache(async () => {
  const setting = await SystemSetting.findOne({ key: LEAVE_ALLOWANCE_RATE_KEY });
  if (!setting) return DEFAULT_LEAVE_ALLOWANCE_RATE_PERCENT;
  const parsed = parseFloat(setting.value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_LEAVE_ALLOWANCE_RATE_PERCENT;
}, CACHE_TTL_MS);

export interface LiveEntitlement {
  grade: IGrade | null;
  basicSalary: number;
  entitlementDays: number;
  entitlementAllowance: number;
}

export async function getGradeByName(name: string): Promise<IGrade | null> {
  const grades = await getCachedGrades();
  return grades.find((g) => g.name === name) ?? null;
}

/**
 * Notch 1 IS the grade's basic salary. Notch 0 is the probation step - the basic salary
 * reduced by the grade's Notch 1 percentage. From Notch 2 upward each notch compounds its
 * own percentage onto the notch below it, so notchPercentages[0] is never an increase; it
 * exists solely to define the probation reduction.
 */
export function computeBasicSalary(grade: IGrade, notch: number): number {
  if (notch <= 0) {
    const probationPercentage = grade.notchPercentages[0] ?? 0;
    return grade.basicSalary * (1 - probationPercentage / 100);
  }

  let salary = grade.basicSalary;
  for (let n = 2; n <= notch; n++) {
    const percentage = grade.notchPercentages[n - 1] ?? 0;
    salary = salary * (1 + percentage / 100);
  }
  return salary;
}

export async function getLeaveAllowanceRatePercent(): Promise<number> {
  return getCachedLeaveAllowanceRate();
}

export function computeLeaveAllowance(grade: IGrade, notch: number, ratePercent: number): number {
  return computeBasicSalary(grade, notch) * (ratePercent / 100) + grade.holidayAllowance;
}

export interface MigratedBalanceSeed {
  openingCarryoverDays: number;
  openingCarryoverAllowance: number;
  daysUsed: number;
  allowanceClaimed: number;
}

/**
 * One-time migration math for the legacy (pre-platform) leave spreadsheet. `totalLeaveRemaining`
 * is the person's current total day balance (accumulated since 2021, already including whatever
 * part of it belongs to this year's own grant). `currentYearRemainingDays` is specifically how
 * much of THIS year's grade entitlement is still unused - a subset of the total, not a separate
 * pool - so usage this year is inferred by comparing it against `entitlement.entitlementDays`,
 * not against `totalLeaveRemaining`. Every prior year is assumed already fully settled/claimed.
 */
export function computeMigratedBalanceSeed(
  entitlement: LiveEntitlement,
  totalLeaveRemaining: number,
  currentYearRemainingDays: number
): MigratedBalanceSeed {
  const openingCarryoverDays = totalLeaveRemaining - currentYearRemainingDays;
  const openingCarryoverAllowance = 0;
  const daysUsed = Math.max(0, entitlement.entitlementDays - currentYearRemainingDays);
  const allowanceClaimed = daysUsed > 0 ? entitlement.entitlementAllowance : 0;
  return { openingCarryoverDays, openingCarryoverAllowance, daysUsed, allowanceClaimed };
}

/**
 * Always derived from the user's CURRENT grade/notch (never snapshotted), per the
 * "notch changes recalculate immediately" requirement.
 */
export async function getLiveEntitlementForUser(user: IUser): Promise<LiveEntitlement> {
  // Notch 0 (probation) is a real, assignable notch - compare against null explicitly so it
  // isn't mistaken for "no notch set".
  if (!user.grade || user.notch == null) {
    return { grade: null, basicSalary: 0, entitlementDays: 0, entitlementAllowance: 0 };
  }

  const grade = await getGradeByName(user.grade);
  if (!grade) {
    return { grade: null, basicSalary: 0, entitlementDays: 0, entitlementAllowance: 0 };
  }

  const ratePercent = await getLeaveAllowanceRatePercent();
  const basicSalary = computeBasicSalary(grade, user.notch);
  const entitlementAllowance = computeLeaveAllowance(grade, user.notch, ratePercent);

  return { grade, basicSalary, entitlementDays: grade.annualLeaveDays, entitlementAllowance };
}

function yearFromDateKey(dateKey: string): number {
  return parseInt(dateKey.slice(0, 4), 10);
}

/**
 * Chargeable leave days between two date keys (inclusive), excluding weekends
 * and any company-wide approved public holiday. Used both to deduct days at
 * final leave approval and to recompute the actually-chargeable days when an
 * employee returns from leave early.
 */
export async function computeChargeableLeaveDays(startDateKey: string, endDateKey: string): Promise<number> {
  if (startDateKey > endDateKey) {
    return 0;
  }

  const holidayDateKeys = await getPublicHolidayDateKeysInRange(startDateKey, endDateKey);

  const cursor = new Date(`${startDateKey}T00:00:00.000Z`);
  const end = new Date(`${endDateKey}T00:00:00.000Z`);

  let count = 0;
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    if (!isWeekendDateKey(key) && !holidayDateKeys.has(key)) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

/**
 * Finds (or lazily creates) a user's LeaveBalance row for `year`. There is no cron —
 * rows are created on demand, pulling forward whatever the most recent prior year's
 * remaining balance was as opening carryover. If one or more years were skipped
 * entirely (nobody read/approved anything for that user in between), each skipped
 * year is backfilled in sequence so no carryover is silently lost.
 */
export async function getOrInitLeaveBalanceForYear(
  userId: mongoose.Types.ObjectId | string,
  year: number
): Promise<ILeaveBalance> {
  const existing = await LeaveBalance.findOne({ userId, leaveYear: year });
  if (existing) return existing;

  const priorBalance = await LeaveBalance.findOne({ userId, leaveYear: { $lt: year } }).sort({ leaveYear: -1 });

  let openingCarryoverDays = 0;
  let openingCarryoverAllowance = 0;

  if (priorBalance) {
    const user = await User.findById(userId);
    const entitlement = user ? await getLiveEntitlementForUser(user) : null;
    const entitlementDays = entitlement?.entitlementDays ?? 0;
    const entitlementAllowance = entitlement?.entitlementAllowance ?? 0;

    let carryDays = priorBalance.openingCarryoverDays + entitlementDays - priorBalance.daysUsed;
    let carryAllowance = priorBalance.openingCarryoverAllowance + entitlementAllowance - priorBalance.allowanceClaimed;

    // Backfill any fully-skipped years between the last known balance and the target year.
    for (let y = priorBalance.leaveYear + 1; y < year; y++) {
      await LeaveBalance.create({
        userId,
        leaveYear: y,
        openingCarryoverDays: carryDays,
        openingCarryoverAllowance: carryAllowance,
        daysUsed: 0,
        allowanceClaimed: 0,
        allowanceClaimHistory: [],
      });
      carryDays += entitlementDays;
      carryAllowance += entitlementAllowance;
    }

    openingCarryoverDays = carryDays;
    openingCarryoverAllowance = carryAllowance;
  }

  return LeaveBalance.create({
    userId,
    leaveYear: year,
    openingCarryoverDays,
    openingCarryoverAllowance,
    daysUsed: 0,
    allowanceClaimed: 0,
    allowanceClaimHistory: [],
  });
}

export interface ComputedUserBalance {
  leaveYear: number;
  gradeName: string;
  notch: number | null;
  basicSalary: number;
  entitlementDays: number;
  entitlementAllowance: number;
  openingCarryoverDays: number;
  openingCarryoverAllowance: number;
  daysUsed: number;
  allowanceClaimed: number;
  daysRemaining: number;
  allowanceRemaining: number;
}

export async function getComputedUserBalance(
  userId: mongoose.Types.ObjectId | string,
  year?: number
): Promise<ComputedUserBalance> {
  const targetYear = year ?? new Date().getFullYear();

  const user = await User.findById(userId);
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  const balance = await getOrInitLeaveBalanceForYear(userId, targetYear);
  const entitlement = await getLiveEntitlementForUser(user);

  const daysRemaining = balance.openingCarryoverDays + entitlement.entitlementDays - balance.daysUsed;
  const allowanceRemaining =
    balance.openingCarryoverAllowance + entitlement.entitlementAllowance - balance.allowanceClaimed;

  return {
    leaveYear: targetYear,
    gradeName: user.grade,
    notch: user.notch ?? null,
    basicSalary: entitlement.basicSalary,
    entitlementDays: entitlement.entitlementDays,
    entitlementAllowance: entitlement.entitlementAllowance,
    openingCarryoverDays: balance.openingCarryoverDays,
    openingCarryoverAllowance: balance.openingCarryoverAllowance,
    daysUsed: balance.daysUsed,
    allowanceClaimed: balance.allowanceClaimed,
    daysRemaining,
    allowanceRemaining,
  };
}

/**
 * Batched equivalent of calling getComputedUserBalance once per user. Fetches each
 * dependency (LeaveBalance rows, Grade list, allowance rate) once for the whole
 * batch instead of once per user - the per-user loop this replaced was an N+1 that
 * dominated load time for the staff-count-sized "list all balances" endpoint.
 * Users who don't yet have a LeaveBalance row for `year` still go through
 * getOrInitLeaveBalanceForYear individually (a rare, cold-start-only path) so the
 * carryover/backfill logic there is left untouched.
 */
export async function getComputedUserBalancesBatch(
  users: IUser[],
  year?: number
): Promise<Map<string, ComputedUserBalance>> {
  const targetYear = year ?? new Date().getFullYear();
  const userIds = users.map((u) => u._id);

  const [existingBalances, grades, ratePercent] = await Promise.all([
    LeaveBalance.find({ userId: { $in: userIds }, leaveYear: targetYear }),
    getCachedGrades(),
    getCachedLeaveAllowanceRate(),
  ]);

  const balanceByUserId = new Map<string, ILeaveBalance>();
  for (const balance of existingBalances) {
    balanceByUserId.set(balance.userId.toString(), balance);
  }

  const usersMissingBalance = users.filter((u) => !balanceByUserId.has(u._id.toString()));
  if (usersMissingBalance.length > 0) {
    const initialized = await Promise.all(
      usersMissingBalance.map((u) => getOrInitLeaveBalanceForYear(u._id, targetYear))
    );
    usersMissingBalance.forEach((u, i) => {
      balanceByUserId.set(u._id.toString(), initialized[i]);
    });
  }

  const gradeByName = new Map<string, IGrade>();
  for (const grade of grades) {
    gradeByName.set(grade.name, grade);
  }

  const result = new Map<string, ComputedUserBalance>();
  for (const user of users) {
    const balance = balanceByUserId.get(user._id.toString())!;

    // Mirrors getLiveEntitlementForUser's logic, but against the pre-loaded grade map.
    let basicSalary = 0;
    let entitlementDays = 0;
    let entitlementAllowance = 0;
    if (user.grade && user.notch != null) {
      const grade = gradeByName.get(user.grade);
      if (grade) {
        basicSalary = computeBasicSalary(grade, user.notch);
        entitlementDays = grade.annualLeaveDays;
        entitlementAllowance = computeLeaveAllowance(grade, user.notch, ratePercent);
      }
    }

    const daysRemaining = balance.openingCarryoverDays + entitlementDays - balance.daysUsed;
    const allowanceRemaining =
      balance.openingCarryoverAllowance + entitlementAllowance - balance.allowanceClaimed;

    result.set(user._id.toString(), {
      leaveYear: targetYear,
      gradeName: user.grade,
      notch: user.notch ?? null,
      basicSalary,
      entitlementDays,
      entitlementAllowance,
      openingCarryoverDays: balance.openingCarryoverDays,
      openingCarryoverAllowance: balance.openingCarryoverAllowance,
      daysUsed: balance.daysUsed,
      allowanceClaimed: balance.allowanceClaimed,
      daysRemaining,
      allowanceRemaining,
    });
  }

  return result;
}

/**
 * Deducts an approved leave request from the applicant's leave-year balance. Only
 * called from the final-approval step of the leave workflow. Annual Leave days consume
 * the grade-based day entitlement; every leave type's allowance election is applied
 * against the yearly money balance as an all-or-nothing claim of whatever remains.
 */
export async function applyLeaveApprovalToBalance(request: ILeaveRequest): Promise<void> {
  const year = yearFromDateKey(request.startDateKey);
  const balance = await getOrInitLeaveBalanceForYear(request.applicantId, year);
  const user = await User.findById(request.applicantId);
  const entitlement = user ? await getLiveEntitlementForUser(user) : null;
  const entitlementAllowance = entitlement?.entitlementAllowance ?? 0;

  if (request.leaveType === 'annual_leave') {
    balance.daysUsed += await computeChargeableLeaveDays(request.startDateKey, request.endDateKey);
  }

  if (request.leaveAllowance === 'required' || request.leaveAllowance === 'already_claimed') {
    const remaining = balance.openingCarryoverAllowance + entitlementAllowance - balance.allowanceClaimed;
    const amountApplied = remaining > 0 ? remaining : 0;

    balance.allowanceClaimed += amountApplied;
    balance.allowanceClaimHistory.push({
      requestId: request._id as mongoose.Types.ObjectId,
      election: request.leaveAllowance,
      amountApplied,
      actionedAt: new Date(),
    });
  }

  await balance.save();
}

function dateKeyBefore(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Credits back the unused portion of an approved annual leave request when the
 * employee's confirmed return date is earlier than the originally-approved end
 * date. Recomputes the holiday/weekend-aware chargeable days for the shortened
 * period and refunds the difference against the balance already deducted at
 * approval time. Returns the number of days refunded (0 if the employee didn't
 * return early).
 */
export async function refundLeaveDaysForEarlyReturn(
  request: ILeaveRequest,
  actualReturnDateKey: string
): Promise<number> {
  if (actualReturnDateKey >= request.endDateKey) {
    return 0;
  }

  const originalChargeableDays = await computeChargeableLeaveDays(request.startDateKey, request.endDateKey);
  const lastLeaveDayKey = dateKeyBefore(actualReturnDateKey);
  const actualChargeableDays =
    lastLeaveDayKey >= request.startDateKey
      ? await computeChargeableLeaveDays(request.startDateKey, lastLeaveDayKey)
      : 0;

  const refundDays = Math.max(0, originalChargeableDays - actualChargeableDays);
  if (refundDays === 0) {
    return 0;
  }

  const year = yearFromDateKey(request.startDateKey);
  const balance = await getOrInitLeaveBalanceForYear(request.applicantId, year);
  balance.daysUsed = Math.max(0, balance.daysUsed - refundDays);
  await balance.save();

  return refundDays;
}
