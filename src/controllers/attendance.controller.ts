import mongoose from 'mongoose';
import { Response } from 'express';
import User from '../models/User';
import AttendanceRecord, { type AttendanceFlagStatus } from '../models/AttendanceRecord';
import AttendanceException, {
  ATTENDANCE_EXCEPTION_SCOPES,
  ATTENDANCE_EXCEPTION_STATUSES,
  ATTENDANCE_EXCEPTION_TYPES,
  type AttendanceExceptionScope,
  type AttendanceExceptionStatus,
  type AttendanceExceptionType
} from '../models/AttendanceException';
import { AuthRequest } from '../middleware/auth.middleware';
import LeaveRequest from '../models/LeaveRequest';
import {
  getExceptionMapForUsersOnDate,
  serializeAttendanceException
} from '../services/attendance-exception.service';
import {
  getAttendanceCaptureStateForDate,
  getAttendanceCutoffTime,
  getAttendanceInsightsForMonth,
  getAttendanceInsightsForRange,
  getAttendanceTimezone,
  getTodayDateKey,
  serializeAttendanceRecord,
  setAttendanceCaptureEnabled,
  type AttendanceCapturePauseReason,
  setAttendanceCutoffTime
} from '../services/attendance.service';
import {
  isValidDateKey,
  isValidMonthKey,
  parseCutoffTime,
  resolveCheckInStatus
} from '../utils/attendance-metrics';
import {
  isCloudinaryReady,
  uploadImageDataUrlToCloudinary
} from '../config/cloudinary';

interface DailyAttendanceRow {
  id: string;
  userId: string;
  userName: string;
  department?: string;
  dateKey: string;
  attendanceStatus: 'present' | 'absent' | 'excused';
  checkInStatus?: 'on-time' | 'late';
  checkInAt?: string;
  checkOutAt?: string;
  checkedOut: boolean;
  workDurationHours: number | null;
  exceptionType?: AttendanceExceptionType;
  exceptionTitle?: string;
  exceptionScope?: AttendanceExceptionScope;
  locationLabel?: string;
  accuracy?: number;
  photoUrl?: string;
  photoPublicId?: string;
  checkOutPhotoUrl?: string;
  checkOutPhotoPublicId?: string;
  checkOutLocationLabel?: string;
  checkOutLatitude?: number;
  checkOutLongitude?: number;
  checkOutAccuracy?: number;
  flagStatus: AttendanceFlagStatus;
  flagReason?: string;
  flaggedAt?: string;
  flaggedById?: string;
  flaggedByName?: string;
  flagResolutionNote?: string;
  resolvedAt?: string;
  resolvedById?: string;
  resolvedByName?: string;
}

const STAFF_REQUEST_ALLOWED_TYPES: AttendanceExceptionType[] = [
  'annual_leave',
  'sick_leave',
  'official_assignment',
  'other'
];

export const checkIn = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const dateKey = getTodayDateKey();
    const existing = await AttendanceRecord.findOne({
      dateKey,
      userId: req.user._id
    });

    if (existing) {
      return res.status(409).json({ message: 'You already checked in today.' });
    }

    const captureState = await getAttendanceCaptureStateForDate(dateKey, req.user._id);
    if (!captureState.captureAllowed) {
      return res.status(403).json({
        message: getCaptureDisabledMessage(captureState.pauseReason, captureState.pauseException?.title)
      });
    }

    const now = new Date();
    const cutoffTime = await getAttendanceCutoffTime();
    const checkInStatus = resolveCheckInStatus(now, cutoffTime, getAttendanceTimezone());
    const userName = getUserName(req.user.firstName, req.user.lastName, req.user.email);
    const photoUrl =
      typeof req.body?.photoUrl === 'string' ? req.body.photoUrl.trim() : '';
    const photoPublicId =
      typeof req.body?.photoPublicId === 'string' ? req.body.photoPublicId.trim() : undefined;
    const locationLabelInput =
      typeof req.body?.locationLabel === 'string' ? req.body.locationLabel.trim() : '';
    const latitude = toNumber(req.body?.latitude);
    const longitude = toNumber(req.body?.longitude);
    const accuracy = toNumber(req.body?.accuracy);

    if (!photoUrl) {
      return res.status(400).json({ message: 'Photo evidence is required for check-in.' });
    }

    if (latitude === null || longitude === null) {
      return res.status(400).json({ message: 'Location coordinates are required for check-in.' });
    }

    const fallbackLocationLabel = locationLabelInput || formatGpsLabel(latitude, longitude, accuracy);
    const resolvedLocationLabel = (await reverseGeocode(latitude, longitude)) ?? fallbackLocationLabel;

    const record = await AttendanceRecord.create({
      dateKey,
      userId: req.user._id,
      userName,
      department: req.user.department,
      checkInAt: now,
      checkInStatus,
      locationLabel: resolvedLocationLabel,
      latitude,
      longitude,
      accuracy: accuracy ?? undefined,
      photoUrl,
      photoPublicId: photoPublicId || undefined
    });

    return res.status(201).json({
      item: serializeAttendanceRecord(record),
      cutoffTime
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'You already checked in today.' });
    }

    console.error('Error checking in:', error);
    return res.status(500).json({ message: 'Error checking in', error });
  }
};

