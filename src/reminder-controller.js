const { REMINDER_PACK_IDS, getReminderPack } = require('./reminder-content');
const { normalizeRotation, takeNextPack, releaseCurrentPack } = require('./reminder-rotation');
const VIEWS = ['focusComplete','breakRunning','breakComplete','focusAutoStarted'];
class ReminderController {
  constructor({timer, loadState, saveState, view, fallbackNotify, onTimerChanged,
    dateKey, now = ()=>Date.now(), random = Math.random, getEnabledIds=()=>REMINDER_PACK_IDS,
    onVisibilityChanged=()=>{},getUndo=()=>null,getPreferredPackId=()=>null,getAppearance=()=>null}) {
    Object.assign(this, {timer,saveState,view,fallbackNotify,onTimerChanged,dateKey,now,random,getEnabledIds,onVisibilityChanged,getUndo,getPreferredPackId,getAppearance});
    const saved = loadState() || {};
    this.state = normalizeRotation(saved,dateKey(),getEnabledIds(),random);
    this.viewName = VIEWS.includes(saved.viewName) ? saved.viewName : null;
    this.visible = Boolean(saved.visible && this.viewName);
    this.snoozeUntil = Number.isFinite(saved.snoozeUntil) ? saved.snoozeUntil : null;
    this.autoHideAt = null;
    this.sequence = 0;
    this.restId=Number.isSafeInteger(saved.restId)?saved.restId:0;
    this.variantIndex=Number.isInteger(saved.variantIndex)?Math.max(0,Math.min(2,saved.variantIndex)):0;
    this.position=saved.position || null;
  }
  persist() {
    this.saveState(this.exportState());
  }
  exportState() {
    return {...this.state,viewName:this.viewName,visible:this.visible,snoozeUntil:this.snoozeUntil,
      restId:this.restId,variantIndex:this.variantIndex,position:this.view.capturePosition?.(this.restId) || this.position,autoHideAt:this.autoHideAt};
  }
  async restoreState(saved) {
    ++this.sequence;
    this.view.hide();
    this.state=normalizeRotation(saved,this.dateKey(),this.getEnabledIds(),this.random);
    this.viewName=saved.viewName;this.visible=saved.visible;this.snoozeUntil=saved.snoozeUntil;
    this.restId=saved.restId;this.variantIndex=saved.variantIndex;this.position=saved.position;
    this.autoHideAt=saved.autoHideAt;
    this.view.restorePosition?.(this.position);
    this.persist();this.onVisibilityChanged(this.visible);
    if(this.visible)await this.showCurrent();
  }
  getPayload() {
    if (!this.state.currentId || !this.viewName) return {visible:false};
    return {visible:this.visible,view:this.viewName,pack:getReminderPack(this.state.currentId,this.variantIndex),
      timer:this.timer.snapshot(),restId:this.restId,position:this.position,undo:this.getUndo(),
      appearance:this.getAppearance(this.state.currentId),canChangePack:!this.getPreferredPackId()};
  }
  selectPack() {
    if(!this.state.currentId) this.variantIndex=Math.floor(this.random()*3);
    const preferred=this.getPreferredPackId();
    if(preferred && !this.state.currentId) {
      if(!this.getEnabledIds().includes(preferred) || !REMINDER_PACK_IDS.includes(preferred)) throw new Error('Paired rest role is not available');
      this.state={...this.state,currentId:preferred,lastId:preferred};
      return;
    }
    this.state = takeNextPack(this.state,this.dateKey(),this.getEnabledIds(),this.random).state;
  }
  async showCurrent() {
    const seq = ++this.sequence;
    this.visible = true; this.persist();this.onVisibilityChanged(true);
    let shown = false;
    try {shown = await this.view.show(this.getPayload());} catch {shown = false;}
    if (!shown && seq === this.sequence && this.visible) {
      this.visible=false;this.persist();this.onVisibilityChanged(false);
      this.fallbackNotify({fromPhase:['focusComplete','breakRunning'].includes(this.viewName) ? 'focus' : 'shortBreak',toPhase:this.timer.phase});
    }
  }
  async onPhaseCompleted(completed) {
    if (!completed) return;
    this.snoozeUntil = null; this.autoHideAt = null;
    if (completed.phase === 'focus') {
      this.state = releaseCurrentPack(this.state);
      this.restId+=1;this.position=null;
      this.selectPack();
      this.viewName = this.timer.status === 'running' ? 'breakRunning' : 'focusComplete';
    } else {
      this.selectPack();
      this.viewName = this.timer.status === 'running' ? 'focusAutoStarted' : 'breakComplete';
      if (this.viewName === 'focusAutoStarted') this.autoHideAt = this.now()+3000;
    }
    this.onTimerChanged();
    return this.showCurrent();
  }
  async startBreak() {
    if (this.viewName !== 'focusComplete' || this.timer.phase === 'focus') return;
    this.snoozeUntil = null;
    this.timer.start(); this.viewName='breakRunning'; this.onTimerChanged();
    return this.showCurrent();
  }
  togglePause(currentTime = this.now()) {
    if (this.viewName !== 'breakRunning' || this.timer.phase === 'focus') return;
    const result = this.timer.tick(currentTime);
    // An expired rest belongs to the completion flow, not to this old pause click.
    if (result.completed) return this.onPhaseCompleted(result.completed);
    this.timer.toggle(currentTime); this.onTimerChanged(); this.persist(); this.refresh();
  }
  async finishBreak() {
    if (this.viewName !== 'breakRunning' || this.timer.phase === 'focus') return;
    return this.onPhaseCompleted(this.timer.complete().completed);
  }
  snooze() {
    if (this.viewName !== 'focusComplete') return;
    this.snoozeUntil=this.now()+120_000; this.collapse();
  }
  collapse() { this.visible=false; ++this.sequence; this.view.hide(); this.persist();this.onVisibilityChanged(false); }
  startFocus() {
    if (this.viewName !== 'breakComplete' || this.timer.phase !== 'focus') return;
    this.timer.start(); this.dismiss(); this.onTimerChanged();
  }
  async extendBreak() {
    if (this.viewName !== 'breakComplete' || this.timer.phase !== 'focus') return;
    this.timer.startBreakExtension(120_000); this.viewName='breakRunning';
    this.onTimerChanged(); return this.showCurrent();
  }
  dismiss() {
    this.snoozeUntil=null; this.autoHideAt=null; this.viewName=null;
    this.state=releaseCurrentPack(this.state); this.collapse();
  }
  async ensureRunningBreak() {
    if(!this.state.currentId){this.restId+=1;this.position=null;}
    this.selectPack(); this.viewName='breakRunning'; return this.showCurrent();
  }
  async syncTimerAction() {
    if (this.timer.phase !== 'focus') {
      if (!this.state.currentId) return this.ensureRunningBreak();
      this.snoozeUntil=null; this.viewName=this.timer.status==='idle'?'focusComplete':'breakRunning'; this.persist(); this.refresh();
    } else this.dismiss();
  }
  refresh() { if (this.visible) this.view.update(this.getPayload()); }
  resetForDate() {this.state=normalizeRotation(this.state,this.dateKey(),this.getEnabledIds(),this.random);this.persist();}
  reposition() {this.view.reposition();}
  async tick() {
    if (this.snoozeUntil && this.now()>=this.snoozeUntil) {
      this.snoozeUntil=null; return this.showCurrent();
    }
    if (this.autoHideAt && this.now()>=this.autoHideAt) this.dismiss();
  }
  restoreVisibleState() {this.snoozeUntil=null;return this.viewName && this.state.currentId ? this.showCurrent() : Promise.resolve();}
  async changePack() {
    if(!this.viewName || !this.state.currentId)return;
    if(this.getPreferredPackId())return;
    const ids=this.getEnabledIds();
    if(ids.length===1 && ids[0]===this.state.currentId)return;
    this.state=releaseCurrentPack(this.state);this.selectPack();this.persist();this.refresh();
  }
  handleViewFailure() {this.visible=false;++this.sequence;this.persist();this.onVisibilityChanged(false);}
  async restore() {
    if (this.timer.phase !== 'focus' && !this.viewName) {
      this.viewName=this.timer.status==='idle' ? 'focusComplete' : 'breakRunning';
      this.visible=true;
    }
    if (this.viewName && !this.state.currentId) this.selectPack();
    if (this.viewName && this.state.currentId) {
      const breakPhase=this.timer.phase!=='focus';
      if ((['focusComplete','breakRunning'].includes(this.viewName))!==breakPhase) {this.dismiss(); return;}
      if (this.viewName==='focusAutoStarted') this.autoHideAt=this.now()+3000;
      if (this.snoozeUntil) return this.tick();
      if (this.visible) return this.showCurrent();
    }
  }
  destroy() {++this.sequence; this.view.destroy();}
}
module.exports = {ReminderController};
