// Auto-close work day at 17:15
import api from "../api/client";

const AUTO_CLOSE_HOUR = 17;
const AUTO_CLOSE_MINUTE = 15;
let autoCloseInterval = null;

/**
 * Check and auto-close open work sessions at 17:15
 * Only closes sessions that are still open at the cutoff time
 */
export const checkAndAutoCloseWorkDay = async () => {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const today = now.toISOString().split('T')[0];

    // Check if it's past 17:15
    if (currentHour > AUTO_CLOSE_HOUR || (currentHour === AUTO_CLOSE_HOUR && currentMinute >= AUTO_CLOSE_MINUTE)) {
      // Find all open attendance records for today
      const { data: allRecords, error } = await api
        .from('attendance_records')
        .select('id, user_id, sign_in_time, sign_out_time')
        .eq('date', today);

      if (error) {
        console.warn('Auto-close: Failed to fetch records', error);
        return;
      }

      // Filter for records with null sign_out_time in JavaScript
      const openRecords = allRecords?.filter(record => !record.sign_out_time) || [];

      if (openRecords.length > 0) {
        // Auto-close time is 17:15
        const autoCloseTime = new Date(now);
        autoCloseTime.setHours(AUTO_CLOSE_HOUR, AUTO_CLOSE_MINUTE, 0, 0);
        const autoCloseIso = autoCloseTime.toISOString();

        console.log(`Auto-closing ${openRecords.length} open work session(s) at ${autoCloseIso}`);

        // Update all open records with sign_out_time of 17:15
        for (const record of openRecords) {
          try {
            await api
              .from('attendance_records')
              .update({
                sign_out_time: autoCloseIso,
                method: 'auto-close',
                note: `Auto-closed at ${AUTO_CLOSE_HOUR}:${AUTO_CLOSE_MINUTE.toString().padStart(2, '0')}`
              })
              .eq('id', record.id);
          } catch (updateErr) {
            console.warn(`Auto-close: Failed to update record ${record.id}`, updateErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Auto-close work day error:', err);
  }
};

/**
 * Start auto-close monitoring
 * Checks every minute if it's time to auto-close
 */
export const startAutoCloseMonitoring = () => {
  if (autoCloseInterval) return; // Already running

  // Check immediately
  checkAndAutoCloseWorkDay();

  // Then check every minute
  autoCloseInterval = setInterval(() => {
    checkAndAutoCloseWorkDay();
  }, 60000); // 60 seconds

  console.log('Auto-close monitoring started - will close work sessions at 17:15');
};

/**
 * Stop auto-close monitoring
 */
export const stopAutoCloseMonitoring = () => {
  if (autoCloseInterval) {
    clearInterval(autoCloseInterval);
    autoCloseInterval = null;
    console.log('Auto-close monitoring stopped');
  }
};

/**
 * Check if current user has an open work session for today
 * Returns the open session record or null
 */
export const checkOpenWorkSession = async (userId) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: allRows } = await api
      .from('attendance_records')
      .select('id, sign_in_time, user_id, sign_out_time')
      .eq('user_id', userId)
      .eq('date', today);

    // Filter for null sign_out_time in JavaScript
    const openSession = allRows?.filter(row => !row.sign_out_time)?.[0];
    return openSession || null;
  } catch (err) {
    console.error('Check open work session error:', err);
    return null;
  }
};
