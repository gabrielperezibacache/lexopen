const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lexopenDesktop", {
  getState: () => ipcRenderer.invoke("desktop:get-state"),
  saveSetup: (payload) => ipcRenderer.invoke("desktop:save-setup", payload),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  retry: () => ipcRenderer.invoke("desktop:retry"),
  onStatus: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on("desktop:status", handler);
    return () => ipcRenderer.removeListener("desktop:status", handler);
  },
});
