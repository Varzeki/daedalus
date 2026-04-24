package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"

	webview "github.com/jchv/go-webview2"
	"github.com/nvsoft/win"
	"github.com/phayes/freeport"
	"github.com/rodolfoag/gow32"
	"github.com/sqweek/dialog"
	"golang.org/x/sys/windows"
)

var dirname = ""
var defaultPort = 3300 // Set to 0 to be assigned a free high numbered port

// Win32 monitor APIs (not exposed by nvsoft/win)
var (
	user32                = syscall.NewLazyDLL("user32.dll")
	procMonitorFromWindow = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfoW   = user32.NewProc("GetMonitorInfoW")
)

// DWM API for rounded window corners (Windows 11+)
var (
	dwmapi                    = syscall.NewLazyDLL("dwmapi.dll")
	procDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")
)

const DWMWA_WINDOW_CORNER_PREFERENCE = 33
const DWMWA_BORDER_COLOR = 34
const DWMWCP_ROUND = 2
const DWMWA_COLOR_NONE = 0xFFFFFFFE

const MONITOR_DEFAULTTONEAREST = 2

type MONITORINFO struct {
	CbSize    uint32
	RcMonitor win.RECT
	RcWork    win.RECT
	DwFlags   uint32
}

func getMonitorRect(hwnd win.HWND) win.RECT {
	hMonitor, _, _ := procMonitorFromWindow.Call(uintptr(hwnd), MONITOR_DEFAULTTONEAREST)
	var mi MONITORINFO
	mi.CbSize = uint32(unsafe.Sizeof(mi))
	procGetMonitorInfoW.Call(hMonitor, uintptr(unsafe.Pointer(&mi)))
	return mi.RcMonitor
}

func getWorkArea(hwnd win.HWND) win.RECT {
	hMonitor, _, _ := procMonitorFromWindow.Call(uintptr(hwnd), MONITOR_DEFAULTTONEAREST)
	var mi MONITORINFO
	mi.CbSize = uint32(unsafe.Sizeof(mi))
	procGetMonitorInfoW.Call(hMonitor, uintptr(unsafe.Pointer(&mi)))
	return mi.RcWork
}

// stripTitleBar removes the native title bar from a window. Used for
// the launcher which should not be resizable or snappable.
func stripTitleBar(hwnd win.HWND) {
	style := uint32(win.GetWindowLong(hwnd, win.GWL_STYLE))
	style = style &^ (win.WS_CAPTION | win.WS_THICKFRAME)
	style = style | uint32(win.WS_POPUP)
	win.SetWindowLong(hwnd, win.GWL_STYLE, int32(style))

	exStyle := win.GetWindowLong(hwnd, win.GWL_EXSTYLE)
	exStyle = exStyle &^ (win.WS_EX_CLIENTEDGE | win.WS_EX_WINDOWEDGE | win.WS_EX_STATICEDGE | win.WS_EX_DLGMODALFRAME)
	exStyle = exStyle | win.WS_EX_APPWINDOW
	win.SetWindowLong(hwnd, win.GWL_EXSTYLE, exStyle)

	win.SetWindowPos(hwnd, 0, 0, 0, 0, 0,
		win.SWP_FRAMECHANGED|win.SWP_NOMOVE|win.SWP_NOSIZE|win.SWP_NOZORDER)

	preference := int32(DWMWCP_ROUND)
	procDwmSetWindowAttribute.Call(
		uintptr(hwnd),
		DWMWA_WINDOW_CORNER_PREFERENCE,
		uintptr(unsafe.Pointer(&preference)),
		uintptr(unsafe.Sizeof(preference)),
	)

	borderColor := uint32(DWMWA_COLOR_NONE)
	procDwmSetWindowAttribute.Call(
		uintptr(hwnd),
		DWMWA_BORDER_COLOR,
		uintptr(unsafe.Pointer(&borderColor)),
		uintptr(unsafe.Sizeof(borderColor)),
	)
}

