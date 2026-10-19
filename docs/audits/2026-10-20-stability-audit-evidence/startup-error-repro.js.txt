const { app, BrowserWindow } = require('electron')
const lock = app.requestSingleInstanceLock()
void app.whenReady().then(async () => {
  await Promise.resolve()
  throw new Error('boom in whenReady chain')
})
setTimeout(() => {
  console.log('STILL ALIVE after 3s; windows=', BrowserWindow.getAllWindows().length, 'lock=', lock)
  app.exit(0)
}, 3000)
