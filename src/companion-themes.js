// A theme is eligible only when its work mini, rest mini and rest card all exist.
const COMPANION_THEMES = Object.freeze([
  Object.freeze({id:'cloud',name:'云朵',workName:'云朵写字',restName:'云朵小睡',
    workAssetId:'cloud-work',restAssetId:'cloud-rest',restPackId:'cloud-nap'}),
  Object.freeze({id:'checklist-stretch',name:'清单伙伴',workName:'清单助手',restName:'伸个懒腰',
    workAssetId:'checklist-work',restAssetId:'checklist-rest',restPackId:'stretch'}),
  Object.freeze({id:'scarf',name:'围巾伙伴',workName:'围巾写计划',restName:'窗边热饮',
    workAssetId:'scarf-work',restAssetId:'scarf-rest',restPackId:'window-tea'}),
  Object.freeze({id:'headphones',name:'耳机伙伴',workName:'耳机电脑',restName:'耳机小憩',
    workAssetId:'headphones-work',restAssetId:'headphones-rest',restPackId:'headphones-beanbag'}),
  Object.freeze({id:'watering-sprout',name:'绿植伙伴',workName:'绿植旁笔记',restName:'浇水发芽',
    workAssetId:'watering-sprout-work',restAssetId:'watering-sprout-rest',restPackId:'watering-sprout'}),
  Object.freeze({id:'book-nook',name:'读书伙伴',workName:'专心读书',restName:'角落读书',
    workAssetId:'book-nook-work',restAssetId:'book-nook-rest',restPackId:'book-nook'}),
  Object.freeze({id:'hammock',name:'微风伙伴',workName:'便携电脑办公',restName:'吊床微风',
    workAssetId:'hammock-work',restAssetId:'hammock-rest',restPackId:'hammock'}),
  Object.freeze({id:'picnic',name:'野餐伙伴',workName:'格子桌画草图',restName:'零食野餐',
    workAssetId:'picnic-work',restAssetId:'picnic-rest',restPackId:'snack-picnic'}),
  Object.freeze({id:'bubble',name:'泡泡伙伴',workName:'便签文件整理',restName:'泡泡放松',
    workAssetId:'bubble-work',restAssetId:'bubble-rest',restPackId:'bubble-soak'}),
  Object.freeze({id:'stars',name:'星光伙伴',workName:'星灯写字',restName:'抬头看星',
    workAssetId:'stars-work',restAssetId:'stars-rest',restPackId:'stargazing'})
]);

function themeForCycle(index=0) {
  const safe=Number.isSafeInteger(index)&&index>=0?index:0;
  return COMPANION_THEMES[safe%COMPANION_THEMES.length];
}

function getCompanionAppearance(timer,restPackId=null,forReminder=false) {
  // Legacy saves counted cloud rounds; the counter alone cannot identify a theme.
  const active=COMPANION_THEMES.find(theme=>theme.id===timer.companionThemeId)||COMPANION_THEMES[0];
  // A finished rest card belongs to its outgoing cycle, not the next work cycle.
  const restTheme=COMPANION_THEMES.find(theme=>theme.restPackId===restPackId);
  const isRest=forReminder||timer.phase!=='focus';
  const theme=isRest&&restTheme?restTheme:active;
  return {mode:'paired',themeId:theme.id,themeName:theme.name,workName:theme.workName,
    restName:theme.restName,restPackId:theme.restPackId,
    miniAssetId:isRest?theme.restAssetId:theme.workAssetId,viewport:{width:270,height:106}};
}

module.exports={COMPANION_THEMES,themeForCycle,getCompanionAppearance};
