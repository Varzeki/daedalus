package edge

import "unsafe"

const (
	hResultNoInterface = 0x80004002
	hResultPointer     = 0x80004003
)

var (
	iidIUnknown                                                   = NewGUID("{00000000-0000-0000-C000-000000000046}")
	iidICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler = NewGUID("{4E8A3389-C9D8-4BD2-B6B5-124FEE6CC14D}")
	iidICoreWebView2CreateCoreWebView2ControllerCompletedHandler  = NewGUID("{6C4819F3-C9B7-4260-8127-C9F5BDE7F68C}")
)

func guidEqual(left, right *GUID) bool {
	if left == nil || right == nil {
		return false
	}

	return left.Data1 == right.Data1 &&
		left.Data2 == right.Data2 &&
		left.Data3 == right.Data3 &&
		left.Data4 == right.Data4
}

func assignQueryInterfacePointer(object uintptr, pointer uintptr) uintptr {
	if object == 0 {
		return hResultPointer
	}

	*(*uintptr)(unsafe.Pointer(object)) = pointer
	return 0
}

func rejectQueryInterface(object uintptr) uintptr {
	if object != 0 {
		*(*uintptr)(unsafe.Pointer(object)) = 0
	}

	return hResultNoInterface
}
