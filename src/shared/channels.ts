// IPC channel names. Kept free of imports because the sandboxed preload script
// bundles this file and cannot load node_modules at runtime.
export const channels = {
  appGetInfo: 'app:getInfo',
  updateGetStatus: 'update:getStatus',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateOpenDownloadPage: 'update:openDownloadPage',
  shellOpenExternal: 'shell:openExternal',
  // main -> renderer events
  updateStatus: 'event:update:status',
  openAbout: 'event:ui:openAbout'
} as const
