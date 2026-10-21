const durationFields = ['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakInterval'];
const toggleFields = ['autoStartBreak', 'autoStartFocus', 'soundEnabled', 'notificationsEnabled', 'alwaysOnTop', 'launchAtLogin'];
let roleCatalog = '';
let retryAction=null;
let requestError=null;
function showRequestError(message){
  const node=document.querySelector('#settingsError');
  const changed=node.textContent!==(message||'');
  node.textContent=message||'';
  document.querySelector('#retrySettings').hidden=!retryAction;
  if(message&&changed)node.parentElement.scrollIntoView({block:'nearest'});
}
async function submit(action){
  retryAction=action;requestError=null;
  try{const state=await action();if(state){if(!state.settingsError&&!state.startupError)retryAction=null;render(state);}}
  catch{requestError='设置未能保存，请重试。';showRequestError(requestError);}
}
async function save(patch) {return submit(()=>window.mintTimer.updateSettings(patch));}

function outputText(field, value) {
  return field === 'longBreakInterval' ? `${value} 次` : `${value} min`;
}

function updateRangeOutput(input) {
  const output = document.querySelector(`output[for="${input.id}"]`);
  output.textContent = outputText(input.id, input.value);
}

function render({ settings, reminderPacks = [], companionThemes = [], shortcutError = null, appearance = null,settingsError=null,startupError=null,startupUnavailable=false }) {
  showRequestError(requestError||settingsError||startupError);
  const startup=document.querySelector('#launchAtLogin');startup.disabled=startupUnavailable;
  startup.closest('label').querySelector('small').textContent=startupUnavailable?'此外观预览版不支持开机启动':'登录 Windows 后自动打开番茄钟；移动程序后请重新打开一次';
  const paired=appearance?.mode==='paired';
  const hint=document.querySelector('#companionHint'),detail=document.querySelector('#companionDetail');
  const themeNames=companionThemes.map(theme=>`${theme.workName} / ${theme.restName}`).join('；');
  if(hint)hint.textContent=paired?`已接入${companionThemes.length||1}套：${themeNames||`${appearance.workName} / ${appearance.restName}`}。`:'三套已确认外观自动轮换：围巾写计划、耳机电脑、云朵小桌学习。';
  if(detail)detail.textContent=paired?`当前工作：${appearance.workName}；对应休息：${appearance.restName}。休息后整套轮换，暂停和重置不换主题。`:'每轮专注换一位伙伴；暂停、继续和重置时保持当前外观。';
  const shortcut = document.querySelector('#pauseShortcut');
  if (document.activeElement !== shortcut) shortcut.value = settings.pauseShortcut || '';
  document.querySelector('#shortcutError').textContent = shortcutError || '';
  const catalog = JSON.stringify([paired,reminderPacks]);
  if (catalog !== roleCatalog) {
    roleCatalog = catalog;
    const grid = document.querySelector('#reminderPacks');
    grid.replaceChildren();
    for (const pack of reminderPacks) {
      const label = document.createElement('label'); label.className = 'role-option';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = pack.id; input.name = 'enabledReminderIds';
      input.disabled=paired;
      const image = document.createElement('img'); image.src = pack.image; image.alt = '';
      const name = document.createElement('span'); name.textContent = pack.name;
      label.append(input, image, name); grid.append(label);
      input.addEventListener('change', () => {
        const enabledReminderIds = [...grid.querySelectorAll('input:checked')].map(node => node.value);
        if (!enabledReminderIds.length) { input.checked = true; document.querySelector('#roleHint').textContent = '至少保留一个休息角色。'; return; }
        document.querySelector('#roleHint').textContent = '至少选一个；取消当前角色只影响后续休息。';
        save({ enabledReminderIds });
      });
    }
  }
  for (const input of document.querySelectorAll('input[name="enabledReminderIds"]')) input.checked = paired || (settings.enabledReminderIds || reminderPacks.map(pack => pack.id)).includes(input.value);
  if(paired)document.querySelector('#roleHint').textContent='工作小人、休息迷你条和中央卡片成套对应；以下为已接入的休息角色。';
  for (const field of durationFields) {
    const input = document.querySelector(`#${field}`);
    // 计时器每 250ms 广播一次状态；用户正拖动滑块时不回写旧值，
    // 否则滑块会被拽回去（output 文案已由 input 事件实时更新）。
    if (document.activeElement === input) continue;
    input.value = settings[field];
    updateRangeOutput(input);
  }
  for (const field of toggleFields) {
    document.querySelector(`#${field}`).checked = settings[field];
  }
  startup.indeterminate=Boolean(startupError);
  startup.setAttribute('aria-label',startupError?'开机启动：系统状态未知，保留原偏好':'开机自动启动');
}

for (const field of durationFields) {
  const input = document.querySelector(`#${field}`);
  input.addEventListener('input', () => updateRangeOutput(input));
  input.addEventListener('change', () => save({ [field]: Number(input.value) }));
}

for (const field of toggleFields) {
  const input = document.querySelector(`#${field}`);
  input.addEventListener('change', () => save({ [field]: input.checked }));
}

document.querySelector('#closeButton').addEventListener('click', () => window.mintTimer.closeSettings());
document.querySelector('#resetDefaults').addEventListener('click', () => submit(()=>window.mintTimer.resetSettings()));
document.querySelector('#retrySettings').addEventListener('click',()=>{if(retryAction)void submit(retryAction);});
document.querySelector('#saveShortcut').addEventListener('click', async () => {
  const input = document.querySelector('#pauseShortcut');
  const pauseShortcut = input.value.trim();
  if (!/^(?=.*(?:Ctrl|Control|Alt|Shift|CommandOrControl|Super)\+).+\+[^+]+$/i.test(pauseShortcut)) {
    document.querySelector('#shortcutError').textContent = '请输入组合键，例如 Ctrl+Alt+P；不能只用单个字符。'; return;
  }
  input.blur(); await save({ pauseShortcut });
});
document.querySelector('#disableShortcut').addEventListener('click', () => { document.querySelector('#pauseShortcut').blur(); save({ pauseShortcut: '' }); });

window.mintTimer.onState(render);
window.mintTimer.getState().then(render);