export const checkOut = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const dateKey = getTodayDateKey();
    const record = await AttendanceRecord.findOne({
      dateKey,
      userId: req.user._id
    });

    if (!record) {
      return res.status(404).json({ message: 'You must check in before checking out.' });
    }

    if (record.checkOutAt) {
      return res.status(409).json({ message: 'You already checked out today.' });
    }

    const photoUrl =
      typeof req.body?.photoUrl === 'string' ? req.body.photoUrl.trim() : '';
    const photoPublicId =
      typeof req.body?.photoPublicId === 'string' ? req.body.photoPublicId.trim() : undefined;
    const checkOutLocationLabel =
      typeof req.body?.locationLabel === 'string' ? req.body.locationLabel.trim() : undefined;
    const checkOutLatitude =
      typeof req.body?.latitude === 'number' ? req.body.latitude : undefined;
    const checkOutLongitude =
      typeof req.body?.longitude === 'number' ? req.body.longitude : undefined;
    const checkOutAccuracy =
      typeof req.body?.accuracy === 'number' ? req.body.accuracy : undefined;

    if (!photoUrl) {
      return res.status(400).json({ message: 'Photo evidence is required for check-out.' });
    }

    record.checkOutAt = new Date();
    record.checkOutPhotoUrl = photoUrl;
    record.checkOutPhotoPublicId = photoPublicId || undefined;
    if (checkOutLocationLabel) record.checkOutLocationLabel = checkOutLocationLabel;
    if (checkOutLatitude !== undefined) record.checkOutLatitude = checkOutLatitude;
    if (checkOutLongitude !== undefined) record.checkOutLongitude = checkOutLongitude;
    if (checkOutAccuracy !== undefined) record.checkOutAccuracy = checkOutAccuracy;
    await record.save();

    return res.json({
      item: serializeAttendanceRecord(record)
    });
  } catch (error) {
    console.error('Error checking out:', error);
    return res.status(500).json({ message: 'Error checking out', error });
  }
};

export const deleteAttendanceEntry = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid attendance record id.' });
    }

    const record = await AttendanceRecord.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const isAttendanceAdmin = ['hr_admin', 'super_admin'].includes(req.user.role);

    if (!isAttendanceAdmin) {
      return res
        .status(403)
        .json({ message: 'Attendance entries can only be deleted by HR Admin or Super Admin.' });
    }

    await record.deleteOne();
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting attendance entry:', error);
    return res.status(500).json({ message: 'Error deleting attendance entry', error });
  }
};

export const updateAttendanceEntryFlagForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid attendance record id.' });
    }

    const action = parseAttendanceFlagAction(req.body?.action);
    if (!action) {
      return res.status(400).json({ message: 'action must be either flag or unflag.' });
    }

    const record = await AttendanceRecord.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const actorName = getUserName(req.user!.firstName, req.user!.lastName, req.user!.email);

    if (action === 'flag') {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason) {
        return res.status(400).json({ message: 'reason is required when flagging attendance.' });
      }

      record.flagStatus = 'flagged';
      record.flagReason = reason;
      record.flaggedAt = new Date();
      record.flaggedById = req.user!._id;
      record.flaggedByName = actorName;
      record.flagResolutionNote = undefined;
      record.resolvedAt = undefined;
      record.resolvedById = undefined;
      record.resolvedByName = undefined;
    } else {
      if (record.flagStatus !== 'flagged') {
        return res.status(409).json({ message: 'Attendance entry is not currently flagged.' });
      }

      const resolutionNote =
        typeof req.body?.resolutionNote === 'string' ? req.body.resolutionNote.trim() : '';

      record.flagStatus = 'resolved';
      record.flagResolutionNote = resolutionNote || undefined;
      record.resolvedAt = new Date();
      record.resolvedById = req.user!._id;
      record.resolvedByName = actorName;
    }

    await record.save();

    return res.json({
      item: serializeAttendanceRecord(record)
    });
  } catch (error) {
    console.error('Error updating attendance entry flag:', error);
    return res.status(500).json({ message: 'Error updating attendance entry flag', error });
  }
};

export const getMyTodayAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const dateKey = getTodayDateKey();
    const [record, cutoffTime, captureState] = await Promise.all([
      AttendanceRecord.findOne({ dateKey, userId: req.user._id }),
      getAttendanceCutoffTime(),
      getAttendanceCaptureStateForDate(dateKey, req.user._id)
    ]);

    return res.json({
      date: dateKey,
      cutoffTime,
      item: record ? serializeAttendanceRecord(record) : null,
      canCheckIn: !record && captureState.captureAllowed,
      canCheckOut: Boolean(record && !record.checkOutAt),
      captureEnabled: captureState.captureEnabled,
      captureForcePaused: captureState.captureForcePaused,
      weekendsAutoPaused: captureState.weekendsAutoPaused,
      captureAllowedToday: captureState.captureAllowed,
      capturePauseReason: captureState.pauseReason,
      capturePauseException: captureState.pauseException
    });
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    return res.status(500).json({ message: 'Error fetching today attendance', error });
  }
};

export const getMyMonthlyAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const monthKey = typeof req.query.month === 'string' ? req.query.month : currentMonthKey();
    if (!isValidMonthKey(monthKey)) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    const insights = await getAttendanceInsightsForMonth(req.user._id, monthKey);
    if (!insights) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    return res.json({
      month: monthKey,
      ...insights
    });
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    return res.status(500).json({ message: 'Error fetching monthly attendance', error });
  }
};