// stripTitleBarClient removes the native title bar from a client window
// while keeping WS_THICKFRAME and WS_MAXIMIZEBOX for Aero Snap support.
// The WndProc subclass for WM_NCCALCSIZE is set up in bindFunctionsToWebView
// so it can share the isMaximized/isFullScreen state.
func stripTitleBarClient(hwnd win.HWND) {
	style := uint32(win.GetWindowLong(hwnd, win.GWL_STYLE))
	style = style &^ win.WS_CAPTION
	style = style | uint32(win.WS_POPUP) | win.WS_THICKFRAME | win.WS_MAXIMIZEBOX
	win.SetWindowLong(hwnd, win.GWL_STYLE, int32(style))

	exStyle := win.GetWindowLong(hwnd, win.GWL_EXSTYLE)
	exStyle = exStyle &^ (win.WS_EX_CLIENTEDGE | win.WS_EX_WINDOWEDGE | win.WS_EX_STATICEDGE | win.WS_EX_DLGMODALFRAME)
	exStyle = exStyle | win.WS_EX_APPWINDOW
	win.SetWindowLong(hwnd, win.GWL_EXSTYLE, exStyle)

	preference := int32(DWMWCP_ROUND)
	procDwmSetWindowAttribute.Call(
		uintptr(hwnd),
		DWMWA_WINDOW_CORNER_PREFERENCE,
		uintptr(unsafe.Pointer(&preference)),
		uintptr(unsafe.Sizeof(preference)),
	)

	borderColor := uint32(DWMWA_COLOR_NONE)
	procDwmSetWindowAttribute.Call(
		uintptr(hwnd),
		DWMWA_BORDER_COLOR,
		uintptr(unsafe.Pointer(&borderColor)),
		uintptr(unsafe.Sizeof(borderColor)),
	)
}

var port int // Actual port we are running on
var webViewInstance webview.WebView

// Track main window size when switching to/from fullscreen
var windowWidth = defaultWindowWidth
var windowHeight = defaultWindowHeight
var url = fmt.Sprintf("http://localhost:%d", defaultPort)

type process struct {
	Pid    int
	Handle uintptr
}

var processGroup ProcessGroup

