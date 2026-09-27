'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = (channel) => (callback) => {
  if (typeof callback !== 'function') throw new TypeError('A callback is required.');
  // Never expose the IPC event, sender, or any other privileged object.
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('pondDesktop', Object.freeze({
  getState: invoke('pond:get-state'),
  setDesktopMode: invoke('pond:set-desktop-mode'),
  setGlobalInteraction: invoke('pond:set-global-interaction'),
  setLaunchAtLogin: invoke('pond:set-launch-at-login'),
  feed: invoke('pond:feed'),
  showControls: invoke('pond:show-controls'),
  setFullScreen: invoke('pond:set-full-screen'),
  hide: invoke('pond:hide'),
  minimize: invoke('pond:minimize'),
  quit: invoke('pond:quit'),
  onState: subscribe('pond:state'),
  onPointer: subscribe('pond:pointer'),
}));
