const { REMINDER_PACK_IDS } = require('./reminder-content');

const DEFAULT_SETTINGS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 10,
  longBreakInterval: 4,
  autoStartBreak: false,
  autoStartFocus: false,
  enabledReminderIds: REMINDER_PACK_IDS,
  pauseShortcut: '',
  soundEnabled: true,
  notificationsEnabled: true,
  alwaysOnTop: true,
  launchAtLogin: true,
  focusTheme: 'writing'
});

const LIMITS = Object.freeze({
  focusMinutes: [5, 90],
  shortBreakMinutes: [1, 30],
  longBreakMinutes: [5, 60],
  longBreakInterval: [2, 8]
});

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeSettings(candidate = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) candidate = {};
  const settings = {};

  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    settings[key] = clampInteger(candidate[key], min, max, DEFAULT_SETTINGS[key]);
  }

  for (const key of ['soundEnabled', 'notificationsEnabled', 'alwaysOnTop', 'launchAtLogin']) {
    settings[key] = typeof candidate[key] === 'boolean' ? candidate[key] : DEFAULT_SETTINGS[key];
  }

  for (const key of ['autoStartBreak', 'autoStartFocus']) {
    settings[key] = typeof candidate[key] === 'boolean' ? candidate[key]
      : typeof candidate.autoStartNext === 'boolean' ? candidate.autoStartNext : DEFAULT_SETTINGS[key];
  }
  const enabled = Array.isArray(candidate.enabledReminderIds)
    ? [...new Set(candidate.enabledReminderIds.filter(id => REMINDER_PACK_IDS.includes(id)))] : [];
  settings.enabledReminderIds = enabled.length ? enabled : [...REMINDER_PACK_IDS];
  settings.pauseShortcut = normalizePauseShortcut(candidate.pauseShortcut);

  settings.focusTheme = ['writing', 'headphones'].includes(candidate.focusTheme)
    ? candidate.focusTheme
    : DEFAULT_SETTINGS.focusTheme;

  return settings;
}

function normalizePauseShortcut(value) {
  if (typeof value !== 'string' || value.length > 100) return '';
  const parts = value.split('+');
  const key = parts.pop();
  const modifiers = { ctrl: 'ctrl', control: 'ctrl', alt: 'alt', option: 'alt', shift: 'shift',
    meta: 'meta', super: 'meta', cmd: 'meta', command: 'meta', commandorcontrol: 'primary', cmdorctrl: 'primary' };
  const normalized = parts.map(part => modifiers[part.toLowerCase()]);
  if (normalized.some(part => !part) || new Set(normalized).size !== normalized.length) return '';
  if (!/^(?:[A-Za-z0-9]|F(?:[1-9]|1\d|2[0-4])|Space|Tab|Enter|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/i.test(key)) return '';
  if (!parts.length && !/^F(?:[1-9]|1\d|2[0-4])$/i.test(key)) return '';
  return value;
}

module.exports = { DEFAULT_SETTINGS, LIMITS, normalizeSettings };