func main() {
	startTime := time.Now()

	_processGroup, err := NewProcessGroup()
	if err != nil {
		panic(err)
	}
	defer _processGroup.Dispose()
	processGroup = _processGroup

	// Set default port to be random high port
	if defaultPort == 0 {
		randomPort, portErr := freeport.GetFreePort()
		if portErr != nil {
			fmt.Println("Error getting port", portErr.Error())
		} else {
			defaultPort = randomPort
		}
	}

	// Parse arguments
	widthPtr := flag.Int("width", int(windowWidth), "Window width")
	heightPtr := flag.Int("height", int(windowHeight), "Window height")
	portPtr := flag.Int("port", defaultPort, "Port service should run on")
	terminalMode := flag.Bool("terminal", false, "Run in terminal only mode")
	installMode := flag.Bool("install", false, "First run after install")
	smokeTest := flag.Bool("smoke-test", false, "Verify WebView2 initializes then exit")
	flag.Parse()

	// Smoke test: verify WebView2 can initialize, then exit
	if *smokeTest {
		w := webview.NewWithOptions(webview.WebViewOptions{
			Debug: false,
			WindowOptions: webview.WindowOptions{
				Title:  "Smoke Test",
				Width:  100,
				Height: 100,
			},
		})
		if w == nil {
			fmt.Println("FAIL: WebView2 initialization failed")
			os.Exit(1)
		}
		w.Destroy()
		fmt.Println("OK: WebView2 initialized successfully")
		os.Exit(0)
	}

	windowWidth = int32(*widthPtr)
	windowHeight = int32(*heightPtr)
	port = int(*portPtr)
	url = fmt.Sprintf("http://localhost:%d", *portPtr)
	launcherUrl := fmt.Sprintf("http://localhost:%d/launcher", *portPtr)

	pathToExecutable, err := os.Executable()
	if err != nil {
		dialog.Message("%s", "Failed to start DAEDALUS Terminal Service\n\nUnable to determine current directory.").Title("Error").Error()
		exitApplication(1)
	}
	dirname = filepath.Dir(pathToExecutable)

	// Check if is first run after installing, in which case we restart without
	// elevated privilages to ensure we are not running as the installer, as that
	// causes problems for things like interacting with windows via SteamVR.
	if *installMode {
		runUnelevated(pathToExecutable)
		return
	}

	// Check if we are starting in Terminal mode
	if *terminalMode {
		createWindow(TERMINAL_WINDOW_TITLE, url, defaultWindowWidth, defaultWindowHeight, webview.HintNone)
		return
	}

	// If we get this far, we start in Launcher mode

	// Check not already running
	if checkProcessAlreadyExists(LAUNCHER_WINDOW_TITLE) {
		dialog.Message("%s", "DAEDALUS Terminal is already running.\n\nYou can only run one instance at a time.").Title("Information").Info()
		exitApplication(1)
	}

	// Check for an update before running main launcher code
	// updateAvailable, _ := CheckForUpdate()
	// if updateAvailable {
	// 	ok := dialog.Message("%s", "A new version of DAEDALUS Terminal is available.\n\nDo you want to install the update?").Title("New version available").YesNo()
	// 	if ok {
	// 		InstallUpdate()
	// 		return
	// 	}
	// }

	// Use Windows API to get Save Game dir
	saveGameDirPath, err := windows.KnownFolderPath(windows.FOLDERID_SavedGames, 0)

	// Kill any orphaned service processes from a previous unclean exit
	killExistingServiceProcesses()

	// Run service
	cmdArg0 := fmt.Sprintf("%s%d", "--port=", *portPtr)
	cmdArg1 := fmt.Sprintf("%s%s", "--save-game-dir=", saveGameDirPath)
	cmdArg2 := fmt.Sprintf("%s%d", "--parent-pid=", os.Getpid())
	serviceCmdInstance := exec.Command(filepath.Join(dirname, SERVICE_EXECUTABLE), cmdArg0, cmdArg1, cmdArg2)
	serviceCmdInstance.Dir = dirname
	serviceCmdInstance.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x08000000, HideWindow: true}
	serviceCmdErr := serviceCmdInstance.Start()

	// Exit if service fails to start
	if serviceCmdErr != nil {
		fmt.Println("Error starting service", serviceCmdErr.Error())
		dialog.Message("%s%s", "Failed to start DAEDALUS Terminal Service.\n\n", serviceCmdErr.Error()).Title("Error").Error()
		exitApplication(1)
	}

	// Add service to process group so gets shutdown when main process ends
	processGroup.AddProcess(serviceCmdInstance.Process)

	// Exit if service stops running
	go func() {
		serviceCmdInstance.Wait()
		currentTime := time.Now()
		diff := currentTime.Sub(startTime)

		// If Window is visible, hide it to avoid showing a Window in a broken state
		if webViewInstance != nil {
			hwndPtr := webViewInstance.Window()
			hwnd := win.HWND(hwndPtr)
			win.ShowWindow(hwnd, win.SW_HIDE)
		}

		if diff.Seconds() < 10 {
			// Show alternate dialog message if fails within X seconds of startup
			dialog.Message("%s", "DAEDALUS Terminal Service failed to start.\n\nAntiVirus or Firewall software may have prevented it from starting or it may be conflicting with another application.").Title("Error").Error()
		} else {
			fmt.Println("Service stopped unexpectedly.")
			dialog.Message("%s", "DAEDALUS Terminal Service stopped unexpectedly.").Title("Error").Error()
		}
		exitApplication(1)
	}()

	// TODO Only open a window once service is ready
	time.Sleep(0 * time.Second)

	// Open main window (block rest of main until closed)
	createNativeWindow(LAUNCHER_WINDOW_TITLE, launcherUrl, defaultLauncherWindowWidth, defaultLauncherWindowHeight)

	// Ensure we terminate all processes cleanly when window closes
	exitApplication(0)
}

