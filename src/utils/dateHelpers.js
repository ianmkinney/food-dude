/**
 * Date helper utilities for meal planning
 */

/**
 * Format date to YYYY-MM-DD
 */
export const formatDate = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Get start of week (Sunday)
 */
export const getStartOfWeek = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
};

/**
 * Get end of week (Saturday)
 */
export const getEndOfWeek = (date = new Date()) => {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
};

/**
 * Get array of dates for a week
 */
export const getWeekDates = (startDate) => {
    const dates = [];
    const start = new Date(startDate);

    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        dates.push(date);
    }

    return dates;
};

/**
 * Format date for display (e.g., "Mon, Jan 15")
 */
export const formatDisplayDate = (date) => {
    const d = new Date(date);
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return d.toLocaleDateString('en-US', options);
};

/**
 * Format date for display with year (e.g., "January 15, 2024")
 */
export const formatLongDate = (date) => {
    const d = new Date(date);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return d.toLocaleDateString('en-US', options);
};

/**
 * Check if two dates are the same day
 */
export const isSameDay = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
};

/**
 * Check if date is today
 */
export const isToday = (date) => {
    return isSameDay(date, new Date());
};

/**
 * Get relative date string (e.g., "Today", "Tomorrow", "Yesterday")
 */
export const getRelativeDateString = (date) => {
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (isSameDay(d, today)) return 'Today';
    if (isSameDay(d, tomorrow)) return 'Tomorrow';
    if (isSameDay(d, yesterday)) return 'Yesterday';

    return formatDisplayDate(d);
};

/**
 * Add days to a date
 */
export const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

/**
 * Subtract days from a date
 */
export const subtractDays = (date, days) => {
    return addDays(date, -days);
};
