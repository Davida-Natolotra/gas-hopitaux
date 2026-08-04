//! Keeps the binary loadable on Windows 7.
//!
//! Tauri links Microsoft's *static* WebView2 loader
//! (`WebView2LoaderStatic.lib`, via `webview2-com-sys`), and that library was
//! built with ETW tracing that calls `EventSetInformation`. That API only
//! exists from Windows 8 onward, so linking it produces a static import of
//! `advapi32.dll!EventSetInformation`. Windows 7's loader resolves imports
//! before `main` runs, fails to find it, and kills the process with
//! "Point d'entrée introuvable" — the app never gets far enough to open a
//! window.
//!
//! Defining the symbol ourselves means the linker resolves the loader's
//! reference against this object instead of pulling the entry in from
//! `advapi32.lib`, so no import record is emitted and the process starts.
//! `EventSetInformation` only attaches optional metadata ("provider traits")
//! to an ETW provider registration, so a no-op that reports success just
//! leaves WebView2's tracing unannotated — it has no bearing on the webview
//! itself. The other two ETW calls (`EventRegister`, `EventWriteTransfer`)
//! date to Vista and are left alone.
//!
//! Both symbol spellings are needed: MSVC emits direct calls against
//! `EventSetInformation` and indirect ones through the import thunk
//! `__imp_EventSetInformation`, and the static loader references both.
//!
//! Verify after touching this or bumping Tauri/wry — the symbol must not
//! reappear in the import table:
//!
//! ```text
//! dumpbin /imports target/release/GAS_HOPITAUX.exe | findstr EventSetInformation
//! ```

use std::ffi::c_void;

/// `ULONG EVNTAPI EventSetInformation(REGHANDLE, EVENT_INFO_CLASS, PVOID, ULONG)`
type EventSetInformationFn =
    unsafe extern "system" fn(u64, i32, *mut c_void, u32) -> u32;

/// ERROR_SUCCESS — the caller treats a failure as "traits unsupported" anyway,
/// but reporting success keeps it off any retry path.
const ERROR_SUCCESS: u32 = 0;

// Deliberately not `pub`: `#[no_mangle]` still gives these external linkage so
// the linker can see them, but keeping them private stops rustc from listing
// them in the cdylib's export .def — link.exe rejects an `__imp_`-prefixed
// export outright (LNK1106).
#[no_mangle]
unsafe extern "system" fn EventSetInformation(
    _reg_handle: u64,
    _information_class: i32,
    _information: *mut c_void,
    _information_length: u32,
) -> u32 {
    ERROR_SUCCESS
}

/// The import thunk the compiler emits for indirect calls. Defining it as a
/// pointer to our stub mirrors what the real IAT slot would hold.
#[used]
#[no_mangle]
static __imp_EventSetInformation: EventSetInformationFn = EventSetInformation;