// createWindow() lets the webview library create a managed window for us
func createWindow(LAUNCHER_WINDOW_TITLE string, url string, width int32, height int32, hint webview.Hint) {
	// Passes the pointer to the window as an unsafe reference
	w := webview.New(DEBUGGER)
	// webview.New returns nil when WebView2 fails to initialize.
	if w == nil {
		dialog.Message("%s", "Failed to initialize WebView2.\n\nPlease ensure Microsoft Edge WebView2 Runtime is installed.").Title("Error").Error()
		exitApplication(1)
		return
	}
	defer w.Destroy()

	hwndPtr := w.Window()
	hwnd := win.HWND(hwndPtr)

	// Center window and force it to redraw
	screenWidth := int32(win.GetSystemMetrics(win.SM_CXSCREEN))
	screenHeight := int32(win.GetSystemMetrics(win.SM_CYSCREEN))
	windowX := int32((screenWidth / 2) - (width / 2))
	windowY := int32((screenHeight / 2) - (height / 2))
	win.MoveWindow(hwnd, windowX, windowY, width, height, false)

	// Set window icon
	hIconSm := win.HICON(win.LoadImage(0, syscall.StringToUTF16Ptr(ICON), win.IMAGE_ICON, 32, 32, win.LR_LOADFROMFILE|win.LR_SHARED|win.LR_LOADTRANSPARENT))
	hIcon := win.HICON(win.LoadImage(0, syscall.StringToUTF16Ptr(ICON), win.IMAGE_ICON, 64, 64, win.LR_LOADFROMFILE|win.LR_SHARED|win.LR_LOADTRANSPARENT))
	win.SendMessage(hwnd, win.WM_SETICON, 0, uintptr(hIconSm))
	win.SendMessage(hwnd, win.WM_SETICON, 1, uintptr(hIcon))

	// SetTitle and SetSize MUST come before stripTitleBar — the webview
	// library re-applies window styles during these calls, which would
	// undo our popup/frameless changes.
	w.SetTitle(LAUNCHER_WINDOW_TITLE)
	w.SetSize(int(width), int(height), hint)

	// Remove native title bar — replaced by custom HTML chrome
	stripTitleBarClient(hwnd)

	bindFunctionsToWebView(w, true)

	w.Bind("daedalusTerminal_hasCustomChrome", func() bool { return true })

	w.Navigate(LoadUrl(url))
	w.Run()
}

// createNativeWindow() creates a webview-managed window with customised
// appearance (fixed size, centered, with icon)
func createNativeWindow(title string, url string, width int32, height int32) {
	webViewInstance = webview.NewWithOptions(webview.WebViewOptions{
		Debug: DEBUGGER,
		WindowOptions: webview.WindowOptions{
			Title:  title,
			Width:  uint(width),
			Height: uint(height),
			Center: true,
		},
	})
	if webViewInstance == nil {
		dialog.Message("%s", "Failed to initialize WebView2.\n\nPlease ensure Microsoft Edge WebView2 Runtime is installed.").Title("Error").Error()
		exitApplication(1)
	}
	defer webViewInstance.Destroy()

	hwndPtr := webViewInstance.Window()
	hwnd := win.HWND(hwndPtr)

	// Set fixed size (no resize/maximize) matching original launcher style
	webViewInstance.SetSize(int(width), int(height), webview.HintFixed)

	// Set window icon from file
	hIconSm := win.HICON(win.LoadImage(0, syscall.StringToUTF16Ptr(ICON), win.IMAGE_ICON, 32, 32, win.LR_LOADFROMFILE|win.LR_SHARED|win.LR_LOADTRANSPARENT))
	hIcon := win.HICON(win.LoadImage(0, syscall.StringToUTF16Ptr(ICON), win.IMAGE_ICON, 64, 64, win.LR_LOADFROMFILE|win.LR_SHARED|win.LR_LOADTRANSPARENT))
	win.SendMessage(hwnd, win.WM_SETICON, 0, uintptr(hIconSm))
	win.SendMessage(hwnd, win.WM_SETICON, 1, uintptr(hIcon))

	// Remove native title bar — replaced by custom HTML chrome
	stripTitleBar(hwnd)

	bindFunctionsToWebView(webViewInstance, false)

	webViewInstance.Bind("daedalusTerminal_hasCustomChrome", func() bool { return true })

	webViewInstance.Navigate(LoadUrl(url))
	webViewInstance.Run()
}

