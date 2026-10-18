use tauri::webview::Color;
use tauri::{Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

/// «Guardar como» nativo para copias y CSV. Devuelve false si se cancela.
/// El diálogo y la escritura viven aquí: la web no recibe permiso para escribir archivos por su cuenta.
#[tauri::command]
async fn save_text_file(app: tauri::AppHandle, file_name: String, contents: String) -> Result<bool, String> {
    let ext = std::path::Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_string();
    let picked = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter(ext.to_uppercase(), &[ext.as_str()])
        .blocking_save_file();
    let Some(path) = picked else { return Ok(false) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| format!("No se pudo guardar: {e}"))?;
    Ok(true)
}

/// Solo se navega dentro de la propia app; cualquier otra dirección se bloquea.
fn is_internal(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost") || (cfg!(debug_assertions) && url.host_str() == Some("localhost"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_text_file])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Gastópolis")
                .inner_size(1360.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .center()
                .background_color(Color(6, 7, 12, 255))
                .on_navigation(is_internal)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("no se pudo arrancar Gastópolis");
}
