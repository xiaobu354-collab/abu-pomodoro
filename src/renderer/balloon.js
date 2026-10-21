let lastSeq = null;

const elements = {
  balloon: document.querySelector('#balloon')
};

// 阶段 → 云表情 + 贴纸字（视觉在 balloon.html 内按 data-tone 切换）
const MESSAGES = {
  'focus->shortBreak': { tone: 'break', label: '专注结束，休息啦！点一下开始休息' },
  'focus->longBreak': { tone: 'break', label: '专注结束，休息啦！点一下开始休息' },
  'shortBreak->focus': { tone: 'focus', label: '休息结束，干活啦！点一下开始专注' },
  'longBreak->focus': { tone: 'focus', label: '休息结束，干活啦！点一下开始专注' }
};

function applyPayload(payload) {
  if (!payload) return;
  const key = `${payload.fromPhase}->${payload.toPhase}`;
  const template = MESSAGES[key] || MESSAGES['focus->shortBreak'];
  elements.balloon.dataset.tone = template.tone;
  elements.balloon.setAttribute('aria-label', template.label);
}

function showBalloon(payload) {
  applyPayload(payload);
  elements.balloon.classList.remove('leave');
  // 重建 enter 动画（若已在 enter 中则重播一次）
  void elements.balloon.offsetWidth;
  elements.balloon.classList.add('enter');
}

function showBalloonOnce(payload) {
  // 去重：主进程在 ready-to-show 时 push 一次，首屏又会 getBalloonState 拉一次。
  // 同一 seq 只播一次动画，避免闪一下。
  if (payload.seq !== undefined && payload.seq === lastSeq) return;
  lastSeq = payload.seq;
  showBalloon(payload);
}

function hideBalloon() {
  lastSeq = null;
  elements.balloon.classList.remove('enter');
  elements.balloon.classList.add('leave');
  setTimeout(() => {
    elements.balloon.classList.remove('leave');
  }, 260);
}

elements.balloon.addEventListener('click', () => {
  window.mintTimer.advanceTransition();
});
elements.balloon.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    window.mintTimer.advanceTransition();
  }
});

window.mintTimer.onBalloonShow(showBalloonOnce);
window.mintTimer.onBalloonHide(hideBalloon);
window.mintTimer.getBalloonState().then((payload) => {
  if (payload && payload.visible) showBalloonOnce(payload);
});
