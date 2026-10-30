const elements = {
  bar: document.querySelector('#timerBar'),
  time: document.querySelector('#time'),
  phase: document.querySelector('#phase'),
  phaseMessage: document.querySelector('#phaseMessage'),
  toggleButton: document.querySelector('#toggleButton'),
  toggleIcon: document.querySelector('#toggleIcon'),
  resetButton: document.querySelector('#resetButton'),
  skipButton: document.querySelector('#skipButton'),
  settingsButton: document.querySelector('#settingsButton'),
  undoRow: document.querySelector('#undoRow'),
  undoLabel: document.querySelector('#undoLabel'),
  undoButton: document.querySelector('#undoButton'),
  progress: document.querySelector('#progress'),
  sessionDots: document.querySelector('#sessionDots'),
  transitionToast: document.querySelector('#transitionToast'),
  transitionEmoji: document.querySelector('#transitionEmoji'),
  transitionTitle: document.querySelector('#transitionTitle'),
  transitionSubtitle: document.querySelector('#transitionSubtitle')
};

let transitionTimer;
const focusSkin = new window.FocusSkinView(document.querySelector('#focusSkin'), elements.bar);
const companionSkin = new window.CompanionSkinView(document.querySelector('#companionSkin'), elements.bar);

const phaseNames = {
  focus: '专注',
  shortBreak: '短休息',
  longBreak: '长休息'
};

const phaseMessages = {
  focus: {
    idle: '准备好了，就从这一小步开始',
    running: '不用赶，只做好眼前这一件事',
    paused: '停一下没关系，按自己的节奏来'
  },
  shortBreak: {
    idle: '歇一会儿，摸鱼也是计划的一部分',
    running: '放心摸鱼，休息也在计划里',
    paused: '想多歇一会儿也没关系'
  },
  longBreak: {
    idle: '认真休息，回来才走得更远',
    running: '离开屏幕，让脑子真正放个假',
    paused: '慢慢休息，不必急着回来'
  }
};

function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function render(state) {
  const { timer, settings, waitingForBreak, undo } = state;
  elements.time.textContent = formatTime(timer.remainingSeconds);
  elements.phase.textContent = waitingForBreak ? '等待休息' : phaseNames[timer.phase];
  elements.phaseMessage.textContent = phaseMessages[timer.phase][timer.status];
  elements.bar.dataset.phase = timer.phase;
  elements.bar.dataset.focusTheme = settings.focusTheme;
  elements.bar.dataset.windowMode = 'compact';
  if (state.appearance?.mode === 'paired') companionSkin.render(timer, state.appearance, undo);
  else {
    companionSkin.deactivate();
    if (timer.phase === 'focus') focusSkin.render(timer);
  }
  elements.undoRow.hidden = !undo || undo.expiresAt <= Date.now();
  elements.undoLabel.textContent = undo?.label || '';
  elements.undoButton.title=undo ? `${undo.label}，撤销上一步` : '撤销上一步';
  elements.undoButton.setAttribute('aria-label',elements.undoButton.title);
  elements.bar.classList.toggle('running', timer.status === 'running');


  const running = timer.status === 'running';
  elements.toggleIcon.className = running ? 'pause-icon' : 'play-icon';
  elements.toggleButton.title = running ? '暂停计时' : '开始计时';
  elements.toggleButton.setAttribute('aria-label', elements.toggleButton.title);

  const ratio = timer.totalMs > 0 ? 1 - (timer.remainingMs / timer.totalMs) : 0;
  elements.progress.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;

  const progressInCycle = timer.completedFocusSessions % settings.longBreakInterval;
  elements.sessionDots.innerHTML = '';
  for (let index = 0; index < settings.longBreakInterval; index += 1) {
    const dot = document.createElement('span');
    dot.classList.toggle('done', index < progressInCycle);
    elements.sessionDots.append(dot);
  }
  elements.sessionDots.title = `今日已完成 ${timer.completedFocusSessions} 次专注`;
}

async function playChime(completed) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  if (context.state === 'suspended') {
    try { await context.resume(); } catch { return; }
  }
  const notes = completed?.phase === 'focus' ? [659.25, 783.99] : [783.99, 659.25];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + index * .18;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + .025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + .32);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + .34);
  });
  setTimeout(() => context.close(), 900);
}

function showPhaseTransition(transition) {
  const goingToBreak = transition.nextPhase !== 'focus';
  const skipped = transition.kind === 'skipped';

  elements.transitionEmoji.textContent = goingToBreak ? '🐟' : '🍅';
  if (goingToBreak) {
    elements.transitionTitle.textContent = skipped ? '已跳过，去摸会儿鱼吧' : '专注完成，去摸会儿鱼吧';
    const breakName = transition.nextPhase === 'longBreak' ? '长休息' : '短休息';
    elements.transitionSubtitle.textContent = transition.started ? `${breakName}已经开始` : `${breakName}已准备好，点击开始`;
  } else {
    elements.transitionTitle.textContent = skipped ? '已跳过休息，开始专注' : '休息结束，开始专注';
    elements.transitionSubtitle.textContent = transition.started ? '新一轮专注已经开始' : '新一轮专注已准备好，点击开始';
  }

  clearTimeout(transitionTimer);
  elements.transitionToast.classList.remove('show');
  elements.bar.classList.remove('phase-transition');
  if (elements.bar.dataset.windowMode === 'compact') {
    void elements.bar.offsetWidth;
    elements.bar.classList.add('phase-transition');
    transitionTimer = setTimeout(() => elements.bar.classList.remove('phase-transition'), 900);
    return;
  }
  void elements.transitionToast.offsetWidth;
  elements.transitionToast.classList.add('show');
  elements.bar.classList.add('phase-transition');
  transitionTimer = setTimeout(() => {
    elements.transitionToast.classList.remove('show');
    elements.bar.classList.remove('phase-transition');
  }, 2850);
}

elements.toggleButton.addEventListener('click', () => window.mintTimer.toggleTimer());
elements.resetButton.addEventListener('click', () => window.mintTimer.resetTimer());
elements.skipButton.addEventListener('click', () => window.mintTimer.skipTimer());
elements.settingsButton.addEventListener('click', () => window.mintTimer.openSettings());
elements.undoButton.addEventListener('click', () => window.mintTimer.undoTimer());
document.addEventListener('contextmenu', event => { event.preventDefault(); window.mintTimer.openMenu(); });

window.mintTimer.onState(render);
window.mintTimer.onPlaySound(playChime);
window.mintTimer.onPhaseTransition(showPhaseTransition);
window.mintTimer.getState().then(render);