func bindFunctionsToWebView(w webview.WebView, isClientWindow bool) {
	hwndPtr := w.Window()
	hwnd := win.HWND(hwndPtr)

	const (
		HTLEFT        = 10
		HTRIGHT       = 11
		HTTOP         = 12
		HTTOPLEFT     = 13
		HTTOPRIGHT    = 14
		HTBOTTOM      = 15
		HTBOTTOMLEFT  = 16
		HTBOTTOMRIGHT = 17
	)

	var isFullScreen = false
	var isMaximized = false
	var isPinned = false
	var preFullScreenRect win.RECT
	var wasMaximised = false
	defaultWindowStyle := win.GetWindowLong(hwnd, win.GWL_STYLE)

	// For client windows, subclass the WndProc to intercept WM_NCCALCSIZE
	// (eliminating the non-client area) and WM_SIZE (syncing isMaximized
	// when Windows changes the maximize state, e.g. Aero Snap or drag-
	// to-restore). This must be set up before SWP_FRAMECHANGED is sent.
	if isClientWindow {
		origProc := win.GetWindowLongPtr(hwnd, win.GWLP_WNDPROC)
		newProc := syscall.NewCallback(func(h win.HWND, msg uint32, wParam, lParam uintptr) uintptr {
			if msg == win.WM_NCHITTEST && !isFullScreen && !isPinned {
				const resizeBorder = 8

				var windowRect win.RECT
				win.GetWindowRect(h, &windowRect)
				x := int32(int16(uint32(lParam & 0xFFFF)))
				y := int32(int16(uint32((lParam >> 16) & 0xFFFF)))

				left := x >= windowRect.Left && x < windowRect.Left+resizeBorder
				right := x <= windowRect.Right && x >= windowRect.Right-resizeBorder
				top := y >= windowRect.Top && y < windowRect.Top+resizeBorder
				bottom := y <= windowRect.Bottom && y >= windowRect.Bottom-resizeBorder

				switch {
				case top && left:
					return HTTOPLEFT
				case top && right:
					return HTTOPRIGHT
				case bottom && left:
					return HTBOTTOMLEFT
				case bottom && right:
					return HTBOTTOMRIGHT
				case left:
					return HTLEFT
				case right:
					return HTRIGHT
				case top:
					return HTTOP
				case bottom:
					return HTBOTTOM
				}
			}

			if msg == win.WM_GETMINMAXINFO {
				// Constrain the maximized window position and size to
				// the work area (excluding the taskbar). Without this,
				// WS_POPUP|WS_THICKFRAME maximizes to the full monitor,
				// leaving unrendered non-client space as visual artefacts.
				// In fullscreen, allow the full monitor.
				if !isFullScreen {
					mmi := (*win.MINMAXINFO)(unsafe.Pointer(lParam))
					monitorRect := getMonitorRect(h)
					workArea := getWorkArea(h)
					// PtMaxPosition is relative to the monitor origin,
					// not absolute screen coordinates. Using absolute
					// coords pushes the window off-screen on non-primary
					// monitors.
					mmi.PtMaxPosition.X = workArea.Left - monitorRect.Left
					mmi.PtMaxPosition.Y = workArea.Top - monitorRect.Top
					mmi.PtMaxSize.X = workArea.Right - workArea.Left
					mmi.PtMaxSize.Y = workArea.Bottom - workArea.Top
				}
				return 0
			}
			if msg == win.WM_NCCALCSIZE && wParam != 0 {
				// Return 0 to make the entire window client area
				// (no non-client frame). WM_GETMINMAXINFO above
				// already constrains the maximize rect to the work area.
				return 0
			}
			if msg == win.WM_SIZE {
				if wParam == win.SIZE_MAXIMIZED {
					isMaximized = true
				} else if wParam == win.SIZE_RESTORED {
					isMaximized = false
				}
			}
			return win.CallWindowProc(origProc, h, msg, wParam, lParam)
		})
		win.SetWindowLongPtr(hwnd, win.GWLP_WNDPROC, newProc)
		win.SetWindowPos(hwnd, 0, 0, 0, 0, 0,
			win.SWP_FRAMECHANGED|win.SWP_NOMOVE|win.SWP_NOSIZE|win.SWP_NOZORDER)
	}

	w.Bind("daedalusTerminal_version", func() string {
		return GetCurrentAppVersion()
	})

	w.Bind("daedalusTerminal_checkForUpdate", func() string {
		latestRelease, latestReleaseErr := GetLatestRelease()
		if latestReleaseErr != nil {
			return ""
		}

		response, jsonErr := json.Marshal(latestRelease)
		if jsonErr != nil {
			return ""
		}

		return string(response)
	})

	w.Bind("daedalusTerminal_installUpdate", func() {
		InstallUpdate()
	})

	w.Bind("daedalusTerminal_isFullScreen", func() bool {
		return isFullScreen
	})

	w.Bind("daedalusTerminal_isPinned", func() bool {
		return isPinned
	})

	w.Bind("daedalusTerminal_togglePinWindow", func() bool {
		if isFullScreen {
			// Do nothing if in fullscreen mode (option in UI should be disabled)
			return false
		}

		var rc win.RECT
		win.GetWindowRect(hwnd, &rc)

		if isPinned {
			win.SetWindowLong(hwnd, win.GWL_STYLE, defaultWindowStyle)
			win.GetWindowRect(hwnd, &rc)
			currentWindowWidth := rc.Right - rc.Left
			currentWindowHeight := rc.Bottom - rc.Top
			win.SetWindowPos(hwnd, win.HWND_NOTOPMOST, rc.Left, rc.Top, currentWindowWidth, currentWindowHeight, win.SWP_FRAMECHANGED)
			isPinned = false
		} else {
			newWindowStyle := defaultWindowStyle &^ (win.WS_BORDER | win.WS_CAPTION | win.WS_THICKFRAME | win.WS_MINIMIZEBOX | win.WS_MAXIMIZEBOX | win.WS_SYSMENU)
			win.SetWindowLong(hwnd, win.GWL_STYLE, newWindowStyle)
			win.GetWindowRect(hwnd, &rc)
			currentWindowWidth := rc.Right - rc.Left
			currentWindowHeight := rc.Bottom - rc.Top
			win.SetWindowPos(hwnd, win.HWND_TOPMOST, rc.Left, rc.Top, currentWindowWidth, currentWindowHeight, win.SWP_FRAMECHANGED)
			isPinned = true
		}

		return isPinned
	})

	w.Bind("daedalusTerminal_toggleFullScreen", func() bool {
		if isFullScreen {
			// Clear fullscreen BEFORE restoring so WM_NCCALCSIZE handler
			// can apply the work-area adjustment if restoring to maximized.
			isFullScreen = false
			if wasMaximised {
				win.ShowWindow(hwnd, win.SW_MAXIMIZE)
				// isMaximized synced by WM_SIZE handler
			} else {
				win.SetWindowPos(hwnd, 0,
					preFullScreenRect.Left, preFullScreenRect.Top,
					preFullScreenRect.Right-preFullScreenRect.Left,
					preFullScreenRect.Bottom-preFullScreenRect.Top,
					win.SWP_NOZORDER|win.SWP_FRAMECHANGED)
			}
		} else {
			// Save current state before going fullscreen
			win.GetWindowRect(hwnd, &preFullScreenRect)
			wasMaximised = isMaximized

			// Set fullscreen flag BEFORE SetWindowPos so WM_NCCALCSIZE
			// skips the work-area adjustment (we want full monitor).
			isFullScreen = true

			// Get the bounds of the monitor the window is currently on
			monitorRect := getMonitorRect(hwnd)

			// Fill the current monitor entirely — use HWND_TOP to ensure
			// the window covers the taskbar
			win.SetWindowPos(hwnd, win.HWND_TOP,
				monitorRect.Left, monitorRect.Top,
				monitorRect.Right-monitorRect.Left,
				monitorRect.Bottom-monitorRect.Top,
				win.SWP_FRAMECHANGED)

			isPinned = false
			isMaximized = false
		}
		return isFullScreen
	})

	w.Bind("daedalusTerminal_newWindow", func() int {
		terminalCmdInstance := exec.Command(filepath.Join(dirname, TERMINAL_EXECUTABLE), "--terminal=true", fmt.Sprintf("--port=%d", port))
		terminalCmdInstance.Dir = dirname
		terminalCmdErr := terminalCmdInstance.Start()

		// Exit if service fails to start
		if terminalCmdErr != nil {
			fmt.Println("Opening new terminal failed", terminalCmdErr.Error())
		}

		// Add process to process group so all windows close when main process ends
		processGroup.AddProcess(terminalCmdInstance.Process)

		go func() {
			terminalCmdInstance.Wait()
			// Code here will execute when window closes
		}()

		return 0
	})

	w.Bind("daedalusTerminal_openReleaseNotes", func() {
		runUnelevated(RELEASE_NOTES_URL)
	})

	w.Bind("daedalusTerminal_openTerminalInBrowser", func() {
		runUnelevated(url)
	})

	// FIXME Broken and sometimes causes crashes on child Windows. Don't know why.
	// To replicate, open a new window (A), then a second window (B), then close
	// A using this method then try and close B using this method. B will stop
	// responding and if repeatedly triggered will crash the entire app.
	// I have tried multiple approaches to resolve this but I think it's a bug
	// in the webview library this app imports.
	/*
		w.Bind("daedalusTerminal_closeWindow", func() int {
			w.Terminate()
			return 0
		})
	*/

	w.Bind("daedalusTerminal_quit", func() int {
		exitApplication(0)
		return 0
	})

	w.Bind("daedalusTerminal_minimizeWindow", func() {
		win.ShowWindow(hwnd, win.SW_MINIMIZE)
	})

	w.Bind("daedalusTerminal_toggleMaximize", func() bool {
		if isFullScreen {
			return false
		}
		if isMaximized {
			win.ShowWindow(hwnd, win.SW_RESTORE)
		} else {
			win.ShowWindow(hwnd, win.SW_MAXIMIZE)
		}
		// isMaximized is synced by the WM_SIZE handler
		return isMaximized
	})

	w.Bind("daedalusTerminal_isMaximized", func() bool {
		return isMaximized
	})

	// startDrag detects double-clicks by timing consecutive calls.
	// WM_NCLBUTTONDOWN enters a modal loop so JS dblclick never fires;
	// we handle it here instead.
	var lastDragTime time.Time
	w.Bind("daedalusTerminal_startDrag", func() bool {
		now := time.Now()
		if isClientWindow && now.Sub(lastDragTime) < 400*time.Millisecond {
			// Double-click detected — toggle maximize
			lastDragTime = time.Time{}
			if isFullScreen {
				return isMaximized
			}
			if isMaximized {
				win.ShowWindow(hwnd, win.SW_RESTORE)
			} else {
				win.ShowWindow(hwnd, win.SW_MAXIMIZE)
			}
			return isMaximized
		}
		lastDragTime = now
		win.ReleaseCapture()
		win.SendMessage(hwnd, win.WM_NCLBUTTONDOWN, win.HTCAPTION, 0)
		return isMaximized
	})

	// startResize initiates a native edge-drag resize using the supplied edge
	// identifier ("left", "right", "top", "bottom", "top-left", "top-right",
	// "bottom-left", "bottom-right"). Called from the JS edge-detection layer
	// which detects the cursor proximity because WebView2's child window
	// intercepts WM_NCHITTEST before the parent WndProc can act on it.
	w.Bind("daedalusTerminal_startResize", func(edge string) {
		if !isClientWindow || isFullScreen || isPinned || isMaximized {
			return
		}
		var htCode uintptr
		switch edge {
		case "left":
			htCode = HTLEFT
		case "right":
			htCode = HTRIGHT
		case "top":
			htCode = HTTOP
		case "bottom":
			htCode = HTBOTTOM
		case "top-left":
			htCode = HTTOPLEFT
		case "top-right":
			htCode = HTTOPRIGHT
		case "bottom-left":
			htCode = HTBOTTOMLEFT
		case "bottom-right":
			htCode = HTBOTTOMRIGHT
		default:
			return
		}
		win.ReleaseCapture()
		win.SendMessage(hwnd, win.WM_NCLBUTTONDOWN, htCode, 0)
	})
}

func exitApplication(exitCode int) {
	// Explicitly dispose the process group before exiting.
	// os.Exit() does not run defers, so the deferred Dispose() in main()
	// would be skipped, leaving the service process orphaned.
	processGroup.Dispose()
	os.Exit(exitCode)
}

func checkProcessAlreadyExists(windowTitle string) bool {
	_, err := gow32.CreateMutex(windowTitle)
	if err != nil {
		return true
	}

	return false
}

func killExistingServiceProcesses() {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return
	}
	defer windows.CloseHandle(snapshot)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))

	err = windows.Process32First(snapshot, &entry)
	if err != nil {
		return
	}

	for {
		name := syscall.UTF16ToString(entry.ExeFile[:])
		if name == SERVICE_EXECUTABLE {
			handle, err := windows.OpenProcess(windows.PROCESS_TERMINATE, false, entry.ProcessID)
			if err == nil {
				windows.TerminateProcess(handle, 1)
				windows.CloseHandle(handle)
				fmt.Printf("Killed orphaned service process (PID %d)\n", entry.ProcessID)
			}
		}

		err = windows.Process32Next(snapshot, &entry)
		if err != nil {
			break
		}
	}
}
