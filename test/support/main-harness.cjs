const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {EventEmitter}=require('node:events');
async function boot({auto=false, failWindow=false, saved={}, mode='full', rawData=null, blockedShortcuts=[],args=[],cardLoad='ok',packaged=false,loginItems=[],loginFailure=false}={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reminder-test-'));
  fs.writeFileSync(path.join(dir,'preferences.json'),rawData === null ? JSON.stringify({settings:{focusMinutes:5,shortBreakMinutes:1,autoStartNext:auto},windowMode:mode,...saved}) : rawData);
  const handlers=new Map(), windows=[],notifications=[],events=new Map(),screenEvents=new Map(),logs=[];
  let now=Date.now(), tick, trayMenu=[], popupMenu=[], exitCode=null;
  const shortcuts=new Map();
  let failWrites=false;
  const loginCalls=[];
  const mockFs={...fs,writeFileSync(...args){if(failWrites)throw Error('SIMULATED_EACCES');return fs.writeFileSync(...args);}};
  class Win extends EventEmitter {
    constructor(options) {
      super();if(failWindow && options.width===520) throw new Error('window failed');
      this.options=options;this.visible=false;this.destroyed=false;this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};
      this.sent=[];this.webContents=new EventEmitter();
      this.webContents.isLoading=()=>false;
      this.webContents.send=(channel,payload)=>this.sent.push({channel,payload});
      windows.push(this);
    }
    loadFile(file) {this.file=file;
      if(this.options.width===520 && cardLoad==='reject')return Promise.reject(new Error('card load rejected'));
      if(this.options.width===520 && cardLoad==='hang')return new Promise(()=>{});
      queueMicrotask(()=>{this.emit('ready-to-show');this.webContents.emit('did-finish-load');});return Promise.resolve();}
    show(){this.visible=true;} hide(){this.visible=false;} focus(){} setAlwaysOnTop(){}
    isVisible(){return this.visible;} isDestroyed(){return this.destroyed;}
    getBounds(){return {...this.bounds};} setBounds(bounds){this.bounds={...bounds};}
    destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
    close(){const event={prevented:false,preventDefault(){this.prevented=true;}};this.emit('close',event);if(!event.prevented)this.destroy();}
  }
  const electron={
    app:{commandLine:{appendSwitch(){}},isPackaged:packaged,requestSingleInstanceLock:()=>true,quit(){},exit(code){exitCode=code;},setPath(){},setAppUserModelId(){},getPath:()=>dir,
      getLoginItemSettings(query){loginCalls.push(['get',query]);if(loginFailure)throw Error('OS_DENIED');return {launchItems:loginItems.filter(item=>(item.path||process.execPath)===query.path)};},
      setLoginItemSettings(value){loginCalls.push(['set',value]);if(loginFailure)throw Error('OS_DENIED');loginItems=value.openAtLogin?[{...value,enabled:value.enabled!==false}]:[];},
      on:(name,fn)=>events.set(name,fn),whenReady:()=>Promise.resolve()},
    BrowserWindow:Win,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},Menu:{buildFromTemplate:x=>Object.assign(x,{popup(){popupMenu=x;}})},
    globalShortcut:{register(key,fn){if(blockedShortcuts.includes(key))return false;shortcuts.set(key,fn);return true;},unregister(key){shortcuts.delete(key);},unregisterAll(){shortcuts.clear();}},
    Tray:class {on(){} setToolTip(){} setContextMenu(menu){trayMenu=menu;}},
    Notification:class extends EventEmitter {static isSupported(){return true;} constructor(options){super();this.options=options;notifications.push(this);}show(){}},
    screen:{on:(name,fn)=>screenEvents.set(name,fn),getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),
      getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),getAllDisplays:()=>[{workArea:{x:0,y:0,width:1920,height:1080}}]}
  };
  const mainPath=path.join(__dirname,'../../src/main.js');
  const nodeRequire=createRequire(mainPath),cache=new Map();
  function localRequire(id,from=mainPath) {
    if(id==='electron')return electron;
    if(id==='node:fs')return mockFs;
    if(!id.startsWith('.'))return nodeRequire(id);
    const resolved=createRequire(from).resolve(id);
    if(cache.has(resolved))return cache.get(resolved).exports;
    const module={exports:{}};cache.set(resolved,module);
    const ctx={module,exports:module.exports,require:x=>localRequire(x,resolved),__dirname:path.dirname(resolved),
      process:{argv:['node',mainPath,...args],execPath:process.execPath,cwd:()=>dir},console:{...console,error:(...args)=>logs.push(args.join(' '))},
      Date:class extends Date {static now(){return now;}},setTimeout:(fn,ms,...args)=>setTimeout(fn,cardLoad==='hang' && ms===8000?10:ms,...args),clearTimeout,
      setInterval:fn=>{tick=fn;return 1;},clearInterval(){}};
    vm.runInNewContext(fs.readFileSync(resolved,'utf8'),ctx,{filename:resolved});
    return module.exports;
  }
  localRequire('./main');
  const flush=()=>new Promise(r=>setImmediate(r));await flush();await flush();
  return {windows,notifications,handlers,events,screenEvents,dir,flush,shortcuts,logs,loginCalls,
    failWrites(value=true){failWrites=value;},
    setLoginItems(items){loginItems=items;},getLoginItems(){return loginItems;},
    get trayMenu(){return trayMenu;},get popupMenu(){return popupMenu;},
    get exitCode(){return exitCode;},
    async invoke(channel,...args){const result=await handlers.get(channel)({},...args);await flush();return result;},
    async advance(ms){now+=ms;tick();await flush();},
    saved(){return JSON.parse(fs.readFileSync(path.join(dir,'preferences.json'),'utf8'));},
    close(){events.get('will-quit')?.();}};
}
module.exports={boot};
