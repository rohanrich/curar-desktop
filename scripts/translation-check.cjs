'use strict';
// Anonymous public fixtures only. No sign-in, clinical records or delivery actions.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const folder=path.resolve('translation-results');fs.mkdirSync(folder,{recursive:true});
app.setPath('userData',path.join(folder,'temporary-profile'));
const evidence={platform:process.platform,electron:process.versions.electron,checks:[],errors:[],requests:[]};let window;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function js(code){return window.webContents.executeJavaScript(code,true)}
async function wait(test,limit=120000){const start=Date.now();while(Date.now()-start<limit){const result=await test();if(result)return result;await delay(1000)}throw Error('Timed out waiting for translation: '+await js('document.body.innerText'))}
async function open(kind,target){await js(`(()=>{const box=document.querySelector('[data-testid="translation-${kind}"]');const toggle=box.querySelector('button[aria-expanded]');if(toggle.getAttribute('aria-expanded')==='false')toggle.click()})()`);await delay(300);await js(`(()=>{const select=document.querySelector('[data-testid="translation-${kind}"] .translation-choices label:nth-child(2) select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(target)});select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(100)}
async function run(kind){await js(`document.querySelector('[data-testid="translation-${kind}"] .inline-translation > button.secondary').click()`);return wait(async()=>{const result=await js(`(()=>{const box=document.querySelector('[data-testid="translation-${kind}"]');return {busy:box.querySelector('button[aria-busy]')?.getAttribute('aria-busy')==='true',output:box.querySelector('div[role="status"] p.preserve')?.textContent,error:box.querySelector('.notice[role="status"]')?.textContent,progress:box.querySelector('p[role="status"]')?.textContent}})()`);if(result.error)throw Error(result.error);if(result.output&&!result.busy)return result;return false},1500000)}
app.whenReady().then(async()=>{try{
 const device=session.fromPartition('curar-translation-check');device.webRequest.onBeforeRequest((details,callback)=>{if(!details.url.startsWith('https://app.curar.in/')&&!details.url.startsWith('blob:')&&!details.url.startsWith('data:')){evidence.requests.push(details.url);callback({cancel:true})}else callback({})});
 window=new BrowserWindow({width:1100,height:1000,show:true,webPreferences:{session:device,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true}});
 window.webContents.on('console-message',(_event,...args)=>{const message=args.map(a=>typeof a==='string'?a:JSON.stringify(a)).join(' ');if(/error|failed/i.test(message))evidence.errors.push(message.slice(0,500))});
 await window.loadURL('https://app.curar.in/translation-check');await wait(()=>js("!!document.querySelector('[data-testid=translation-chat] button')"));
 await open('chat','en');await wait(()=>js("document.querySelector('[data-testid=translation-chat]').innerText.includes('Detected language: English')"));
 let result=await run('chat');assert.equal(result.output,'Hello doctor');evidence.checks.push({name:'short English auto detect and same-language output',...result});
 await open('chat','hi');const start=Date.now();result=await run('chat');assert.match(result.output,/[\u0900-\u097f]/);evidence.checks.push({name:'actual English to Hindi chat',seconds:(Date.now()-start)/1000,...result});
 fs.writeFileSync(path.join(folder,'translated-chat.png'),(await window.webContents.capturePage()).toPNG());
 await open('pdf','fr');result=await run('pdf');assert.ok(result.output.length>100);assert.ok(/médecin|rapport|exemple/i.test(result.output));evidence.checks.push({name:'actual multi-section PDF text to French',...result});
 assert.equal(await js("document.querySelector('[data-testid=translation-pdf] > p.preserve').textContent.includes('This is a fictional example')"),true);
 fs.writeFileSync(path.join(folder,'translated-report.png'),(await window.webContents.capturePage()).toPNG());
 await js("[...document.querySelectorAll('[data-testid=translation-pdf] button')].find(b=>b.textContent.includes('Remove downloaded')).click()");await wait(()=>js("caches.open('curar-local-translation-v1').then(c=>c.keys()).then(k=>k.length===0)"));evidence.checks.push({name:'remove optional model cache without altering original report',pass:true});
 assert.equal(evidence.requests.length,0,'No text or model inference request may leave the clinic origin');evidence.pass=true;
 }catch(error){evidence.pass=false;evidence.failure=error.stack;try{if(window)fs.writeFileSync(path.join(folder,'failure.png'),(await window.webContents.capturePage()).toPNG())}catch{}}
 fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));app.exit(evidence.pass?0:1);
});
