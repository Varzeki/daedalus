const os = require('os')
const fs = require('fs')
const path = require('path')
const Package = require('../../../package.json')

const PREFERENCES_FILE = 'Preferences.json'

class Preferences {
  getPreferences () {
    return fs.readSync(path.join(this.preferencesDir(), PREFERENCES_FILE))
  }

  savePreferences (preferencesObject) {
    preferencesObject.version = Package.version
    return fs.writeSync(path.join(this.preferencesDir(), PREFERENCES_FILE), JSON.stringify(preferencesObject))
  }

  preferencesDir () {
    switch (os.platform()) {
      case 'win32': // Windows (all versions)
        return path.join(os.homedir(), 'AppData', 'Local', 'DAEDALUS Terminal')
      case 'darwin': // Mac OS
        return path.join(os.homedir(), 'Library', 'DAEDALUS Terminal')
      default: // Default to a location for some other form of unix
        return path.join(os.homedir(), '.daedalus-terminal')
    }
  }
}

module.exports = new Preferences()
