import type { MessageKey } from './th';

/**
 * ภาษาอังกฤษ — โครงเตรียมไว้สำหรับอนาคต (บรีฟข้อ 1: เตรียมโครงสร้าง i18n)
 * คีย์ใดยังไม่แปล ระบบจะ fallback ไปภาษาไทยอัตโนมัติ
 */
export const en: Partial<Record<MessageKey, string>> = {
  'app.name': 'TNN Meeting Room Booking',
  'app.shortName': 'TNN Meeting',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.search': 'Search',
  'common.today': 'Today',
  'common.loading': 'Loading...',
  'common.retry': 'Retry',
  'common.clearAll': 'Clear all',
  'common.skip': 'Skip',
  'common.done': 'Done',

  'nav.calendar': 'Calendar',
  'nav.myBookings': 'My bookings',
  'nav.approvals': 'Approvals',
  'nav.notifications': 'Notifications',
  'nav.profile': 'Profile',
  'nav.help': 'Help',
  'nav.admin': 'Admin',
  'nav.logout': 'Sign out',
  'nav.skipToContent': 'Skip to main content',

  'view.day': 'Day',
  'view.week': 'Week',
  'view.month': 'Month',

  'calendar.bookButton': 'Book a room',
  'calendar.selectRoom': 'Select room',

  'auth.login': 'Sign in',
  'auth.email': 'Work email',
  'auth.password': 'Password',

  'status.pending': 'Pending',
  'status.confirmed': 'Confirmed',
  'status.cancelled': 'Cancelled',
  'status.rejected': 'Rejected',
  'status.checked_in': 'Checked in',
  'status.completed': 'Completed',
  'status.no_show': 'No show',

  'error.conflict': 'That time slot is already taken. Please choose another time or room.',
  'error.forbidden': 'You do not have permission to do this.',
};
