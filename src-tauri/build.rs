fn main() {
    // The Tauri CLI sets STATIC_VCRUNTIME=true for `tauri build`, which makes
    // tauri-build emit `/NODEFAULTLIB:libucrt.lib` + `/DEFAULTLIB:ucrt.lib`.
    // That statically links vcruntime but deliberately keeps the *Universal*
    // CRT dynamic, which is fine on Windows 10 (it ships the UCRT) and fatal on
    // Windows 7 (it does not): the app dies at startup with "il manque
    // api-ms-win-crt-math-l1-1-0.dll".
    //
    // Those link args are emitted unconditionally and `/NODEFAULTLIB` cannot be
    // undone downstream, so the only way to opt out is to take the trigger away
    // before tauri-build reads it. Clearing the variable here leaves the CRT
    // choice to `-C target-feature=+crt-static` in .cargo/config.toml, which
    // links libcmt + libvcruntime + libucrt and produces an exe with no CRT DLL
    // imports at all. That covers what STATIC_VCRUNTIME was for (no VC++
    // redistributable needed) and then some.
    //
    // Only affects this build script's own process, so tauri-build's
    // `env::var_os` lookup sees it as unset.
    #[cfg(all(windows, target_env = "msvc"))]
    std::env::remove_var("STATIC_VCRUNTIME");

    tauri_build::build()
}
