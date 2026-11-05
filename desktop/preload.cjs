const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lexopenDesktop", {
  getState: () => ipcRenderer.invoke("desktop:get-state"),
  saveSetup: (payload) => ipcRenderer.invoke("desktop:save-setup", payload),
  chooseDataDirectory: () => ipcRenderer.invoke("desktop:choose-data-directory"),
  prepareAltazorDesktop: (retry) => ipcRenderer.invoke("desktop:prepare-altazor-desktop", retry === true),
  onAltazorPreparation: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on("desktop:altazor-preparation", handler);
    return () => ipcRenderer.removeListener("desktop:altazor-preparation", handler);
  },
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  retry: () => ipcRenderer.invoke("desktop:retry"),
  onStatus: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on("desktop:status", handler);
    return () => ipcRenderer.removeListener("desktop:status", handler);
  },
});
