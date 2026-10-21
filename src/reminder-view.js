const path=require('node:path');
const {createReminderWindow, positionReminderWindow,constrainReminderWindow}=require('./reminder-window');
function createReminderView({getAnchor,onFailure,onPositionChanged=()=>{},onClose=()=>{},canClose=()=>false}) {
  let win=null,loading=null,latest=null,wantsVisible=false,positionedRestId=null;
  function update(payload) {
    latest=payload;
    if(win && !win.isDestroyed() && !loading && !win.webContents.isLoading()) win.webContents.send('reminder:state',payload);
  }
  return {
    async show(payload) {
      latest=payload;wantsVisible=true;
      try {
        if(!win || win.isDestroyed()) {
          const created=createReminderWindow();win=created;
          positionedRestId=null;
          created.on('closed',()=>{if(win===created){win=null;loading=null;}});
          created.on('close',event=>{
            if(wantsVisible && !canClose()){event.preventDefault();onClose();}
          });
          created.on('move',()=>onPositionChanged(created.getBounds()));
          created.webContents.on('render-process-gone',()=>{
            if(wantsVisible) onFailure();
            created.destroy();
          });
          const pageLoad=created.loadFile(path.join(__dirname,'renderer','reminder.html'));
          let timeout;
          loading=Promise.race([pageLoad,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Reminder page load timed out')),8000);})])
            .finally(()=>clearTimeout(timeout));
        }
        if(loading) {await loading;loading=null;}
        if(!win || win.isDestroyed()) return false;
        if(positionedRestId!==latest.restId || positionedRestId===null) {
          if(latest.position) constrainReminderWindow(win,latest.position);
          else positionReminderWindow(win,getAnchor());
          positionedRestId=latest.restId;
        }
        update(latest);
        if(wantsVisible) win.show();
        onPositionChanged(win.getBounds());
        return true;
      } catch(error) {
        console.error('Reminder window unavailable:',error.message);
        if(win && !win.isDestroyed()) win.destroy();
        win=null;loading=null;
        return false;
      }
    },
    update,
    hide(){wantsVisible=false;if(win && !win.isDestroyed())win.hide();},
    reposition(){constrainReminderWindow(win);},
    capturePosition(restId){return win && !win.isDestroyed() && (restId===undefined || restId===positionedRestId) ? win.getBounds() : null;},
    restorePosition(bounds){if(bounds)constrainReminderWindow(win,bounds);},
    destroy(){wantsVisible=false;if(win && !win.isDestroyed())win.destroy();},
    getWindow(){return win;}
  };
}
module.exports={createReminderView};
