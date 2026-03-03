import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  checkIn,
  checkOut,
  createMyAttendanceExceptionRequest,
  createAttendanceExceptionForAdmin,
  deleteAttendanceExceptionForAdmin,
  deleteAttendanceEntry,
  getAttendanceCaptureControlForAdmin,
  getAttendanceExceptionRequestsForAdmin,
  getAttendanceExceptionsForAdmin,
  getAdminUserMonthlyAttendance,
  getAdminUserPeriodAttendance,
  getAttendanceSettingsForAdmin,
  getDailyAttendanceForAdmin,
  getMyAttendanceExceptionRequests,
  getMyMonthlyAttendance,
  getMyTodayAttendance,
  getNetworkLocationByIp,
  reviewAttendanceExceptionRequestForAdmin,
  updateAttendanceEntryFlagForAdmin,
  uploadAttendancePhoto,
  updateAttendanceExceptionForAdmin,
  updateAttendanceCaptureControlForAdmin,
  updateAttendanceSettingsForAdmin
} from '../controllers/attendance.controller';

const router = express.Router();

router.post('/check-in', authenticate, checkIn);
router.post('/check-out', authenticate, checkOut);
router.delete('/entry/:id', authenticate, deleteAttendanceEntry);
router.get('/today', authenticate, getMyTodayAttendance);
router.get('/me/monthly', authenticate, getMyMonthlyAttendance);
router.get('/me/exceptions', authenticate, getMyAttendanceExceptionRequests);
router.post('/me/exceptions', authenticate, createMyAttendanceExceptionRequest);
router.post('/uploads/photo', authenticate, uploadAttendancePhoto);
router.get('/location/ip', authenticate, getNetworkLocationByIp);

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

export default router;
