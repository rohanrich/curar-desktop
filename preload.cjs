'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// No Node, filesystem, arbitrary IPC, URL fetch, or credential access is exposed.
if(window.location.origin==='https://app.curar.in'){
 contextBridge.exposeInMainWorld('curarDesktop',Object.freeze({
  platform:process.platform,
  getInfo:()=>ipcRenderer.invoke('curar:info'),
  notificationSettings:()=>ipcRenderer.invoke('curar:notification-settings'),
  enableNotifications:()=>ipcRenderer.invoke('curar:notifications-enable'),
  disableNotifications:()=>ipcRenderer.invoke('curar:notifications-disable'),
  testNotification:(medicine=false)=>ipcRenderer.invoke('curar:notification-test',medicine===true),
  openWhatsApp:(phone)=>ipcRenderer.invoke('curar:whatsapp',String(phone)),
 }));
}