export const getDailyAttendanceForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const requestedDate =
      typeof req.query.date === 'string' ? req.query.date.trim() : getTodayDateKey();
    if (!isValidDateKey(requestedDate)) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const [records, staffUsers, cutoffTime] = await Promise.all([
      AttendanceRecord.find({ dateKey: requestedDate })
        .select(
          '_id userId userName department dateKey checkInAt checkOutAt checkInStatus locationLabel accuracy photoUrl photoPublicId checkOutPhotoUrl checkOutPhotoPublicId flagStatus flagReason flaggedAt flaggedById flaggedByName flagResolutionNote resolvedAt resolvedById resolvedByName'
        )
        .sort({ checkInAt: 1 }),
      User.find({ role: { $ne: 'guest' } })
        .select('_id firstName lastName department')
        .sort({ firstName: 1, lastName: 1 })
        .lean(),
      getAttendanceCutoffTime()
    ]);

    const recordsByUserId = new Map(records.map((record) => [record.userId.toString(), record]));
    const exceptionMap = await getExceptionMapForUsersOnDate(
      staffUsers.map((user) => user._id.toString()),
      requestedDate
    );

    const allRows: DailyAttendanceRow[] = staffUsers.map((staffUser) => {
      const userId = staffUser._id.toString();
      const employeeName = getUserName(staffUser.firstName, staffUser.lastName);
      const record = recordsByUserId.get(userId);
      const exception = exceptionMap.get(userId);

      if (!record) {
        if (exception) {
          return {
            id: `excused-${userId}-${requestedDate}`,
            userId,
            userName: employeeName,
            department: staffUser.department ?? undefined,
            dateKey: requestedDate,
            attendanceStatus: 'excused',
            checkedOut: false,
            workDurationHours: null,
            exceptionType: exception.type,
            exceptionTitle: exception.title,
            exceptionScope: exception.scope,
            locationLabel: '--',
            accuracy: undefined,
            photoUrl: undefined,
            photoPublicId: undefined,
            checkOutPhotoUrl: undefined,
            checkOutPhotoPublicId: undefined,
            flagStatus: 'clear'
          };
        }

        return {
          id: `absent-${userId}`,
          userId,
          userName: employeeName,
          department: staffUser.department ?? undefined,
          dateKey: requestedDate,
          attendanceStatus: 'absent',
          checkedOut: false,
          workDurationHours: null,
          locationLabel: '--',
          accuracy: undefined,
          photoUrl: undefined,
          photoPublicId: undefined,
          checkOutPhotoUrl: undefined,
          checkOutPhotoPublicId: undefined,
          flagStatus: 'clear'
        };
      }

      const serialized = serializeAttendanceRecord(record);
      return {
        id: serialized.id,
        userId,
        userName: serialized.userName,
        department: serialized.department,
        dateKey: serialized.dateKey,
        attendanceStatus: 'present',
        checkInStatus: serialized.checkInStatus,
        checkInAt: serialized.checkInAt,
        checkOutAt: serialized.checkOutAt,
        checkedOut: Boolean(serialized.checkOutAt),
        workDurationHours: serialized.workDurationHours,
        exceptionType: exception?.type,
        exceptionTitle: exception?.title,
        exceptionScope: exception?.scope,
        locationLabel: serialized.locationLabel,
        accuracy: serialized.accuracy,
        photoUrl: serialized.photoUrl,
        photoPublicId: serialized.photoPublicId,
        checkOutPhotoUrl: serialized.checkOutPhotoUrl,
        checkOutPhotoPublicId: serialized.checkOutPhotoPublicId,
        checkOutLocationLabel: serialized.checkOutLocationLabel,
        checkOutLatitude: serialized.checkOutLatitude,
        checkOutLongitude: serialized.checkOutLongitude,
        checkOutAccuracy: serialized.checkOutAccuracy,
        flagStatus: serialized.flagStatus,
        flagReason: serialized.flagReason,
        flaggedAt: serialized.flaggedAt,
        flaggedById: serialized.flaggedById,
        flaggedByName: serialized.flaggedByName,
        flagResolutionNote: serialized.flagResolutionNote,
        resolvedAt: serialized.resolvedAt,
        resolvedById: serialized.resolvedById,
        resolvedByName: serialized.resolvedByName
      };
    });

    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
    const filteredRows = allRows.filter((row) => {
      if (search) {
        const searchableText = `${row.userName} ${row.department ?? ''}`.toLowerCase();
        if (!searchableText.includes(search)) {
          return false;
        }
      }

      switch (status) {
        case 'present':
          return row.attendanceStatus === 'present';
        case 'absent':
          return row.attendanceStatus === 'absent';
        case 'excused':
          return row.attendanceStatus === 'excused';
        case 'on-time':
          return row.checkInStatus === 'on-time';
        case 'late':
          return row.checkInStatus === 'late';
        case 'checked-out':
          return row.attendanceStatus === 'present' && row.checkedOut;
        default:
          return true;
      }
    });

    const summary = allRows.reduce(
      (acc, row) => {
        acc.totalEmployees += 1;
        if (row.attendanceStatus === 'present') {
          acc.present += 1;
          if (row.checkInStatus === 'on-time') {
            acc.onTime += 1;
          } else if (row.checkInStatus === 'late') {
            acc.late += 1;
          }
          if (row.checkedOut) {
            acc.checkedOut += 1;
          }
        } else if (row.attendanceStatus === 'excused') {
          acc.excused += 1;
        } else if (row.attendanceStatus === 'absent') {
          acc.absent += 1;
        }
        return acc;
      },
      {
        totalEmployees: 0,
        present: 0,
        absent: 0,
        excused: 0,
        onTime: 0,
        late: 0,
        checkedOut: 0
      }
    );

    return res.json({
      date: requestedDate,
      cutoffTime,
      summary,
      totalRows: allRows.length,
      filteredRows: filteredRows.length,
      rows: filteredRows
    });
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    return res.status(500).json({ message: 'Error fetching daily attendance', error });
  }
};

