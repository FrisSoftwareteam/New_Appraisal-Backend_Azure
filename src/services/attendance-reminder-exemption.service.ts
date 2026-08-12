import AttendanceReminderExemption, {
  type IAttendanceReminderExemption
} from '../models/AttendanceReminderExemption';

export interface SerializedAttendanceReminderExemption {
  id: string;
  userId: string;
  userName?: string;
  email?: string;
  reason?: string;
  exemptedById: string;
  exemptedByName: string;
  createdAt: string;
  updatedAt: string;
}

export function serializeAttendanceReminderExemption(
  exemption: IAttendanceReminderExemption
): SerializedAttendanceReminderExemption {
  return {
    id: exemption._id.toString(),
    userId: exemption.userId.toString(),
    userName: exemption.userName ?? undefined,
    email: exemption.email ?? undefined,
    reason: exemption.reason ?? undefined,
    exemptedById: exemption.exemptedById.toString(),
    exemptedByName: exemption.exemptedByName,
    createdAt: exemption.createdAt.toISOString(),
    updatedAt: exemption.updatedAt.toISOString()
  };
}

/**
 * User ids that must never receive a check-in reminder. Pass the candidate ids
 * to scope the lookup to the batch the caller is about to filter.
 */
export async function getExemptUserIdSet(userIds?: string[]): Promise<Set<string>> {
  if (userIds && userIds.length === 0) {
    return new Set();
  }

  const filter = userIds ? { userId: { $in: userIds } } : {};
  const rows = await AttendanceReminderExemption.find(filter).select('userId').lean();

  return new Set(rows.map((row) => row.userId.toString()));
}

export async function listAttendanceReminderExemptions(): Promise<
  SerializedAttendanceReminderExemption[]
> {
  const rows = await AttendanceReminderExemption.find().sort({ userName: 1, createdAt: 1 });
  return rows.map(serializeAttendanceReminderExemption);
}
