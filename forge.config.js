const path = require('path');

module.exports = {
  packagerConfig: {
    icon: path.join(__dirname, 'ico.ico'),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        iconUrl: 'https://raw.githubusercontent.com/gau2107/daily-stock-pl-graph-creator/master/ico.ico',
        setupIcon: path.join(__dirname, 'ico.ico'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
};