export const getAdminUserMonthlyAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const { userId } = req.params;
    const monthKey = typeof req.query.month === 'string' ? req.query.month : currentMonthKey();
    if (!isValidMonthKey(monthKey)) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    const user = await User.findById(userId).select('_id firstName lastName email department role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const insights = await getAttendanceInsightsForMonth(userId, monthKey);
    if (!insights) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    return res.json({
      user: {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: user.department,
        role: user.role
      },
      month: monthKey,
      ...insights
    });
  } catch (error) {
    console.error('Error fetching user monthly attendance:', error);
    return res.status(500).json({ message: 'Error fetching user monthly attendance', error });
  }
};

export const getAdminUserPeriodAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const { userId } = req.params;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : '';

    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      return res.status(400).json({ message: 'Invalid date range. Use YYYY-MM-DD.' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ message: 'startDate must be on or before endDate.' });
    }

    const user = await User.findById(userId).select('_id firstName lastName email department role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const insights = await getAttendanceInsightsForRange(userId, startDate, endDate);
    return res.json({
      user: {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: user.department,
        role: user.role
      },
      ...insights
    });
  } catch (error) {
    console.error('Error fetching user period attendance:', error);
    return res.status(500).json({ message: 'Error fetching user period attendance', error });
  }
};

export const getAttendanceSettingsForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const dateKey = getTodayDateKey();
    const [cutoffTime, captureState] = await Promise.all([
      getAttendanceCutoffTime(),
      getAttendanceCaptureStateForDate(dateKey)
    ]);

    return res.json({
      cutoffTime,
      captureEnabled: captureState.captureEnabled,
      captureForcePaused: captureState.captureForcePaused,
      weekendsAutoPaused: captureState.weekendsAutoPaused
    });
  } catch (error) {
    console.error('Error fetching attendance settings:', error);
    return res.status(500).json({ message: 'Error fetching attendance settings', error });
  }
};

export const getAttendanceCaptureControlForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const captureState = await getAttendanceCaptureStateForDate(getTodayDateKey());
    return res.json({
      captureEnabled: captureState.captureEnabled,
      captureForcePaused: captureState.captureForcePaused,
      weekendsAutoPaused: captureState.weekendsAutoPaused
    });
  } catch (error) {
    console.error('Error fetching attendance capture control:', error);
    return res.status(500).json({ message: 'Error fetching attendance capture control', error });
  }
};

export const uploadAttendancePhoto = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    if (!dataUrl) {
      return res.status(400).json({ message: 'Missing dataUrl.' });
    }

    if (!dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Invalid image format.' });
    }

    // 2MB base64 guard to keep uploads lightweight before forwarding to Cloudinary.
    if (dataUrl.length > 2_800_000) {
      return res.status(413).json({ message: 'Image is too large. Please retake with lower quality.' });
    }

    if (!isCloudinaryReady()) {
      return res.status(503).json({
        message:
          'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.'
      });
    }

    const upload = await uploadImageDataUrlToCloudinary(dataUrl);

    return res.status(201).json({
      url: upload.url,
      publicId: upload.publicId,
      width: upload.width,
      height: upload.height
    });
  } catch (error) {
    console.error('Error uploading attendance photo:', error);
    return res.status(500).json({ message: 'Error uploading attendance photo', error });
  }
};

export const getNetworkLocationByIp = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const location = await resolveNetworkLocation();
    if (!location) {
      return res.status(502).json({ message: 'Unable to fetch network location.' });
    }

    return res.json(location);
  } catch (error) {
    console.error('Error resolving network location:', error);
    return res.status(500).json({ message: 'Error resolving network location', error });
  }
};

export const updateAttendanceSettingsForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const cutoffTime = typeof req.body?.cutoffTime === 'string' ? req.body.cutoffTime.trim() : '';
    if (!parseCutoffTime(cutoffTime)) {
      return res.status(400).json({ message: 'cutoffTime must be in HH:mm format.' });
    }

    const updatedCutoff = await setAttendanceCutoffTime(cutoffTime);
    const captureState = await getAttendanceCaptureStateForDate(getTodayDateKey());

    return res.json({
      cutoffTime: updatedCutoff,
      captureEnabled: captureState.captureEnabled,
      captureForcePaused: captureState.captureForcePaused,
      weekendsAutoPaused: captureState.weekendsAutoPaused
    });
  } catch (error) {
    console.error('Error updating attendance settings:', error);
    return res.status(500).json({ message: 'Error updating attendance settings', error });
  }
};

export const updateAttendanceCaptureControlForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const captureEnabled = req.body?.captureEnabled;
    if (typeof captureEnabled !== 'boolean') {
      return res.status(400).json({ message: 'captureEnabled must be a boolean.' });
    }

    await setAttendanceCaptureEnabled(captureEnabled);
    const captureState = await getAttendanceCaptureStateForDate(getTodayDateKey());

    return res.json({
      captureEnabled: captureState.captureEnabled,
      captureForcePaused: captureState.captureForcePaused,
      weekendsAutoPaused: captureState.weekendsAutoPaused
    });
  } catch (error) {
    console.error('Error updating attendance capture control:', error);
    return res.status(500).json({ message: 'Error updating attendance capture control', error });
  }
};

