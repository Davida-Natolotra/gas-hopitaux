// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Lives in the binary crate rather than the library: the shim only has to be
// present in the executable that Windows 7 loads, and the library also builds
// as a cdylib, whose generated export .def link.exe refuses (LNK1106).
#[cfg(all(windows, target_env = "msvc"))]
mod win7_etw_shim;

fn main() {
    rfs_lib::run()
}
