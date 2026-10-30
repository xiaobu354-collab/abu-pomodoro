const api=window.mintTimer.reminder;
const el=Object.fromEntries(['reminderCard','mascot','badge','title','body','timer','progress','progressFill','actions','primaryAction','secondaryAction','tertiaryAction','skipRestAction','changePack','undoRow','undoLabel','undoButton'].map(id=>[id,document.getElementById(id)]));
let current;
let skipRestRequest=null;
let restStateVersion=0;
function canSkipRest(payload) {
  return payload?.timer?.phase!=='focus' && ['focusComplete','breakRunning'].includes(payload?.view);
}
function disableSkipControls(disabled) {
  el.skipRestAction.disabled=disabled;
  if(current?.view==='breakRunning')el.secondaryAction.disabled=disabled;
}
async function skipRest() {
  if (!canSkipRest(current) || skipRestRequest?.restId===current.restId) return;
  const request={restId:current.restId,stateVersion:restStateVersion};
  skipRestRequest=request;disableSkipControls(true);el.skipRestAction.title='';el.secondaryAction.title='';
  try {
    const result=await api.skipBreak();
    if (skipRestRequest===request && result?.timer?.phase==='focus') {
      // Keep old click handlers phase-guarded, but let undo restore this same restId.
      skipRestRequest=null;
      if (current?.restId===request.restId && restStateVersion===request.stateVersion) {
        current={...current,timer:result.timer};
      }
      disableSkipControls(!canSkipRest(current));
    }
  }
  catch(error) {
    if (skipRestRequest===request) {
      skipRestRequest=null;
      disableSkipControls(false);
      el.skipRestAction.title='未能跳过休息，请重试';
      if(current?.view==='breakRunning')el.secondaryAction.title=el.skipRestAction.title;
    }
    console.error('Unable to skip rest:',error);
  }
}
function formatTime(seconds) {const s=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function action(button,label,method) {
  button.hidden=!label;button.textContent=label || '';button.onclick=method ? ()=>api[method]() : null;
}
el.mascot.addEventListener('error',()=>{
  if(current?.appearance?.mode==='paired') {
    el.mascot.hidden=true;el.mascot.alt='云朵小睡图片暂不可用';
    return;
  }
  if (!el.mascot.src.endsWith('01-window-tea.png')) el.mascot.src='../../assets/rest-reminders/01-window-tea.png';
});
function render(payload) {
  if (!payload?.pack || !payload?.timer) return;
  // Running countdown refreshes are not a new action. An idle/paused snapshot can
  // restore the same rest via undo, so it must outrank an older skip response.
  if (!current || payload.restId!==current.restId || payload.timer.phase!==current.timer.phase
    || payload.timer.status!=='running') restStateVersion++;
  current=payload;
  const {view,pack,timer}=payload;
  el.undoRow.hidden=!payload.undo || payload.undo.expiresAt<=Date.now();
  el.undoLabel.textContent=payload.undo?.label || '';
  el.changePack.hidden=view==='focusAutoStarted' || payload.canChangePack===false;
  el.reminderCard.dataset.view=view;
  const image=new URL(pack.image,window.location.href).href;
  if (el.mascot.src!==image) {el.mascot.hidden=false;el.mascot.src=image;}
  const running=view==='breakRunning';
  const text=pack[running?'running':view==='focusComplete'?'start':'finished'];
  el.title.textContent=view==='focusAutoStarted'?'下一轮已经开始啦':text.title;
  el.body.textContent=text.body;
  el.badge.textContent=running ? `${timer.phase==='longBreak'?'长休息':'短休息'} · ${timer.status==='paused'?'已暂停':'正在进行'}` : view==='focusComplete'?'专注完成 · 歇一会儿':'休息完成 · 慢慢回来';
  el.timer.hidden=!running;el.progress.hidden=!running;
  el.timer.textContent=formatTime(timer.remainingSeconds);
  el.progressFill.style.width=`${Math.max(0,Math.min(100,(1-timer.remainingMs/timer.totalMs)*100))}%`;
  el.actions.hidden=view==='focusAutoStarted';
  action(el.skipRestAction,canSkipRest(payload)?(view==='focusComplete'?'跳过':'跳过休息'):null);
  el.skipRestAction.hidden=view!=='focusComplete' || !canSkipRest(payload);
  el.skipRestAction.onclick=canSkipRest(payload)?skipRest:null;
  el.secondaryAction.disabled=false;
  if (running) {
    action(el.primaryAction,timer.status==='running'?'暂停':'继续','togglePause');
    action(el.secondaryAction,'跳过休息');el.secondaryAction.onclick=skipRest;
    action(el.tertiaryAction,'收起','collapse');
  } else if(view==='focusComplete') {
    action(el.primaryAction,'休息','startBreak');action(el.secondaryAction,'2分钟后提醒','snooze');action(el.tertiaryAction);
  } else {
    action(el.primaryAction,'开始专注','startFocus');action(el.secondaryAction,'再休息 2 分钟','extendBreak');action(el.tertiaryAction);
  }
  disableSkipControls(skipRestRequest!==null && skipRestRequest.restId===payload.restId);
}
el.changePack.addEventListener('click',()=>api.changePack());
el.undoButton.addEventListener('click',()=>window.mintTimer.undoTimer());
api.onState(render);
api.getState().then(render);
