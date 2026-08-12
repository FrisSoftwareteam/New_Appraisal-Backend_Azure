import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import {
  checkIn,
  checkOut,
  uploadAttendanceForOfflineMode,
  onPremCheckIn,
  onPremCheckOut,
  createMyAttendanceExceptionRequest,
  createAttendanceExceptionForAdmin,
  createAttendanceReminderExemptionForAdmin,
  deleteAttendanceExceptionForAdmin,
  deleteAttendanceReminderExemptionForAdmin,
  deleteAttendanceEntry,
  getAttendanceCaptureControlForAdmin,
  getAttendanceExceptionRequestsForAdmin,
  getAttendanceExceptionsForAdmin,
  getAttendanceReminderExemptionsForAdmin,
  getAdminUserMonthlyAttendance,
  getAdminUserPeriodAttendance,
  getAttendanceSettingsForAdmin,
  getDailyAttendanceForAdmin,
  getMyAttendanceExceptionRequests,
  getMyMonthlyAttendance,
  getMyTodayAttendance,
  getTodayAttendanceByUserId,
  getNetworkLocationByIp,
  getPublicHolidaysInRange,
  reviewAttendanceExceptionRequestForAdmin,
  updateAttendanceEntryFlagForAdmin,
  uploadAttendancePhoto,
  uploadAttendancePhotoPublic,
  updateAttendanceExceptionForAdmin,
  updateAttendanceCaptureControlForAdmin,
  updateAttendanceSettingsForAdmin,
  clearTrialDataForAdmin
} from '../controllers/attendance.controller';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/check-in', authenticate, checkIn);
router.post('/check-out', authenticate, checkOut);
router.post('/on-prem-check-in', onPremCheckIn);
router.post('/on-prem-check-out', onPremCheckOut);
router.get('/on-prem/users/:userId/today', getTodayAttendanceByUserId);
router.delete('/entry/:id', authenticate, deleteAttendanceEntry);
router.get('/today', authenticate, getMyTodayAttendance);
router.get('/me/monthly', authenticate, getMyMonthlyAttendance);
router.get('/me/exceptions', authenticate, getMyAttendanceExceptionRequests);
router.post('/me/exceptions', authenticate, createMyAttendanceExceptionRequest);
router.post('/uploads/photo', authenticate, uploadAttendancePhoto);
router.post('/uploads/photo/public', uploadAttendancePhotoPublic);
router.get('/location/ip', authenticate, getNetworkLocationByIp);
router.get('/holidays', authenticate, getPublicHolidaysInRange);

router.get('/admin/daily', authenticate, getDailyAttendanceForAdmin);
router.put('/admin/entry/:id/flag', authenticate, updateAttendanceEntryFlagForAdmin);
router.get('/admin/users/:userId/monthly', authenticate, getAdminUserMonthlyAttendance);
router.get('/admin/users/:userId/period', authenticate, getAdminUserPeriodAttendance);
router.get('/admin/settings', authenticate, getAttendanceSettingsForAdmin);
router.get('/admin/capture-control', authenticate, getAttendanceCaptureControlForAdmin);
router.put('/admin/settings', authenticate, updateAttendanceSettingsForAdmin);
router.put('/admin/capture-control', authenticate, updateAttendanceCaptureControlForAdmin);
router.get('/admin/exceptions', authenticate, getAttendanceExceptionsForAdmin);
router.post('/admin/exceptions', authenticate, createAttendanceExceptionForAdmin);
router.put('/admin/exceptions/:id', authenticate, updateAttendanceExceptionForAdmin);
router.delete('/admin/exceptions/:id', authenticate, deleteAttendanceExceptionForAdmin);
router.get('/admin/exception-requests', authenticate, getAttendanceExceptionRequestsForAdmin);
router.put('/admin/exception-requests/:id/review', authenticate, reviewAttendanceExceptionRequestForAdmin);
router.get('/admin/reminder-exemptions', authenticate, getAttendanceReminderExemptionsForAdmin);
router.post('/admin/reminder-exemptions', authenticate, createAttendanceReminderExemptionForAdmin);
router.delete('/admin/reminder-exemptions/:userId', authenticate, deleteAttendanceReminderExemptionForAdmin);
router.delete('/admin/trial-data', authenticate, clearTrialDataForAdmin);
router.post('/admin/offline-upload', authenticate, upload.single('file'), uploadAttendanceForOfflineMode);

export default router;