export const getAttendanceExceptionsForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const defaultStartDate = `${currentMonthKey()}-01`;
    const requestedStartDate =
      typeof req.query.startDate === 'string' ? req.query.startDate.trim() : defaultStartDate;
    const requestedEndDate =
      typeof req.query.endDate === 'string' ? req.query.endDate.trim() : getTodayDateKey();
    const requestedScope =
      typeof req.query.scope === 'string' ? req.query.scope.trim() : undefined;
    const requestedUserId =
      typeof req.query.userId === 'string' ? req.query.userId.trim() : undefined;
    const requestedStatus =
      typeof req.query.status === 'string' ? req.query.status.trim() : 'approved';

    if (!isValidDateKey(requestedStartDate) || !isValidDateKey(requestedEndDate)) {
      return res.status(400).json({ message: 'Invalid date range. Use YYYY-MM-DD.' });
    }

    if (requestedStartDate > requestedEndDate) {
      return res.status(400).json({ message: 'startDate must be on or before endDate.' });
    }

    const scope = parseExceptionScope(requestedScope);
    if (requestedScope && !scope) {
      return res
        .status(400)
        .json({ message: `scope must be one of: ${ATTENDANCE_EXCEPTION_SCOPES.join(', ')}.` });
    }
    const status = parseExceptionStatus(requestedStatus);
    if (requestedStatus && !status) {
      return res
        .status(400)
        .json({ message: `status must be one of: ${ATTENDANCE_EXCEPTION_STATUSES.join(', ')}.` });
    }

    const query: Record<string, unknown> = {
      startDateKey: { $lte: requestedEndDate },
      endDateKey: { $gte: requestedStartDate }
    };

    if (scope) {
      query.scope = scope;
    }
    if (status === 'approved') {
      const statusOr = [{ status: 'approved' }, { status: { $exists: false } }];
      if (query.$or) {
        query.$and = [{ $or: query.$or as Record<string, unknown>[] }, { $or: statusOr }];
        delete query.$or;
      } else {
        query.$or = statusOr;
      }
    } else if (status) {
      query.status = status;
    }

    if (requestedUserId) {
      if (!mongoose.Types.ObjectId.isValid(requestedUserId)) {
        return res.status(400).json({ message: 'Invalid userId.' });
      }

      const normalizedUserId = new mongoose.Types.ObjectId(requestedUserId);
      if (scope === 'individual') {
        query.userId = normalizedUserId;
      } else {
        query.$or = [{ scope: 'company' }, { scope: 'individual', userId: normalizedUserId }];
      }
    }

    const items = await AttendanceException.find(query).sort({
      status: 1,
      startDateKey: 1,
      endDateKey: 1,
      scope: 1,
      createdAt: -1
    });

    return res.json({
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      totalRows: items.length,
      items: items.map(serializeAttendanceException)
    });
  } catch (error) {
    console.error('Error fetching attendance exceptions:', error);
    return res.status(500).json({ message: 'Error fetching attendance exceptions', error });
  }
};

export const createAttendanceExceptionForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const type = parseExceptionType(req.body?.type);
    const scope = parseExceptionScope(req.body?.scope);
    const startDateKey =
      typeof req.body?.startDateKey === 'string' ? req.body.startDateKey.trim() : '';
    const endDateKey = typeof req.body?.endDateKey === 'string' ? req.body.endDateKey.trim() : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';

    if (!title) {
      return res.status(400).json({ message: 'title is required.' });
    }

    if (!type) {
      return res
        .status(400)
        .json({ message: `type must be one of: ${ATTENDANCE_EXCEPTION_TYPES.join(', ')}.` });
    }

    if (!scope) {
      return res
        .status(400)
        .json({ message: `scope must be one of: ${ATTENDANCE_EXCEPTION_SCOPES.join(', ')}.` });
    }

    if (!isValidDateKey(startDateKey) || !isValidDateKey(endDateKey)) {
      return res.status(400).json({ message: 'startDateKey and endDateKey must be YYYY-MM-DD.' });
    }

    if (startDateKey > endDateKey) {
      return res.status(400).json({ message: 'startDateKey must be on or before endDateKey.' });
    }

    let targetUserId: mongoose.Types.ObjectId | undefined;
    let targetUserName: string | undefined;
    if (scope === 'individual') {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'A valid userId is required for individual scope.' });
      }

      const user = await User.findById(userId).select('_id firstName lastName email');
      if (!user) {
        return res.status(404).json({ message: 'Target user not found.' });
      }

      targetUserId = user._id as mongoose.Types.ObjectId;
      targetUserName = getUserName(user.firstName, user.lastName, user.email);
    }

    const item = await AttendanceException.create({
      title,
      type,
      scope,
      status: 'approved',
      startDateKey,
      endDateKey,
      userId: targetUserId,
      userName: targetUserName,
      notes: notes || undefined,
      createdById: req.user!._id,
      createdByName: getUserName(req.user!.firstName, req.user!.lastName, req.user!.email),
      reviewedById: req.user!._id,
      reviewedByName: getUserName(req.user!.firstName, req.user!.lastName, req.user!.email),
      reviewedAt: new Date(),
      reviewNote: 'Created by HR Admin'
    });

    return res.status(201).json({
      item: serializeAttendanceException(item)
    });
  } catch (error) {
    console.error('Error creating attendance exception:', error);
    return res.status(500).json({ message: 'Error creating attendance exception', error });
  }
};

