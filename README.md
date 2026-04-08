> **DAEDALUS Terminal** is a fork of [ICARUS Terminal](https://github.com/iaincollins/icarus) by Iain Collins.
> It adds biological species prediction, exploration value tracking, COVAS voiceover, and landing pad overlays.
> For the original project, visit [iaincollins/icarus](https://github.com/iaincollins/icarus).
> See [CHANGELOG.md](CHANGELOG.md) for a full list of changes in this fork.

## About DAEDALUS Terminal

_DAEDALUS Terminal is a free, immersive, context-sensitive companion app and second screen interface for [Elite Dangerous](https://www.elitedangerous.com/)._

You can run DAEDALUS Terminal in a native window, on multiple windows/displays, as an overlayed window in top of the game if playing with a VR headset or on an ultra-wide display or connect remotely in a browser from another computer/tablet/phone/other devices (e.g. Chromebook, Android Phone/Tablet, Amazon Fire Tablet); the UI is specifically designed with touch screen devices in mind and to adapt the layout of panels to both landscape and portrait displays, both large and small.

## Screenshots

<img alt="System Map" src="https://user-images.githubusercontent.com/595695/197432007-13726aea-9413-4fcf-88c6-9abc34f2d26c.png" height="auto" width="98.5%"/>

<img alt="System List" src="https://user-images.githubusercontent.com/595695/215351117-50282d37-f42f-4eb9-975b-e70d29202cdb.png" height="auto" width="49%"/> <img alt="Ship Status" src="https://user-images.githubusercontent.com/595695/215350062-0f7ad9e4-905c-43ae-b3cf-1dc7944ab744.png" height="auto" width="49%"/>
<img alt="Blueprint" src="https://user-images.githubusercontent.com/595695/192074945-b47edcbb-6aab-444d-827c-6b6255e8f932.png" height="auto" width="49%"/> <img alt="Navigation Route" src="https://user-images.githubusercontent.com/595695/215350464-88e75eb1-77d8-408c-a0ec-12fd6911e866.png" height="auto" width="49%"/>

## Requirements

The self-contained installer is around 20 MB and has no dependancies. If you are running an older but supported release of Windows, any missing dependancies will be automatically installed.

* Windows 10 or newer required.
* No dependancies are required to install the application.
* No manual configuration or setup is required, it will automatically find your game data.
* No additional diskspace is required to store game data. Recent game data is loaded in to memory when launched and streamed in real time when the game is active, it is not persisted or cached to disk.

### Notes

* The application will run against the latest version of Elite Dangerous (Odyssey) and older releases (e.g. Horizons), but it is currently explicitly designed for use with the latest versions. Changes to the game API may impact functionality when using DAEDALUS Terminal with older versions of the game.
* The application includes a web interface to allow access from remote devices. The web interface is enabled by default while the application is running.

The web interface relies on advanced browser functionality for rendering and works best on native Google Chrome browsers (e.g. Google Chrome for Windows, Mac, ChromeOS, Android). Other browsers (e.g. Safari, Firefox, Chromium) may use fallback rendering and/or lack required features for full compatbility / optimal user experience.

## Developer Documentation
 
For developer documentation see [BUILD.md](BUILD.md).

### Developer Quickstart

If you are running on Linux and/or looking for quick instructions on how to run from source, if you have [Node.js](https://nodejs.org/en/) this is what you need to do to download and install  DAEDALUS Terminal:

    git clone git@github.com:YOUR_USERNAME/daedalus.git
    cd daedalus
    npm install
    
Next, run `cp .env-example .env` to create an `.env` file and edit it to change the `LOG_DIR` option to point to the location of your Elite Dangerous log files:

    # LOG_DIR can be used to tell the Service where to look for game logs
    # This option can be used in development and at runtime
    LOG_DIR=path/to/logs

With that done, anytime you want to start DAEDALUS Terminal, all you need to do is run:

    npm start

This will run in debug mode which is not quite the same as a production build (it's not as optimised) but should work just fine.

### Building a Standalone Binary

The quickest way to produce a runnable binary (no installer needed):

    npm install
    npm run build:standalone

This outputs a standalone executable in `build/`. See [BUILD.md](BUILD.md) for full build documentation including the Windows installer build.

## Legal

DAEDALUS Terminal is free, open-source software. The original ICARUS Terminal was released under the ISC License by Iain Collins. This fork is licensed under the [GNU General Public License v3.0](LICENSE) due to incorporation of code derived from GPL-3.0 licensed projects.

DAEDALUS Terminal does not record Personally Identifiable Information (PII). DAEDALUS Terminal includes integrations with services like [EDSM](https://www.edsm.net), [EDDB](https://eddb.io/) and [INARA](https://inara.cz/). Data such as your current in-game location, cargo, etc. may be sent to them order to render information in the interface. DAEDALUS Terminal does not expose or send information about you or your in game character (e.g. your name, user name, commander name or ship name) but any requests made to a third party will include your IP address.

Elite Dangerous is copyright Frontier Developments plc. This software is not endorsed by nor reflects the views or opinions of Frontier Developments and no employee of Frontier Developments was involved in the making of it.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

## Credits

_DAEDALUS Terminal would not be possible without the original [ICARUS Terminal](https://github.com/iaincollins/icarus) by Iain Collins, and work from dozens of enthusiasts and hundreds of open source contributors._

* The original name ICARUS was suggested by [SpaceNinjaBear](https://www.reddit.com/user/SpaceNinjaBear) on Reddit.
* Loading animation by [James Panter](http://codepen.io/jpanter/pen/PWWQXK).
* Includes origional icons, icons inspired by those found in Elite Dangerous and icons based on those from [edassets.org](https://edassets.org).
* Uses stellar cartography data from the wonderful [EDSM API](https://www.edsm.net).
* Includes game data collated and provided by [EDCD](https://github.com/EDCD/FDevIDs).
* The [Jura font](https://fonts.google.com/specimen/Jura#glyphs) is included under the Open Font License.
* Thank you to [Serge Zaitsev](https://github.com/zserge) for his work on the WebView library.

### Fork Credits

This fork adds features built on the work of the following projects and communities:

* **[SrvSurvey](https://github.com/njthomson/SrvSurvey)** by njthomson — biological species prediction criteria, exploration value algorithms, and settlement template pad positions. Licensed under [GPL-3.0](https://github.com/njthomson/SrvSurvey/blob/main/LICENSE).
* **[Canonn Research Group](https://canonn.science/)** — species observation data and codex research used in bio prediction.
* **[Spansh](https://spansh.co.uk/)** — system and body data API.
* **[Elite Observatory BioInsights](https://github.com/Xjph/ObservatoryCore)** — methodology reference for bio signal analysis.

DAEDALUS Terminal uses imagery from/inspired by Elite Dangerous, which is copyright Frontier Developments plc. This software is not endorsed by nor reflects the views or opinions of Frontier Developments and no employee of Frontier Developments was involved in the making of it.

Thank you to all those who have created and supported libraries on which this software depends and to Frontier Developments plc for supporting third party tools.



