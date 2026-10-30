function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function completedSessionsForDate(savedProgress, date = new Date()) {
  if (savedProgress?.date !== localDateKey(date)) return 0;
  return Math.max(0, Number.parseInt(savedProgress.completedFocusSessions, 10) || 0);
}

function prepareDailyStartup(appData, date = new Date()) {
  const today = localDateKey(date);
  if (appData.dailyProgress?.date === today) return appData;
  const saved = appData.timerSession;
  return {
    ...appData,
    dailyProgress: { date: today, completedFocusSessions: 0 },
    // Keep appearance choices, but never resume an older day's timer or card.
    timerSession: saved ? {
      focusSkinIndex: saved.focusSkinIndex,
      companionCycleIndex: saved.companionCycleIndex,
      companionThemeId: saved.companionThemeId
    } : null,
    reminderState: null
  };
}

module.exports = { localDateKey, completedSessionsForDate, prepareDailyStartup };
