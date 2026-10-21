const { LIMITS } = require('./config');
const { COMPANION_THEMES } = require('./companion-themes');
const MAX_CONFIGURED_DURATION_MS = Math.max(...['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes']
  .map(key => LIMITS[key][1])) * 60_000;

class TimerEngine {
  constructor(settings, now = () => Date.now(), completedFocusSessions = 0, savedState = null) {
    this.settings = { ...settings };
    this.now = now;
    this.phase = 'focus';
    this.status = 'idle';
    this.remainingMs = this.durationFor('focus');
    this.currentTotalMs = this.remainingMs;
    this.endAt = null;
    this.durationOverrideMs = null;
    this.completedFocusSessions = Math.max(0, Number.parseInt(completedFocusSessions, 10) || 0);
    this.focusSkinIndex = Number.isSafeInteger(savedState?.focusSkinIndex) && savedState.focusSkinIndex >= 0
      ? savedState.focusSkinIndex % 3 : 0;
    this.companionCycleIndex = Number.isSafeInteger(savedState?.companionCycleIndex) && savedState.companionCycleIndex >= 0
      ? savedState.companionCycleIndex : 0;
    this.companionThemeId = COMPANION_THEMES.some(theme=>theme.id===savedState?.companionThemeId)
      ? savedState.companionThemeId : COMPANION_THEMES[0].id;
    this.reuseFocusSkinAfterExtension = savedState?.reuseFocusSkinAfterExtension === true && savedState.phase !== 'focus';
    if (savedState && ['focus', 'shortBreak', 'longBreak'].includes(savedState.phase)
      && ['idle', 'running', 'paused'].includes(savedState.status)
      && Number.isFinite(savedState.remainingMs) && savedState.remainingMs >= 0
      && (savedState.status !== 'running' || Number.isFinite(savedState.endAt))) {
      this.phase = savedState.phase;
      this.status = savedState.status;
      this.durationOverrideMs = Number.isFinite(savedState.durationOverrideMs) && savedState.durationOverrideMs > 0
        ? savedState.durationOverrideMs : null;
      this.remainingMs = savedState.remainingMs;
      this.endAt = this.status === 'running' ? savedState.endAt : null;
      // Older saves do not know the elapsed part of the stage. Keep a safe
      // denominator at least as large as the saved remaining time.
      const fallbackTotal = Math.max(this.durationOverrideMs || this.durationFor(this.phase), this.remainingMs);
      this.currentTotalMs = Number.isFinite(savedState.currentTotalMs)
        && savedState.currentTotalMs > 0 && savedState.currentTotalMs >= this.remainingMs
        && savedState.currentTotalMs <= Math.max(MAX_CONFIGURED_DURATION_MS, fallbackTotal)
        ? savedState.currentTotalMs : fallbackTotal;
    }
  }

  durationFor(phase) {
    const key = {
      focus: 'focusMinutes',
      shortBreak: 'shortBreakMinutes',
      longBreak: 'longBreakMinutes'
    }[phase];
    return this.settings[key] * 60 * 1000;
  }

  snapshot(currentTime = this.now()) {
    const remainingMs = this.status === 'running'
      ? Math.max(0, this.endAt - currentTime)
      : this.remainingMs;

    return {
      phase: this.phase,
      status: this.status,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      totalMs: this.currentTotalMs,
      completedFocusSessions: this.completedFocusSessions,
      focusSkinId: String(this.focusSkinIndex + 1).padStart(2, '0'),
      companionCycleIndex: this.companionCycleIndex,
      companionThemeId: this.companionThemeId
    };
  }

  start(currentTime = this.now()) {
    if (this.status === 'running') return this.snapshot(currentTime);
    if (this.remainingMs <= 0) {
      this.remainingMs = this.durationOverrideMs || this.durationFor(this.phase);
      this.currentTotalMs = this.remainingMs;
    }
    this.endAt = currentTime + this.remainingMs;
    this.status = 'running';
    return this.snapshot(currentTime);
  }

  pause(currentTime = this.now()) {
    if (this.status !== 'running') return this.snapshot(currentTime);
    this.remainingMs = Math.max(0, this.endAt - currentTime);
    this.endAt = null;
    this.status = 'paused';
    return this.snapshot(currentTime);
  }

  toggle(currentTime = this.now()) {
    return this.status === 'running' ? this.pause(currentTime) : this.start(currentTime);
  }

