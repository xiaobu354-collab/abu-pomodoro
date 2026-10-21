/* Approved v2 SVG skins: artwork is fixed; only live timer fields change. */
(() => {
  const files = new Map();
  const ids = ['01', '02', '03'];
  const pad = value => String(value).padStart(2, '0');
  class FocusSkinView {
    constructor(mount, bar) {
      this.mount = mount;
      this.bar = bar;
      this.currentId = null;
      this.requestedId = null;
      this.latest = null;
    }

    render(timer) {
      this.latest = timer;
      const id = ids.includes(timer.focusSkinId) ? timer.focusSkinId : '01';
      if (this.currentId === id) { this.requestedId = id; this.update(); return; }
      if (this.requestedId === id) return;
      this.requestedId = id;
      if (!files.has(id)) files.set(id, fetch(`../../assets/focus-skins/${id}.svg`).then(response => {
        if (!response.ok) throw new Error(`皮肤读取失败：${id}`);
        return response.text();
      }));
      files.get(id).then(source => {
        if (this.requestedId !== id) return;
        const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
        if (svg.localName !== 'svg' || svg.querySelector('parsererror')) throw new Error(`皮肤格式错误：${id}`);
        this.mount.replaceChildren(document.importNode(svg, true));
        this.currentId = id;
        this.bar.dataset.focusSkin = id;
        this.bar.dataset.skinReady = 'true';
        this.bar.removeAttribute('data-skin-error');
        this.update();
      }).catch(error => {
        // Keep the existing working mini visible if a packaged skin is damaged.
        files.delete(id);
        if (this.requestedId !== id) return;
        this.requestedId = null;
        this.bar.dataset.skinError = id;
        console.error(error);
      });
    }

    update() {
      const timer = this.latest;
      const svg = this.mount.querySelector('svg');
      if (!timer || !svg) return;
      const remainingSeconds = Math.max(0, Math.ceil(timer.remainingSeconds));
      svg.querySelector('[data-geometry="timeInk"]').textContent = `${pad(Math.floor(remainingSeconds / 60))}:${pad(remainingSeconds % 60)}`;
      const ratio = timer.totalMs > 0 ? Math.min(1, Math.max(0, 1 - timer.remainingMs / timer.totalMs)) : 0;
      svg.querySelector('[data-geometry="progressFill"]').setAttribute('width', ratio * 631);
      svg.dataset.running = String(timer.status === 'running');
    }
  }
  window.FocusSkinView = FocusSkinView;
})();
