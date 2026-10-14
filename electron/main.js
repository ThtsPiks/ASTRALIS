const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1680,
    height: 945,
    minWidth: 1280,
    minHeight: 720,
    fullscreen: false,
    simpleFullscreen: false,
    backgroundColor: '#03070c',
    title: 'ASTRALIS',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Steamworks stub: hook steamworks.js here when you have an AppID.
// SteamAPI.Init() / achievements stay out of the first desktop build.
