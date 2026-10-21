/* Paired mini artwork; legacy FocusSkinView remains independent. */
(() => {
  const files = new Map();
  const allowed = new Set(['cloud','checklist','scarf','headphones','watering-sprout','book-nook','hammock','picnic','bubble','stars']
    .flatMap(id=>[`${id}-work`,`${id}-rest`]));
  const progressWidth = 527.3903095558546;
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
    }
    async render(timer, appearance) {
      const id = appearance?.miniAssetId;
      if (appearance?.mode !== 'paired' || !allowed.has(id)) { this.deactivate(); return; }
      this.latest = timer;
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
    update() {
      const timer = this.latest;
      const svg = this.mount.querySelector('svg');
      if (!timer || !svg) return;
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
