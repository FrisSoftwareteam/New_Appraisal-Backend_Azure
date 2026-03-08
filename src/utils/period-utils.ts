/**
 * Period utilities for appraisal periods.
 * Ensures elapsed periods (endDate < today) are not treated as active.
 */

/**
 * Start of today in UTC (beginning of day).
 * Used to treat endDate inclusively: a period ending "March 8" is active for the full day.
 */
export function getStartOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * MongoDB filter for periods that are "currently active" (timeline has NOT elapsed).
 * - status must be 'active' or 'extended'
 * - endDate must be >= start of today (period includes today or ends in the future)
 *
 * Closed periods are explicitly past; active/extended with endDate < today
 * are treated as elapsed and excluded from "active" queries.
 */
export function getNonElapsedActivePeriodFilter(): Record<string, unknown> {
  const startOfToday = getStartOfTodayUtc();
  return {
    status: { $in: ['active', 'extended'] },
    endDate: { $gte: startOfToday },
  };
}

/**
 * MongoDB filter for "last period" (for score distribution, reports, etc.).
 * Returns the most recent period that is either:
 * - closed, or
 * - active/extended with timeline not yet elapsed (endDate >= today)
 *
 * Excludes active/extended periods whose endDate has passed (elapsed).
 */
export function getLastRelevantPeriodFilter(): Record<string, unknown> {
  const startOfToday = getStartOfTodayUtc();
  return {
    $or: [
      { status: 'closed' },
      {
        status: { $in: ['active', 'extended'] },
        endDate: { $gte: startOfToday },
      },
    ],
  };
}
