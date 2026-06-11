// Centralized time formatting. The whole game displays Eastern time
// (America/New_York, auto-handles EST/EDT) regardless of the viewer's location.
const GAME_TZ = 'America/New_York'

// 24-hour HH:MM in Eastern, e.g. "14:05"
export function formatGameTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: GAME_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23', // guarantees 00-23 (avoids the midnight "24:00" quirk)
    }).format(date)
}

// M/D/YYYY in Eastern, e.g. "6/9/2026"
export function formatGameDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: GAME_TZ,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).format(date)
}

// M/D/YYYY HH:MM in Eastern
export function formatGameDateTime(date: Date): string {
    return `${formatGameDate(date)} ${formatGameTime(date)}`
}

// "Month D, YYYY" long form in Eastern, e.g. "June 9, 2026"
export function formatGameDateLong(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: GAME_TZ,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date)
}