export const updateAttendanceExceptionForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid attendance exception id.' });
    }

    const item = await AttendanceException.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Attendance exception not found.' });
    }

    const nextTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : item.title;
    const nextType = req.body?.type ? parseExceptionType(req.body.type) : item.type;
    const nextScope = req.body?.scope ? parseExceptionScope(req.body.scope) : item.scope;
    const nextStartDateKey =
      typeof req.body?.startDateKey === 'string' ? req.body.startDateKey.trim() : item.startDateKey;
    const nextEndDateKey =
      typeof req.body?.endDateKey === 'string' ? req.body.endDateKey.trim() : item.endDateKey;
    const hasNotes = typeof req.body?.notes === 'string';
    const nextNotes = hasNotes ? req.body.notes.trim() : item.notes;
    const requestedUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';

    if (!nextTitle) {
      return res.status(400).json({ message: 'title is required.' });
    }

    if (!nextType) {
      return res
        .status(400)
        .json({ message: `type must be one of: ${ATTENDANCE_EXCEPTION_TYPES.join(', ')}.` });
    }

    if (!nextScope) {
      return res
        .status(400)
        .json({ message: `scope must be one of: ${ATTENDANCE_EXCEPTION_SCOPES.join(', ')}.` });
    }

    if (!isValidDateKey(nextStartDateKey) || !isValidDateKey(nextEndDateKey)) {
      return res.status(400).json({ message: 'startDateKey and endDateKey must be YYYY-MM-DD.' });
    }

    if (nextStartDateKey > nextEndDateKey) {
      return res.status(400).json({ message: 'startDateKey must be on or before endDateKey.' });
    }

    let targetUserId: mongoose.Types.ObjectId | undefined;
    let targetUserName: string | undefined;
    if (nextScope === 'individual') {
      const effectiveUserId = requestedUserId || item.userId?.toString();
      if (!effectiveUserId || !mongoose.Types.ObjectId.isValid(effectiveUserId)) {
        return res.status(400).json({ message: 'A valid userId is required for individual scope.' });
      }

      const user = await User.findById(effectiveUserId).select('_id firstName lastName email');
      if (!user) {
        return res.status(404).json({ message: 'Target user not found.' });
      }

      targetUserId = user._id as mongoose.Types.ObjectId;
      targetUserName = getUserName(user.firstName, user.lastName, user.email);
    }

    item.title = nextTitle;
    item.type = nextType;
    item.scope = nextScope;
    item.startDateKey = nextStartDateKey;
    item.endDateKey = nextEndDateKey;
    item.userId = targetUserId;
    item.userName = targetUserName;
    item.notes = nextNotes || undefined;
    await item.save();

    return res.json({
      item: serializeAttendanceException(item)
    });
  } catch (error) {
    console.error('Error updating attendance exception:', error);
    return res.status(500).json({ message: 'Error updating attendance exception', error });
  }
};

export const deleteAttendanceExceptionForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid attendance exception id.' });
    }

    const deleted = await AttendanceException.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Attendance exception not found.' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting attendance exception:', error);
    return res.status(500).json({ message: 'Error deleting attendance exception', error });
  }
};

export const getMyAttendanceExceptionRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const requestedStatus =
      typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const status = requestedStatus ? parseExceptionStatus(requestedStatus) : null;
    if (requestedStatus && !status) {
      return res
        .status(400)
        .json({ message: `status must be one of: ${ATTENDANCE_EXCEPTION_STATUSES.join(', ')}.` });
    }

    const query: Record<string, unknown> = {
      scope: 'individual',
      userId: req.user._id
    };
    if (status) {
      query.status = status;
    }

    const items = await AttendanceException.find(query).sort({
      status: 1,
      startDateKey: 1,
      createdAt: -1
    });

    return res.json({
      totalRows: items.length,
      items: items.map(serializeAttendanceException)
    });
  } catch (error) {
    console.error('Error fetching my attendance exception requests:', error);
    return res.status(500).json({ message: 'Error fetching attendance exception requests', error });
  }
};

export const createMyAttendanceExceptionRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const type = parseExceptionType(req.body?.type);
    const startDateKey =
      typeof req.body?.startDateKey === 'string' ? req.body.startDateKey.trim() : '';
    const endDateKey = typeof req.body?.endDateKey === 'string' ? req.body.endDateKey.trim() : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    const titleInput = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

    if (!type) {
      return res
        .status(400)
        .json({ message: `type must be one of: ${ATTENDANCE_EXCEPTION_TYPES.join(', ')}.` });
    }

    if (!isValidDateKey(startDateKey) || !isValidDateKey(endDateKey)) {
      return res.status(400).json({ message: 'startDateKey and endDateKey must be YYYY-MM-DD.' });
    }

    if (startDateKey > endDateKey) {
      return res.status(400).json({ message: 'startDateKey must be on or before endDateKey.' });
    }

    const overlappingPending = await AttendanceException.findOne({
      scope: 'individual',
      userId: req.user._id,
      $or: [{ status: { $in: ['pending', 'approved'] } }, { status: { $exists: false } }],
      startDateKey: { $lte: endDateKey },
      endDateKey: { $gte: startDateKey }
    });
    if (overlappingPending) {
      return res
        .status(409)
        .json({ message: 'You already have a pending attendance exception request for these dates.' });
    }

    const title = titleInput || buildRequestTitle(type);
    const requesterName = getUserName(req.user.firstName, req.user.lastName, req.user.email);

    const item = await AttendanceException.create({
      title,
      type,
      scope: 'individual',
      status: 'pending',
      startDateKey,
      endDateKey,
      userId: req.user._id,
      userName: requesterName,
      notes: notes || undefined,
      createdById: req.user._id,
      createdByName: requesterName
    });

    return res.status(201).json({
      item: serializeAttendanceException(item)
    });
  } catch (error) {
    console.error('Error creating attendance exception request:', error);
    return res.status(500).json({ message: 'Error creating attendance exception request', error });
  }
};

export const getAttendanceExceptionRequestsForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const requestedStatus =
      typeof req.query.status === 'string' ? req.query.status.trim() : 'pending';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = requestedStatus === 'all' ? null : parseExceptionStatus(requestedStatus);
    if (requestedStatus !== 'all' && !status) {
      return res
        .status(400)
        .json({ message: `status must be one of: ${ATTENDANCE_EXCEPTION_STATUSES.join(', ')}, all.` });
    }

    const query: Record<string, unknown> = {
      scope: 'individual'
    };
    if (status) {
      query.status = status;
    }

    const items = await AttendanceException.find(query).sort({
      createdAt: -1
    });

    const filtered = items.filter((item) => {
      if (!search) {
        return true;
      }
      const text = `${item.title} ${item.userName ?? ''} ${item.createdByName ?? ''} ${item.notes ?? ''}`.toLowerCase();
      return text.includes(search);
    });

    return res.json({
      totalRows: items.length,
      filteredRows: filtered.length,
      items: filtered.map(serializeAttendanceException)
    });
  } catch (error) {
    console.error('Error fetching attendance exception requests for admin:', error);
    return res.status(500).json({ message: 'Error fetching attendance exception requests', error });
  }
};

export const reviewAttendanceExceptionRequestForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid attendance exception request id.' });
    }

    const decision = parseReviewDecision(req.body?.decision);
    if (!decision) {
      return res.status(400).json({ message: 'decision must be either approved or rejected.' });
    }

    const reviewNote =
      typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim() : '';
    const item = await AttendanceException.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Attendance exception request not found.' });
    }

    if (item.scope !== 'individual') {
      return res.status(400).json({ message: 'Only individual requests can be reviewed.' });
    }

    if (item.status !== 'pending') {
      return res.status(409).json({ message: `Request is already ${item.status}.` });
    }

    item.status = decision;
    item.reviewedById = req.user!._id;
    item.reviewedByName = getUserName(req.user!.firstName, req.user!.lastName, req.user!.email);
    item.reviewedAt = new Date();
    item.reviewNote = reviewNote || undefined;
    await item.save();

    return res.json({
      item: serializeAttendanceException(item)
    });
  } catch (error) {
    console.error('Error reviewing attendance exception request:', error);
    return res.status(500).json({ message: 'Error reviewing attendance exception request', error });
  }
};

export const clearTrialDataForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAttendanceAdmin(req, res)) {
      return;
    }

    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
    const confirm = typeof req.query.confirm === 'string' ? req.query.confirm.trim() : '';

    if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
      return res.status(400).json({ message: 'startDate and endDate are required in YYYY-MM-DD format.' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ message: 'startDate must be on or before endDate.' });
    }

    if (confirm !== 'CLEAR_TRIAL_DATA') {
      return res.status(400).json({ message: 'Missing or invalid confirm parameter. Pass confirm=CLEAR_TRIAL_DATA.' });
    }

    const overlapQuery = { startDateKey: { $lte: endDate }, endDateKey: { $gte: startDate } };

    // Collect exceptionIds from leave requests so we also remove their linked exceptions
    const leaveRequests = await LeaveRequest.find(overlapQuery).select('exceptionId').lean();
    const linkedExceptionIds = leaveRequests
      .map((lr) => lr.exceptionId)
      .filter(Boolean);

    const [attendanceResult, leaveResult, exceptionResult] = await Promise.all([
      AttendanceRecord.deleteMany({ dateKey: { $gte: startDate, $lte: endDate } }),
      LeaveRequest.deleteMany(overlapQuery),
      AttendanceException.deleteMany({
        $or: [
          overlapQuery,
          ...(linkedExceptionIds.length > 0 ? [{ _id: { $in: linkedExceptionIds } }] : []),
        ],
      }),
    ]);

    console.log(
      `[ClearTrialData] ${startDate}–${endDate} by ${req.user!.firstName} ${req.user!.lastName}: ` +
      `attendance=${attendanceResult.deletedCount}, leave=${leaveResult.deletedCount}, exceptions=${exceptionResult.deletedCount}`
    );

    return res.json({
      message: 'Trial data cleared successfully',
      deletedAttendanceRecords: attendanceResult.deletedCount,
      deletedLeaveRequests: leaveResult.deletedCount,
      deletedExceptions: exceptionResult.deletedCount,
    });
  } catch (error) {
    console.error('Error clearing trial data:', error);
    return res.status(500).json({ message: 'Error clearing trial data', error });
  }
};

function ensureAttendanceAdmin(req: AuthRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: 'Please authenticate.' });
    return false;
  }

  if (!['hr_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403).json({ message: 'Only HR Admin or Super Admin can access attendance operations.' });
    return false;
  }

  return true;
}

function getCaptureDisabledMessage(reason: AttendanceCapturePauseReason, exceptionTitle?: string) {
  if (reason === 'weekend') {
    return 'Attendance capture is paused on weekends for development.';
  }

  if (reason === 'exception_day') {
    return exceptionTitle
      ? `Attendance capture is paused because '${exceptionTitle}' is scheduled for today.`
      : 'Attendance capture is paused because you have an approved attendance exception today.';
  }

  return 'Attendance capture is currently paused by HR Admin.';
}

function getUserName(firstName?: string, lastName?: string, fallback?: string) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || fallback || 'Unknown User';
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const num = Number(value);
  if (Number.isNaN(num)) {
    return null;
  }

  return num;
}

function formatGpsLabel(latitude: number, longitude: number, accuracy: number | null) {
  const lat = latitude.toFixed(5);
  const lng = longitude.toFixed(5);
  const acc = accuracy !== null ? ` (+/-${Math.round(accuracy)}m)` : '';
  return `GPS ${lat}, ${lng}${acc}`;
}