  reset() {
    this.durationOverrideMs = null;
    this.status = 'idle';
    this.endAt = null;
    this.remainingMs = this.durationFor(this.phase);
    this.currentTotalMs = this.remainingMs;
    return this.snapshot();
  }

  skip() {
    this.durationOverrideMs = null;
    const skippedPhase = this.phase;
    this.phase = skippedPhase === 'focus' ? 'shortBreak' : 'focus';
    if (this.phase === 'focus') this.advanceFocusSkin();
    this.remainingMs = this.durationFor(this.phase);
    this.currentTotalMs = this.remainingMs;
    this.status = 'running';
    this.endAt = this.now() + this.remainingMs;

    return {
      skipped: { phase: skippedPhase, nextPhase: this.phase },
      snapshot: this.snapshot()
    };
  }

  updateSettings(settings) {
    this.settings = { ...settings };
    if (this.status === 'idle') {
      this.remainingMs = this.durationFor(this.phase);
      this.currentTotalMs = this.durationOverrideMs || this.remainingMs;
    }
    return this.snapshot();
  }

  resetDailyProgress() {
    this.completedFocusSessions = 0;
    return this.snapshot();
  }

  tick(currentTime = this.now()) {
    if (this.status !== 'running') return { completed: null, snapshot: this.snapshot(currentTime) };

    this.remainingMs = Math.max(0, this.endAt - currentTime);
    if (this.remainingMs > 0) return { completed: null, snapshot: this.snapshot(currentTime) };

    return this._completeAt(currentTime);
  }

  complete() { return this._completeAt(this.now()); }

  startBreakExtension(durationMs = 120_000) {
    if (this.phase === 'focus') this.reuseFocusSkinAfterExtension = true;
    this.phase = 'shortBreak';
    this.durationOverrideMs = Math.max(1_000, Number.parseInt(durationMs, 10) || 120_000);
    this.remainingMs = this.durationOverrideMs;
    this.currentTotalMs = this.remainingMs;
    this.status = 'running';
    this.endAt = this.now() + this.remainingMs;
    return this.snapshot();
  }

  exportState() {
    return { phase: this.phase, status: this.status, endAt: this.endAt,
      remainingMs: this.snapshot().remainingMs, durationOverrideMs: this.durationOverrideMs,
      currentTotalMs: this.currentTotalMs,
      focusSkinIndex: this.focusSkinIndex,
      companionCycleIndex: this.companionCycleIndex,
      companionThemeId: this.companionThemeId,
      reuseFocusSkinAfterExtension: this.reuseFocusSkinAfterExtension };
  }

  advanceFocusSkin() {
    if (!this.reuseFocusSkinAfterExtension) {
      this.focusSkinIndex = (this.focusSkinIndex + 1) % 3;
      this.companionCycleIndex = this.companionCycleIndex < Number.MAX_SAFE_INTEGER ? this.companionCycleIndex + 1 : 0;
      const themeIndex=COMPANION_THEMES.findIndex(theme=>theme.id===this.companionThemeId);
      this.companionThemeId=COMPANION_THEMES[(themeIndex+1)%COMPANION_THEMES.length].id;
    }
    this.reuseFocusSkinAfterExtension = false;
  }

  _completeAt(currentTime) {
    const completedPhase = this.phase;
    this.durationOverrideMs = null;
    if (completedPhase === 'focus') {
      this.completedFocusSessions += 1;
      this.phase = this.completedFocusSessions % this.settings.longBreakInterval === 0
        ? 'longBreak'
        : 'shortBreak';
    } else {
      this.phase = 'focus';
      this.advanceFocusSkin();
    }

    this.remainingMs = this.durationFor(this.phase);
    this.currentTotalMs = this.remainingMs;
    const autoStart = completedPhase === 'focus'
      ? (this.settings.autoStartBreak ?? this.settings.autoStartNext)
      : (this.settings.autoStartFocus ?? this.settings.autoStartNext);
    if (autoStart) {
      this.status = 'running';
      this.endAt = currentTime + this.remainingMs;
    } else {
      this.status = 'idle';
      this.endAt = null;
    }

    return {
      completed: { phase: completedPhase, nextPhase: this.phase },
      snapshot: this.snapshot(currentTime)
    };
  }
}

module.exports = { TimerEngine };
