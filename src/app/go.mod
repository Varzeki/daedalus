module daedalus-terminal

go 1.22

require (
	github.com/gonutz/w32/v2 v2.2.2
	github.com/jchv/go-webview2 v0.0.0-20211023023319-977d8719321f
	github.com/jmoiron/jsonq v0.0.0-20150511023944-e874b168d07e
	github.com/nvsoft/win v0.0.0-20160111051136-23d143e32c41
	github.com/phayes/freeport v0.0.0-20180830031419-95f893ade6f2
	github.com/rodolfoag/gow32 v0.0.0-20160917004320-d95ff468acf8
	github.com/sqweek/dialog v0.0.0-20211002065838-9a201b55ab91
	golang.org/x/sys v0.0.0-20210218145245-beda7e5e158e
)

require (
	github.com/TheTitanrain/w32 v0.0.0-20180517000239-4f5cfb03fabf // indirect
	github.com/jchv/go-winloader v0.0.0-20250406163304-c1995be93bd1 // indirect
)

replace github.com/jchv/go-webview2 => ./third_party/go-webview2
