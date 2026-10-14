'use strict';
const {app,BrowserWindow,Menu,Tray,Notification,session,ipcMain,shell,dialog,nativeImage,powerMonitor,clipboard,systemPreferences}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const role=require('./role.json');
const {MedicineTimers}=require('./medicine.cjs');
const {configureAutostart}=require('./autostart.cjs');
const {cameraPermission}=require('./camera.cjs');
const {APP_ORIGIN,clinicUrl,externalUrl,safeFilename,notificationUrl,notificationText,freshNotifications,previewPage}=require('./policy.cjs');
if(!['doctor','patient'].includes(role.role))throw Error('Invalid app role');
app.setName(role.name);app.setAppUserModelId(role.appId);
app.setPath('userData',path.join(app.getPath('appData'),role.name.replace(/ /g,'-')));
const smoke=process.env.CURAR_DESKTOP_SMOKE==='1';
// GitHub's Linux runner has a virtual display, rather than a hardware GPU.
// Use software rendering for its launch check; installed apps keep the default.
if(smoke&&process.platform==='linux')app.disableHardwareAcceleration();
const previewWindows=new Map();
let window,deviceSession,tray,quitting=false,polling=false,lastUser='',seen=new Set(),status='Sign in, then enable desktop notifications.';
let prefs={camera:false,notifications:false,keepRunning:true,startAtLogin:true,medicineBell:true,accounts:{}};
const prefsPath=path.join(app.getPath('userData'),'desktop-settings.json');
try{const saved=JSON.parse(fs.readFileSync(prefsPath,'utf8'));prefs={...prefs,...saved,accounts:saved.accounts||{}}}catch{}
function savePrefs(){fs.mkdirSync(path.dirname(prefsPath),{recursive:true});fs.writeFileSync(prefsPath,JSON.stringify(prefs),{mode:0o600})}
let medicineSyncAt=0;
const medicineTimers=new MedicineTimers({seen:()=>seen,emit:item=>{if(!prefs.notifications||role.role!=='patient'||!lastUser)return;notify(item);seen.add(item.id);prefs.accounts[lastUser]=[...seen].slice(-500);savePrefs()}});
function trusted(event){return window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&clinicUrl(event.senderFrame.url)}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(!trusted(event))throw Error('Untrusted request');return fn(...args)})}
function openWindow(url=APP_ORIGIN+'/?desktop='+role.role){if(!clinicUrl(url))return;if(window&&!window.isDestroyed()){window.show();window.focus();if(window.webContents.getURL()!==url)void window.loadURL(url);return}createWindow(url)}
let bellWindow=null,lastBellAt=0;
function ringMedicineBell(){if(Date.now()-lastBellAt<3500)return;lastBellAt=Date.now();if(bellWindow&&!bellWindow.isDestroyed())bellWindow.close();const clip=fs.readFileSync(path.join(__dirname,'assets/medicine-bell.wav')).toString('base64');bellWindow=new BrowserWindow({show:false,width:1,height:1,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});void bellWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; media-src data:"><audio autoplay src="data:audio/wav;base64,'+clip+'"></audio>'));const playing=bellWindow;setTimeout(()=>{if(!playing.isDestroyed())playing.close()},4500)}
function notify(item){if(!Notification.isSupported())return false;const content=notificationText(item,role.role);const alert=new Notification({...content,icon:path.join(__dirname,'assets/icon.png'),silent:item.kind==='medication',timeoutType:'default'});alert.on('click',()=>openWindow(notificationUrl(item,role.role)));alert.on('failed',()=>{status='The operating system blocked an alert. Check Curar in your notification settings.'});alert.show();if(item.kind==='medication')ringMedicineBell();return true}
async function poll(){if(!prefs.notifications||polling||!deviceSession)return;polling=true;try{
 const authResponse=await deviceSession.fetch(APP_ORIGIN+'/api/auth',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!authResponse.ok){if(authResponse.status===401||authResponse.status===403){medicineTimers.clear();lastUser='';seen=new Set()}throw Error('Account connection unavailable.')}const {user}=await authResponse.json();
 if(!user||user.role!==role.role){medicineTimers.clear();lastUser='';seen=new Set();status='Sign in to '+role.name+' to receive alerts.';return}
 const response=await deviceSession.fetch(APP_ORIGIN+'/api/notifications',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Notification service unavailable.');const {notifications}=await response.json();if(!Array.isArray(notifications))throw Error('Unexpected notification response.');
 if(user.id!==lastUser){medicineTimers.clear();medicineSyncAt=0;lastUser=user.id;const existing=prefs.accounts[user.id];seen=new Set(existing||notifications.map(row=>row.id));}
 for(const item of freshNotifications(notifications,seen)){notify(item);seen.add(item.id)}
 for(const item of notifications)seen.add(item.id);prefs.accounts[user.id]=[...seen].slice(-500);savePrefs();
 if(role.role==='patient'&&Date.now()-medicineSyncAt>=60000){const clinicalResponse=await deviceSession.fetch(APP_ORIGIN+'/api/clinical',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(12000)});if(clinicalResponse.ok){const clinical=await clinicalResponse.json();if(Array.isArray(clinical.medications)){medicineTimers.replace(user.id,clinical.medications);medicineSyncAt=Date.now()}}}
 status='Connected. Alerts checked every 15 seconds while Curar runs, including in the background.';
}catch{status='Offline or connection interrupted. Curar will retry automatically.'}finally{polling=false}}
function createWindow(url){window=new BrowserWindow({width:1220,height:840,minWidth:390,minHeight:600,title:role.name,backgroundColor:'#f1f6ed',icon:path.join(__dirname,'assets/icon.png'),show:false,webPreferences:{session:deviceSession,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,experimentalFeatures:false,backgroundThrottling:true,spellcheck:true}});
 window.webContents.setWindowOpenHandler(({url})=>{if(clinicUrl(url)){if(previewPage(url)){createPreview(url)}else void window.loadURL(url)}else if(externalUrl(url))void handoff(url);return {action:'deny'}});
 window.webContents.on('will-navigate',(event,url)=>{if(!clinicUrl(url)){event.preventDefault();if(externalUrl(url))void handoff(url)}});
 window.webContents.on('will-redirect',(event,url)=>{if(!clinicUrl(url))event.preventDefault()});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.on('did-fail-load',(_event,code,_message,url,main)=>{if(main&&code!==-3&&clinicUrl(url)){window.show();if(!smoke)void dialog.showMessageBox(window,{type:'warning',title:'Curar connection unavailable',message:'Check your internet connection, then choose Reload in the View menu. Your saved sign-in is retained.'})}});
 window.once('ready-to-show',()=>{if(!process.argv.includes('--background')||smoke)window.show()});
 window.on('close',event=>{if(!quitting&&!smoke&&prefs.keepRunning){event.preventDefault();window.hide();if(process.platform==='darwin')app.dock?.hide()}});
 void window.loadURL(url);
 if(smoke)void runSmoke();
}
async function handoff(url){if(!externalUrl(url))return;if(url.startsWith('tel:')){const number=url.slice(4),result=await dialog.showMessageBox(window,{type:'info',title:'Call Curar clinic',message:number,detail:'Use your phone or a calling app on this computer.',buttons:['Copy number','Open calling app','Back'],defaultId:0,cancelId:2});if(result.response===0){clipboard.writeText(number);return}if(result.response!==1)return}try{await shell.openExternal(url)}catch{void dialog.showMessageBox(window,{type:'info',message:url.startsWith('tel:')?'No calling app is available. Call '+url.slice(4)+' from your phone.':'The external app could not open. Return to Curar and try again.'})}}
function createPreview(url){const target=previewPage(url);if(!target)return;const preview=new BrowserWindow({width:1050,height:850,title:'Curar · Document',parent:window,backgroundColor:'#f1f6ed',fullscreenable:false,webPreferences:{session:deviceSession,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});previewWindows.set(preview.webContents.id,preview);preview.on('closed',()=>{for(const [id,item] of previewWindows)if(item===preview)previewWindows.delete(id);if(window&&!window.isDestroyed()){app.dock?.show();window.show();window.focus()}});preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));preview.webContents.on('will-navigate',(event,next)=>{if(!clinicUrl(next))event.preventDefault()});preview.webContents.on('will-redirect',(event,next)=>{if(!clinicUrl(next))event.preventDefault()});preview.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'){event.preventDefault();preview.close()}});void preview.loadURL(target);return preview}

async function runSmoke(){
 const timeout=setTimeout(()=>{console.error('DESKTOP_SMOKE_FAILED: launch timed out');app.exit(1)},120000);
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const loaded=contents=>new Promise((resolve,reject)=>{contents.once('did-finish-load',resolve);contents.once('did-fail-load',(_e,code)=>{if(code!==-3)reject(Error('Page failed to load: '+code))})});
 try{
  await loaded(window.webContents);let result;
  for(let attempt=0;attempt<50;attempt++){
   result=await window.webContents.executeJavaScript(`({title:document.title,role:new URL(location.href).searchParams.get('desktop'),label:document.querySelector('input[autocomplete="username"]')?.closest('label')?.textContent,bridge:!!window.curarDesktop,buttons:[...document.querySelectorAll('button')].map(b=>b.textContent.trim())})`);
   if(result.buttons.includes('Sign in'))break;await delay(500)
  }
  const prefs=window.webContents.getLastWebPreferences();
  if(!result.bridge||result.role!==role.role||!result.buttons.includes('Sign in')||!result.label?.includes(role.role==='doctor'?'Email':'Patient ID')||!prefs.sandbox||!prefs.contextIsolation||prefs.nodeIntegration)throw Error('Login or security checks failed: '+JSON.stringify(result));
  const folder=process.env.CURAR_SMOKE_OUTPUT;
  if(folder){fs.mkdirSync(folder,{recursive:true});window.show();await delay(1000);fs.writeFileSync(path.join(folder,role.role+'-login.png'),(await window.webContents.capturePage()).toPNG())}
  const accessibilityChecks=[];
  window.webContents.debugger.attach('1.3');
  const ax=await window.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
  const spoken=ax.nodes.filter(n=>!n.ignored).map(n=>n.name?.value).filter(Boolean);
  if(!spoken.includes('Change language')||!spoken.includes('Change appearance')||!spoken.includes('Sign in'))throw Error('Missing login accessibility names');
  window.webContents.debugger.detach();
  for(const zoom of [2,4]){
   window.webContents.setZoomFactor(zoom);await delay(400);
   const size=await window.webContents.executeJavaScript(`({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,named:[...document.querySelectorAll('button')].every(b=>!!(b.getAttribute('aria-label')||b.textContent.trim()))})`);
   if(size.scrollWidth>size.viewport+1||!size.named)throw Error('Enlarged login lost reflow or labels: '+JSON.stringify(size));accessibilityChecks.push({zoom,...size});
  }
  window.webContents.setZoomFactor(1);
  if(folder)fs.writeFileSync(path.join(folder,role.role+'-accessibility.json'),JSON.stringify({spoken,accessibilityChecks},null,2));
  const mainUrl=window.webContents.getURL(),checks=[];
  const denied=await window.webContents.executeJavaScript(`window.curarDesktop.closePreview().then(()=>false,()=>true)`);
  if(!denied)throw Error('Main window was allowed to close as an attachment');
  for(const section of ['files','chat-files','question-files']){
   const preview=createPreview(APP_ORIGIN+'/api/'+section+'/00000000-0000-4000-8000-000000000000');
   await loaded(preview.webContents);let state;
   for(let attempt=0;attempt<50;attempt++){
    state=await preview.webContents.executeJavaScript(`({path:location.pathname,back:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Back')),bridge:typeof window.curarDesktop?.closePreview==='function',ready:document.querySelector('main')?.dataset.previewReady==='true'})`);
    if(state.back&&state.bridge&&state.ready)break;await delay(300)
   }
   if(state.path!=='/preview'||!state.back||!state.bridge||!state.ready)throw Error('Missing attachment Back control: '+JSON.stringify(state));
   if(folder&&section==='files')fs.writeFileSync(path.join(folder,role.role+'-preview.png'),(await preview.webContents.capturePage()).toPNG());
   const closed=new Promise(resolve=>preview.once('closed',resolve));
   if(section==='question-files')preview.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
   else void preview.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Back')).click()`);
   await closed;
   if(window.isDestroyed()||!window.isVisible()||window.webContents.getURL()!==mainUrl)throw Error('Preview did not return to the original screen');
   checks.push({section,back:section==='question-files'?'Escape':'Back button',parentPreserved:true})
  }
  if(folder)fs.writeFileSync(path.join(folder,role.role+'-launch.json'),JSON.stringify({...result,sandbox:prefs.sandbox,contextIsolation:prefs.contextIsolation,nodeIntegration:prefs.nodeIntegration,mainCannotClosePreview:denied,previews:checks},null,2));
  console.log('DESKTOP_SMOKE_PASS: '+role.role+' login, attachment Back/Escape and preserved parent');clearTimeout(timeout);app.exit(0)
 }catch(e){console.error('DESKTOP_SMOKE_FAILED: '+e.message);clearTimeout(timeout);app.exit(1)}
}

function menus(){Menu.setApplicationMenu(Menu.buildFromTemplate([
 {label:role.name,submenu:[{label:'Open Curar',click:()=>openWindow()},{label:'Start Curar when I sign in to this computer',type:'checkbox',checked:prefs.startAtLogin,click:item=>{prefs.startAtLogin=item.checked;try{configureAutostart(app,role,item.checked);savePrefs()}catch{status='Startup could not be configured. Check your system login items.'}}},{label:'Keep running after closing the window',type:'checkbox',checked:prefs.keepRunning,click:item=>{prefs.keepRunning=item.checked;savePrefs()}},{type:'separator'},{role:'quit'}]},
 {role:'editMenu'},{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
 {label:'Help',submenu:[{label:'Curar website',click:()=>void shell.openExternal('https://www.curar.in')},{label:'Downloads and updates',click:()=>void shell.openExternal(APP_ORIGIN+'/desktop/')},{label:'Privacy and terms',click:()=>void shell.openExternal(APP_ORIGIN+'/android/privacy.html')}]}]));
 const icon=nativeImage.createFromPath(path.join(__dirname,'assets/icon.png')).resize({width:22,height:22});try{tray=new Tray(icon);tray.setToolTip(role.name);tray.setContextMenu(Menu.buildFromTemplate([{label:'Open '+role.name,click:()=>openWindow()},{label:'Quit '+role.name,click:()=>{quitting=true;app.quit()}}]));tray.on('double-click',()=>openWindow())}catch{status='Background mode is active. Reopen Curar from its app icon.'}
}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>openWindow());app.on('activate',()=>{app.dock?.show();openWindow()});app.on('before-quit',()=>{quitting=true;medicineTimers.clear()});app.on('window-all-closed',()=>{if(!prefs.keepRunning)app.quit()});
 app.whenReady().then(()=>{
  deviceSession=session.fromPartition('persist:curar-'+role.role);deviceSession.setPermissionRequestHandler((contents,permission,callback,details)=>{callback(permission==='media'?cameraPermission({contents,main:window?.webContents,allowed:prefs.camera,details,request:true}):clinicUrl(details.requestingUrl||'')&&(permission==='clipboard-sanitized-write'||permission==='notifications'&&prefs.notifications))});deviceSession.setPermissionCheckHandler((contents,permission,origin,details)=>permission==='media'?cameraPermission({contents,main:window?.webContents,allowed:prefs.camera,details:{...details,requestingUrl:details.requestingUrl||origin},request:false}):clinicUrl(origin)&&(permission==='clipboard-sanitized-write'||permission==='notifications'&&prefs.notifications));
  deviceSession.on('will-download',(_event,item)=>{const source=item.getURL();if(!clinicUrl(source)&&!source.startsWith('blob:'+APP_ORIGIN+'/')){item.cancel();return}const directory=path.join(app.getPath('downloads'),'Curar');fs.mkdirSync(directory,{recursive:true});let dest=path.join(directory,safeFilename(item.getFilename()));if(fs.existsSync(dest)){const ext=path.extname(dest);dest=dest.slice(0,-ext.length)+'-'+Date.now()+ext}item.setSavePath(dest);item.once('done',(_event,state)=>{if(state==='completed'&&!smoke)notify({kind:'download',title:'Saved to Downloads / Curar',preview:path.basename(dest),created_at:new Date().toISOString()});else if(state!=='completed'&&!smoke)void dialog.showMessageBox({type:'warning',message:'The file download did not complete. Try Download PDF again.'})})});
  ipcMain.handle('curar:preview-close',event=>{const preview=previewWindows.get(event.sender.id);if(!preview||event.senderFrame!==event.sender.mainFrame||!clinicUrl(event.senderFrame.url))throw Error('Only this attachment window may close itself.');preview.close()});
  handle('curar:info',()=>({role:role.role,platform:process.platform,version:app.getVersion(),name:role.name}));
  handle('curar:camera-enable',async()=>{if(!prefs.camera){const consent=await dialog.showMessageBox(window,{type:'question',buttons:['Allow camera','Back'],defaultId:1,cancelId:1,message:'Allow '+role.name+' to capture a photo?',detail:'The camera preview stays on this device. Only a captured photo you confirm will be attached. Microphone and screen recording are not requested.'});if(consent.response!==0)return {allowed:false};}if(process.platform==='darwin'&&!await systemPreferences.askForMediaAccess('camera'))return {allowed:false};prefs.camera=true;savePrefs();return {allowed:true};});
  handle('curar:notification-settings',()=>({enabled:prefs.notifications,supported:Notification.isSupported(),message:status,startAtLogin:prefs.startAtLogin,keepRunning:prefs.keepRunning}));
  handle('curar:notifications-enable',async()=>{const confirmation=await dialog.showMessageBox(window,{type:'question',buttons:['Enable notifications','Cancel'],defaultId:0,cancelId:1,message:'Allow '+role.name+' to show clinic updates?',detail:'Patient names, messages and medication details may appear in notifications. Curar keeps running in the background when its window closes. Alerts require internet access, a running app, and system notification permissions.'});if(confirmation.response!==0)return {enabled:false,message:'Notifications were not enabled.'};prefs.notifications=true;savePrefs();await poll();return {enabled:true,message:status}});
  handle('curar:notifications-disable',()=>{prefs.notifications=false;medicineTimers.clear();savePrefs();return {enabled:false,message:'Desktop notifications disabled.'}});
  handle('curar:notification-test',medicine=>{if(!prefs.notifications)throw Error('Enable desktop notifications first.');notify({kind:medicine===true?'medication':'test',title:medicine===true?'Synthetic medicine reminder · Check prescription for actual instructions':'Desktop notification test',preview:medicine===true?'Medicine bell test. No dose is being prescribed.':'Curar desktop is ready for notifications.',created_at:new Date().toISOString()});return {message:'Test submitted to the operating system. Check notification permissions, sound and Focus settings.'}});
  handle('curar:whatsapp',async number=>{const clean=String(number).replace(/\D/g,'');const digits=clean.length===10?'91'+clean:clean;if(!/^\d{7,15}$/.test(digits))throw Error('Enter a valid WhatsApp number.');await shell.openExternal('https://wa.me/'+digits+'?text='+encodeURIComponent('Hello, your report is ready. I will attach the PDF here for you.'));return {opened:true}});
  if(!smoke)try{configureAutostart(app,role,prefs.startAtLogin)}catch{status='Startup could not be configured. Check your system login items.'}
  menus();createWindow(APP_ORIGIN+'/?desktop='+role.role);if(!smoke){setInterval(()=>void poll(),15000);powerMonitor.on('resume',()=>{medicineSyncAt=0;void poll()});powerMonitor.on('unlock-screen',()=>void poll());void poll()}
 });
}