async function reverseGeocode(latitude: number, longitude: number) {
  const provider = getReverseGeocodeProvider();

  switch (provider) {
    case 'mapbox':
      return reverseGeocodeMapbox(latitude, longitude);
    case 'google':
      return reverseGeocodeGoogle(latitude, longitude);
    case 'nominatim':
    default:
      return reverseGeocodeNominatim(latitude, longitude);
  }
}

function getReverseGeocodeProvider(): 'nominatim' | 'mapbox' | 'google' {
  const value = (process.env.REVERSE_GEOCODE_PROVIDER ?? 'nominatim').trim().toLowerCase();
  if (value === 'mapbox' || value === 'google' || value === 'nominatim') {
    return value;
  }
  return 'nominatim';
}

async function reverseGeocodeNominatim(latitude: number, longitude: number) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
  const userAgent = process.env.REVERSE_GEOCODE_USER_AGENT?.trim() || 'attendance-app';
  const language = process.env.REVERSE_GEOCODE_LANGUAGE?.trim() || 'en';

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': language
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { display_name?: string };
    const label = data.display_name;
    return typeof label === 'string' && label.trim() ? label.trim() : null;
  } catch {
    return null;
  }
}

async function reverseGeocodeMapbox(latitude: number, longitude: number) {
  const token = process.env.MAPBOX_TOKEN?.trim();
  if (!token) {
    return null;
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { features?: Array<{ place_name?: string }> };
    const label = data.features?.[0]?.place_name;
    return typeof label === 'string' && label.trim() ? label.trim() : null;
  } catch {
    return null;
  }
}

async function reverseGeocodeGoogle(latitude: number, longitude: number) {
  const key = process.env.GOOGLE_MAPS_KEY?.trim();
  if (!key) {
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${encodeURIComponent(key)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{ formatted_address?: string }>;
      status?: string;
    };
    if (data.status && data.status !== 'OK') {
      return null;
    }

    const label = data.results?.[0]?.formatted_address;
    return typeof label === 'string' && label.trim() ? label.trim() : null;
  } catch {
    return null;
  }
}

type NetworkLocationResponse = {
  label: string;
  latitude?: number;
  longitude?: number;
  source: string;
};

async function resolveNetworkLocation(): Promise<NetworkLocationResponse | null> {
  const providers = [
    {
      source: 'ipapi',
      url: 'https://ipapi.co/json/',
      parse: (data: Record<string, unknown>) => {
        const city = asString(data.city);
        const region = asString(data.region);
        const country = asString(data.country_name);
        const latitude = asNumber(data.latitude);
        const longitude = asNumber(data.longitude);
        return { city, region, country, latitude, longitude, ok: true };
      }
    },
    {
      source: 'ipwhois',
      url: 'https://ipwho.is/',
      parse: (data: Record<string, unknown>) => {
        const success = data.success;
        const city = asString(data.city);
        const region = asString(data.region);
        const country = asString(data.country);
        const latitude = asNumber(data.latitude);
        const longitude = asNumber(data.longitude);
        return { city, region, country, latitude, longitude, ok: success !== false };
      }
    },
    {
      source: 'ip-api',
      url: 'http://ip-api.com/json/',
      parse: (data: Record<string, unknown>) => {
        const status = asString(data.status);
        const city = asString(data.city);
        const region = asString(data.regionName);
        const country = asString(data.country);
        const latitude = asNumber(data.lat);
        const longitude = asNumber(data.lon);
        return { city, region, country, latitude, longitude, ok: status === 'success' };
      }
    }
  ];

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        headers: {
          'User-Agent': 'hr-appraisal-attendance'
        }
      });

      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const parsed = provider.parse(data);
      if (!parsed.ok) {
        continue;
      }

      const parts = [parsed.city, parsed.region, parsed.country].filter(Boolean);
      const label = parts.length > 0 ? `IP ${parts.join(', ')}` : 'IP location';

      return {
        label,
        latitude: parsed.latitude ?? undefined,
        longitude: parsed.longitude ?? undefined,
        source: provider.source
      };
    } catch {
      continue;
    }
  }

  return null;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function parseExceptionType(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return ATTENDANCE_EXCEPTION_TYPES.includes(normalized as AttendanceExceptionType)
    ? (normalized as AttendanceExceptionType)
    : null;
}

function parseExceptionScope(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return ATTENDANCE_EXCEPTION_SCOPES.includes(normalized as AttendanceExceptionScope)
    ? (normalized as AttendanceExceptionScope)
    : null;
}

function parseExceptionStatus(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return ATTENDANCE_EXCEPTION_STATUSES.includes(normalized as AttendanceExceptionStatus)
    ? (normalized as AttendanceExceptionStatus)
    : null;
}

function parseReviewDecision(value: unknown) {
  const status = parseExceptionStatus(value);
  if (status === 'approved' || status === 'rejected') {
    return status;
  }
  return null;
}

function parseAttendanceFlagAction(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'flag' || normalized === 'unflag') {
    return normalized;
  }

  return null;
}

function buildRequestTitle(type: AttendanceExceptionType) {
  switch (type) {
    case 'annual_leave':
      return 'Annual Leave Request';
    case 'sick_leave':
      return 'Sick Leave Request';
    case 'official_assignment':
      return 'Official Assignment Request';
    case 'public_holiday':
      return 'Public Holiday Request';
    case 'non_working_day':
      return 'Non-Working Day Request';
    default:
      return 'Attendance Exception Request';
  }
}
