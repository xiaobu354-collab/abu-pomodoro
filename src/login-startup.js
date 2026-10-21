const path=require('node:path');

// Query has no name parameter in Electron: filter returned entries explicitly.
function createLoginStartup({app,packaged,paired=false,skin=false,smoke=false,execPath,getKnownPath=()=>null}){
  const unavailable=skin&&!paired;
  const isolated=smoke||!packaged;
  const name=paired?'MintPomodoro-CloudPairedTrial':'MintPomodoro';
  const launchPath=paired?execPath:path.join(path.dirname(path.dirname(execPath)),'MintPomodoro.exe');
  let hasEntry=false;
  function ownItems(candidate,args=[]){
    const result=app.getLoginItemSettings({path:candidate,args});
    if(!Array.isArray(result.launchItems))throw Error('无法核实系统启动项状态');
    return result.launchItems.filter(item=>item.name===name&&item.scope!=='machine');
  }
  function verifyWrite(value){
    const items=ownItems(value.path,value.args);
    if(value.openAtLogin){
      return items.some(item=>item.path===value.path&&Boolean(item.enabled)===Boolean(value.enabled)
        &&JSON.stringify(item.args||[])===JSON.stringify(value.args));
    }
    // Removal must not be mistaken for success while a known old entry remains.
    if(items.length)return false;
    const known=getKnownPath();
    return !known||known===value.path||ownItems(known).length===0;
  }
  function snapshot(){
    if(unavailable||isolated)return null;
    for(const candidate of [...new Set([launchPath,getKnownPath()].filter(Boolean))]){
      const own=ownItems(candidate).at(0);
      if(own)return {name,path:own.path||candidate,args:[...(own.args||[])],enabled:Boolean(own.enabled)};
    }
    return null;
  }
  function read(preference=false){
    if(unavailable)return false;
    if(isolated)return Boolean(preference);
    const own=snapshot();
    hasEntry=Boolean(own);
    return Boolean(own?.enabled);
  }
  function restore(saved){
    if(unavailable||isolated)return;
    const value=saved?{...saved,openAtLogin:true}:{name,path:launchPath,args:[],openAtLogin:false,enabled:false};
    app.setLoginItemSettings(value);
    if(!verifyWrite(value))throw Error('无法确认启动项已恢复');
  }
  function apply(enabled){
    if(unavailable)return false;
    if(isolated)return Boolean(enabled);
    const value={openAtLogin:Boolean(enabled),enabled:Boolean(enabled),path:launchPath,args:[],name};
    app.setLoginItemSettings(value);
    if(!verifyWrite(value))throw Error('Windows 未接受启动项更改，请检查系统启动应用设置');
    hasEntry=value.openAtLogin;
    return value.enabled;
  }
  return {read,apply,snapshot,restore,launchPath,unavailable,isolated,get hasEntry(){return hasEntry;}};
}
module.exports={createLoginStartup};
