use tauri::webview::Color;
use tauri::{Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

/// «Guardar como» nativo y escritura del archivo. Devuelve false si se cancela.
/// El diálogo y la escritura viven aquí: la web no recibe permiso para escribir archivos por su cuenta.
fn save_with_dialog(app: &tauri::AppHandle, file_name: &str, contents: &[u8]) -> Result<bool, String> {
    let ext = std::path::Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_string();
    let picked = app
        .dialog()
        .file()
        .set_file_name(file_name)
        .add_filter(ext.to_uppercase(), &[ext.as_str()])
        .blocking_save_file();
    let Some(path) = picked else { return Ok(false) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| format!("No se pudo guardar: {e}"))?;
    Ok(true)
}

/// Copias y CSV (texto).
#[tauri::command]
async fn save_text_file(app: tauri::AppHandle, file_name: String, contents: String) -> Result<bool, String> {
    save_with_dialog(&app, &file_name, contents.as_bytes())
}

/// Informes en PDF y Excel (binario): los bytes llegan en el cuerpo de la llamada y el nombre, codificado como en una
/// URL, en la cabecera `x-file-name`.
#[tauri::command]
async fn save_binary_file(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Se esperaba el contenido del archivo".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "informe".into());
    save_with_dialog(&app, &name, bytes)
}

/// Deshace `encodeURIComponent` (el nombre puede llevar tildes, que no caben tal cual en una cabecera).
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%'
            && i + 2 < b.len()
            && let Some(v) = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok())
        {
            out.push(v);
            i += 3;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    // Sin separadores de ruta: es solo el nombre que se propone en el diálogo.
    String::from_utf8_lossy(&out).replace(['/', '\\'], "_")
}

/// Solo se navega dentro de la propia app; cualquier otra dirección se bloquea.
fn is_internal(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost") || (cfg!(debug_assertions) && url.host_str() == Some("localhost"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_text_file, save_binary_file])
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

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodifica_el_nombre_del_archivo() {
        assert_eq!(
            percent_decode("gastopolis-informe-categor%C3%ADas-2026.pdf"),
            "gastopolis-informe-categorías-2026.pdf"
        );
        assert_eq!(percent_decode("a%2Fb%5Cc.xlsx"), "a_b_c.xlsx");
        assert_eq!(percent_decode("roto%2"), "roto%2");
    }
}
