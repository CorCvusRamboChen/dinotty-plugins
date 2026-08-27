//! Windows launcher for the claude-remote sidecar.
//!
//! dinotty resolves `bin.entries["windows-x86_64"]` to this executable and runs
//! it with CreateProcess, which cannot execute a `.cmd` or a shebang script. So
//! this forwards argv straight to `node dist/cli`, with no command interpreter
//! in between — nothing here re-parses or re-quotes the arguments.
//!
//! Build with the repo's pinned toolchain:
//!   npm run build:windows-launcher

use std::env;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, ExitCode};

/// dinotty starts this launcher with CREATE_NO_WINDOW, but that does not reach
/// the node process the launcher starts. Without it a console window flashes on
/// every sidecar and permission-server spawn.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn main() -> ExitCode {
    let exe = match env::current_exe() {
        Ok(path) => path,
        Err(e) => return fail(&format!("cannot resolve launcher path: {e}")),
    };
    let dir: PathBuf = match exe.parent() {
        Some(dir) => dir.to_path_buf(),
        None => return fail("launcher has no parent directory"),
    };
    let script = dir.join("cli");
    if !script.is_file() {
        return fail(&format!("CLI bundle not found at {}", script.display()));
    }

    // `node` is looked up on PATH by CreateProcess. dinotty injects the host
    // environment, so a Node installed for the user is visible here.
    let mut command = Command::new("node");
    command.creation_flags(CREATE_NO_WINDOW);
    command.arg(&script);
    command.args(env::args_os().skip(1));

    match command.status() {
        Ok(status) => ExitCode::from(status.code().unwrap_or(1).clamp(0, 255) as u8),
        Err(e) => fail(&format!("failed to launch node: {e}. Is Node.js on PATH?")),
    }
}

fn fail(message: &str) -> ExitCode {
    eprintln!("claude-remote launcher: {message}");
    ExitCode::from(1)
}
