/* Paired mini artwork; legacy FocusSkinView remains independent. */
(() => {
  const files = new Map();
  const allowed = new Set(['cloud','checklist','scarf','headphones','watering-sprout','book-nook','hammock','picnic','bubble','stars']
    .flatMap(id=>[`${id}-work`,`${id}-rest`]));
  const progressWidth = 527.3903095558546;
  // Approved C3 visible-ink slot, in the SVG's 4.6x native coordinates.
  const undoSlot = { x:904.2804634925975, y:50.27537012113054, width:170.559375, height:82.8 };
  class CompanionSkinView {
    constructor(mount, bar) {
      this.mount = mount;
      this.bar = bar;
      this.currentId = null;
      this.request = 0;
      this.pendingId = null;
    }
    deactivate() {
      this.request += 1;
      this.pendingId = null;
      this.latest = null;
      delete this.bar.dataset.companionReady;
      delete this.bar.dataset.companionSkin;
      delete this.bar.dataset.companionUndo;
    }
    async render(timer, appearance, undo = null) {
      const id = appearance?.miniAssetId;
      if (appearance?.mode !== 'paired' || !allowed.has(id)) { this.deactivate(); return; }
      this.latest = timer;
      this.latestUndo = undo;
      if (this.currentId === id) {
        this.request += 1;
        this.pendingId = null;
        this.bar.dataset.companionReady = 'true';
        this.bar.dataset.companionSkin = id;
        this.update();
        return;
      }
      if (this.pendingId === id) return this.pending;
      this.pendingId = id;
      const request = ++this.request;
      if (!files.has(id)) files.set(id, fetch(`../../assets/companion-skins/${id}.svg`).then(response => {
        if (!response.ok) throw new Error(`成套皮肤读取失败：${id}`);
        return response.text();
      }).catch(error => { files.delete(id); throw error; }));
      this.pending = files.get(id).then(source => {
        if (request !== this.request) return;
        const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
        if (svg.localName !== 'svg' || svg.querySelector('parsererror')) throw new Error(`成套皮肤格式错误：${id}`);
        this.mount.replaceChildren(document.importNode(svg, true));
        const mounted = this.mount.querySelector('svg');
        const pause = mounted.querySelector('[data-geometry="icon-pause"]');
        const play = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        play.setAttribute('class', 'companion-play');
        play.setAttribute('d', 'M5 0 L47 24 L5 48 Z');
        play.setAttribute('fill', `url(#${id}-cream-button)`);
        play.setAttribute('filter', `url(#${id}-icon04-relief)`);
        pause.append(play);
        this.installUndo(mounted,id);
        this.currentId = id;
        this.pendingId = null;
        this.bar.dataset.companionReady = 'true';
        this.bar.dataset.companionSkin = id;
        delete this.bar.dataset.companionError;
        this.update();
      }).catch(error => {
        if (request !== this.request) return;
        this.pendingId = null;
        this.bar.dataset.companionError = id;
        console.error(error);
      });
      return this.pending;
    }
    installUndo(svg,id) {
      const group=svg.querySelector('[data-part="pause"]').cloneNode(true);
      group.setAttribute('data-part','inline-undo');group.setAttribute('data-fm-ids','FM.N.C3.undo');
      const icon=group.querySelector('[data-geometry="icon-pause"]');icon.replaceChildren();
      const base=group.querySelector('[data-geometry="button-pause"]');
      const oldX=+base.getAttribute('x'),oldY=+base.getAttribute('y'),oldW=+base.getAttribute('width');
      for(const rect of group.querySelectorAll('rect')){
        const dx=+rect.getAttribute('x')-oldX,dy=+rect.getAttribute('y')-oldY;
        rect.setAttribute('x',undoSlot.x+dx);rect.setAttribute('y',undoSlot.y+dy);
        rect.setAttribute('width',undoSlot.width-(oldW-(+rect.getAttribute('width'))));
        rect.setAttribute('height',undoSlot.height-dy*2);
      }
      base.setAttribute('data-geometry','undo-button');
      icon.setAttribute('data-geometry','undo-icon');
      const scale=undoSlot.height*.60/23;
      icon.setAttribute('transform',`translate(${undoSlot.x+undoSlot.width/2-12*scale},${undoSlot.y+undoSlot.height/2-13.5*scale}) scale(${scale})`);
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','path');
      for(const [key,value]of Object.entries({d:'M9 14 L4 9 L9 4 M4 9 H13 A7 7 0 0 1 13 23 H10',fill:'none',stroke:'var(--cream-light)','stroke-width':'3.5','stroke-linecap':'round','stroke-linejoin':'round',filter:`url(#${id}-icon04-relief)`}))arrow.setAttribute(key,value);
      icon.append(arrow);svg.querySelector('[data-geometry="phaseInk"]').after(group);
    }
    update() {
      const timer = this.latest;
      const svg = this.mount.querySelector('svg');
      if (!timer || !svg) return;
      const undoActive=Boolean(this.latestUndo&&this.latestUndo.expiresAt>Date.now());
      svg.dataset.undo=String(undoActive);this.bar.dataset.companionUndo=String(undoActive);
      const seconds = Math.max(0, Math.ceil(timer.remainingSeconds));
      const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      svg.querySelectorAll('[data-geometry="timeInk"]').forEach(node => { node.textContent = text; });
      const ratio = timer.totalMs > 0 ? Math.min(1, Math.max(0, 1 - timer.remainingMs / timer.totalMs)) : 0;
      svg.querySelectorAll('[data-geometry="progressFill"]').forEach(node => node.setAttribute('width', ratio * progressWidth));
      svg.dataset.running = String(timer.status === 'running');
    }
  }
  window.CompanionSkinView = CompanionSkinView;
})();
