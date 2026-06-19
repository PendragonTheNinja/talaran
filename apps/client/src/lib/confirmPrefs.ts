// Per-action "skip confirmation" preferences, stored locally.
const KEY = 'talaran:skipConfirm';

function read(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
}

export function getSkipConfirm(action: string): boolean {
    return !!read()[action];
}

export function setSkipConfirm(action: string, skip: boolean): void {
    const prefs = read();
    if (skip) prefs[action] = true;
    else delete prefs[action];
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}