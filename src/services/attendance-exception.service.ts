import mongoose from 'mongoose';
import AttendanceException, {
  type AttendanceExceptionScope,
  type AttendanceExceptionStatus,
  type AttendanceExceptionType,
  type IAttendanceException
} from '../models/AttendanceException';
import { isValidDateKey } from '../utils/attendance-metrics';

export interface SerializedAttendanceException {
  id: string;
  title: string;
  type: AttendanceExceptionType;
  scope: AttendanceExceptionScope;
  status: AttendanceExceptionStatus;
  startDateKey: string;
  endDateKey: string;
  userId?: string;
  userName?: string;
  notes?: string;
  createdById: string;
  createdByName: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

interface AttendanceExceptionQuery {
  userId?: mongoose.Types.ObjectId | string;
  scope?: AttendanceExceptionScope;
  statuses?: AttendanceExceptionStatus[];
}

export function serializeAttendanceException(
  exception: IAttendanceException
): SerializedAttendanceException {
  return {
    id: exception._id.toString(),
    title: exception.title,
    type: exception.type,
    scope: exception.scope,
    status: exception.status,
    startDateKey: exception.startDateKey,
    endDateKey: exception.endDateKey,
    userId: exception.userId?.toString(),
    userName: exception.userName ?? undefined,
    notes: exception.notes ?? undefined,
    createdById: exception.createdById.toString(),
    createdByName: exception.createdByName,
    reviewedById: exception.reviewedById?.toString(),
    reviewedByName: exception.reviewedByName ?? undefined,
    reviewedAt: exception.reviewedAt?.toISOString(),
    reviewNote: exception.reviewNote ?? undefined,
    createdAt: exception.createdAt.toISOString(),
    updatedAt: exception.updatedAt.toISOString()
  };
}

export async function listAttendanceExceptionsInRange(
  startDateKey: string,
  endDateKey: string,
  query?: AttendanceExceptionQuery
) {
  const filters: Record<string, unknown>[] = [
    {
      startDateKey: { $lte: endDateKey },
      endDateKey: { $gte: startDateKey }
    }
  ];

  if (query?.userId && mongoose.Types.ObjectId.isValid(query.userId.toString())) {
    const normalizedUserId = new mongoose.Types.ObjectId(query.userId.toString());
    if (query.scope === 'individual') {
      filters.push({ scope: 'individual', userId: normalizedUserId });
    } else if (query.scope === 'company') {
      filters.push({ scope: 'company' });
    } else {
      filters.push({
        $or: [
          { scope: 'company' },
          { scope: 'individual', userId: normalizedUserId }
        ]
      });
    }
  } else if (query?.scope) {
    filters.push({ scope: query.scope });
  }

  const statusFilter = buildStatusFilter(query?.statuses);
  if (statusFilter) {
    filters.push(statusFilter);
  }

  return AttendanceException.find({ $and: filters }).sort({
    startDateKey: 1,
    endDateKey: 1,
    scope: 1,
    createdAt: -1
  });
}

export async function getExceptionForUserOnDate(
  userId: mongoose.Types.ObjectId | string,
  dateKey: string
) {
  if (!isValidDateKey(dateKey)) {
    return null;
  }

  const exceptions = await listAttendanceExceptionsInRange(dateKey, dateKey, {
    userId,
    statuses: ['approved']
  });
  if (exceptions.length === 0) {
    return null;
  }

  const picked = pickHighestPriorityException(exceptions);
  return picked ? serializeAttendanceException(picked) : null;
}

export async function getExceptionMapForUsersOnDate(
  userIds: string[],
  dateKey: string
) {
  const map = new Map<string, SerializedAttendanceException>();
  if (!isValidDateKey(dateKey)) {
    return map;
  }

  const normalizedUserIds = Array.from(new Set(userIds.filter((id) => mongoose.Types.ObjectId.isValid(id))));
  const ids = normalizedUserIds.map((id) => new mongoose.Types.ObjectId(id));
  const scopeFilter: Record<string, unknown>[] = [{ scope: 'company' }];
  if (ids.length > 0) {
    scopeFilter.push({ scope: 'individual', userId: { $in: ids } });
  }

  const exceptions = await AttendanceException.find({
    $and: [
      {
        startDateKey: { $lte: dateKey },
        endDateKey: { $gte: dateKey }
      },
      approvedStatusQuery(),
      { $or: scopeFilter }
    ]
  });

  let companyException: IAttendanceException | null = null;
  const individualExceptionByUserId = new Map<string, IAttendanceException>();
  exceptions.forEach((item) => {
    if (item.scope === 'company') {
      if (!companyException || isHigherPriorityException(item, companyException)) {
        companyException = item;
      }
      return;
    }

    const userId = item.userId?.toString();
    if (!userId) {
      return;
    }

    const current = individualExceptionByUserId.get(userId);
    if (!current || isHigherPriorityException(item, current)) {
      individualExceptionByUserId.set(userId, item);
    }
  });

  userIds.forEach((userId) => {
    const resolved = individualExceptionByUserId.get(userId) ?? companyException;
    if (resolved) {
      map.set(userId, serializeAttendanceException(resolved));
    }
  });

  return map;
}

export async function getExcusedWeekdayDateKeysForUserInRange(
  userId: mongoose.Types.ObjectId | string,
  startDateKey: string,
  endDateKey: string
) {
  if (!isValidDateKey(startDateKey) || !isValidDateKey(endDateKey)) {
    return new Set<string>();
  }

  if (startDateKey > endDateKey) {
    return new Set<string>();
  }

  const exceptions = await listAttendanceExceptionsInRange(startDateKey, endDateKey, {
    userId,
    statuses: ['approved']
  });
  const dateKeys = new Set<string>();

  exceptions.forEach((exception) => {
    const start = exception.startDateKey > startDateKey ? exception.startDateKey : startDateKey;
    const end = exception.endDateKey < endDateKey ? exception.endDateKey : endDateKey;

    expandDateKeys(start, end).forEach((dateKey) => {
      if (isWeekdayDateKey(dateKey)) {
        dateKeys.add(dateKey);
      }
    });
  });

  return dateKeys;
}

export function countDateKeysInRange(dateKeys: Set<string>, startDateKey: string, endDateKey: string) {
  let count = 0;
  dateKeys.forEach((key) => {
    if (key >= startDateKey && key <= endDateKey) {
      count += 1;
    }
  });
  return count;
}

function pickHighestPriorityException(exceptions: IAttendanceException[]) {
  if (exceptions.length === 0) {
    return null;
  }

  return [...exceptions].sort(compareExceptionPriority)[0];
}

function getScopePriority(scope: AttendanceExceptionScope) {
  if (scope === 'individual') {
    return 0;
  }
  return 1;
}

function getTypePriority(type: AttendanceExceptionType) {
  switch (type) {
    case 'non_working_day':
      return 0;
    case 'public_holiday':
      return 1;
    case 'annual_leave':
      return 2;
    case 'sick_leave':
      return 3;
    case 'official_assignment':
      return 4;
    default:
      return 5;
  }
}

function compareExceptionPriority(left: IAttendanceException, right: IAttendanceException) {
  const scopeDiff = getScopePriority(left.scope) - getScopePriority(right.scope);
  if (scopeDiff !== 0) {
    return scopeDiff;
  }

  const typeDiff = getTypePriority(left.type) - getTypePriority(right.type);
  if (typeDiff !== 0) {
    return typeDiff;
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
}

function isHigherPriorityException(candidate: IAttendanceException, current: IAttendanceException) {
  return compareExceptionPriority(candidate, current) < 0;
}

function expandDateKeys(startDateKey: string, endDateKey: string) {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  if (!start || !end || start > end) {
    return [] as string[];
  }

  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function parseDateKey(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isWeekdayDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return false;
  }
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function buildStatusFilter(statuses: AttendanceExceptionStatus[] | undefined) {
  if (!statuses || statuses.length === 0) {
    return null;
  }

  if (statuses.includes('approved')) {
    return {
      $or: [
        { status: { $in: statuses } },
        { status: { $exists: false } }
      ]
    };
  }

  return { status: { $in: statuses } };
}

function approvedStatusQuery() {
  return {
    $or: [{ status: 'approved' }, { status: { $exists: false } }]
  };
}
