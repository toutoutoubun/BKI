use directories::UserDirs;
use serde_json::{json, Value};
use std::{
    env,
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::{path::BaseDirectory, AppHandle, Manager};

fn python_binary() -> String {
    env::var("BKI_PYTHON").unwrap_or_else(|_| {
        if cfg!(windows) {
            "python".to_string()
        } else {
            "python3".to_string()
        }
    })
}

fn python_main_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("BKI_PYTHON_MAIN") {
        return Ok(PathBuf::from(path));
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python/main.py");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    app.path()
        .resolve("python/main.py", BaseDirectory::Resource)
        .map_err(|error| format!("failed to resolve bundled Python sidecar: {error}"))
}

#[tauri::command]
fn run_python(app: AppHandle, command: String, payload: Value) -> Result<Value, String> {
    let python_main = python_main_path(&app)?;
    let mut child = Command::new(python_binary())
        .arg(python_main)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start Python sidecar: {error}"))?;

    let request = json!({
        "command": command,
        "payload": payload,
    })
    .to_string()
        + "\n";

    child
        .stdin
        .as_mut()
        .ok_or_else(|| "failed to open Python stdin".to_string())?
        .write_all(request.as_bytes())
        .map_err(|error| format!("failed to write Python request: {error}"))?;

    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to read Python response: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .last()
        .ok_or_else(|| "Python sidecar returned no output".to_string())?;

    serde_json::from_str(line).map_err(|error| format!("invalid Python JSON response: {error}"))
}

#[tauri::command]
fn bki_documents_dir() -> Result<String, String> {
    let user_dirs = UserDirs::new().ok_or_else(|| "failed to resolve user directories".to_string())?;
    let dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir()).join("BKI");
    fs::create_dir_all(&dir).map_err(|error| format!("failed to create BKI documents directory: {error}"))?;
    Ok(dir.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_python, bki_documents_dir])
        .run(tauri::generate_context!())
        .expect("error while running BKI");
}
