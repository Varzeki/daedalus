package main

const ICON = "icon.ico"
const LAUNCHER_WINDOW_TITLE = "DAEDALUS Terminal Launcher"
const TERMINAL_WINDOW_TITLE = "DAEDALUS Terminal"
const LPSZ_CLASS_NAME = "DaedalusTerminalWindowClass"
const SERVICE_EXECUTABLE = "DAEDALUS Service.exe"
const TERMINAL_EXECUTABLE = "DAEDALUS Terminal.exe"

// TODO Update to DAEDALUS fork URL when available
const RELEASE_NOTES_URL = ""

// DEBUGGER controls whether WebView2 devtools (F12) are available.
// Set to false for production builds, true for development.
const DEBUGGER = false

const defaultLauncherWindowWidth = int32(900)
const defaultLauncherWindowHeight = int32(500)
const defaultWindowWidth = int32(1280)
const defaultWindowHeight = int32(860)
