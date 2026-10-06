// Everything that names the product lives here, so a rename touches one file
// (plus package.json and electron-builder.yml, which cannot import it).
export const brand = {
  name: 'Locker Manager',
  tagline: 'Student lockers, lock codes, labels and letters, all in one place.',
  repoUrl: 'https://github.com/mrdavearms/locker-manager',
  releasesUrl: 'https://github.com/mrdavearms/locker-manager/releases',
  licence: 'MIT',
  copyright: 'Copyright © 2026 Dave Armstrong',
  fileExtension: 'lockers',
  protocol: 'lockermanager'
} as const
