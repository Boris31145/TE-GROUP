export const REPORT_TIMEZONE = 'Europe/Moscow';
const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone: REPORT_TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit'});
export function moscowDay(now = new Date()) {
 const parts = Object.fromEntries(dayFormat.formatToParts(now).map(p => [p.type, p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
