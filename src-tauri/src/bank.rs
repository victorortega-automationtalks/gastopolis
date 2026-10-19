//! Sincronización con el banco a través de Enable Banking (PSD2, solo lectura). Es lo único de la app que sale a
//! internet, y solo si conectas un banco: a una sola dirección fija (api.enablebanking.com), con tu propia credencial
//! (la clave de tu aplicación de Enable Banking), que firma cada token aquí, en tu equipo.
//!
//! - `bank_request`: petición a la API con un token RS256 recién firmado. La web no puede elegir el servidor.
//! - `bank_auth_window`: ventana de la app para entrar en el banco; recoge la vuelta con el código sin cargarla.
//! - `open_external`: abre la página del banco (o la de Enable Banking) en el navegador del sistema.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rsa::RsaPrivateKey;
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::DecodePrivateKey;
use rsa::signature::{SignatureEncoding, Signer};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const API: &str = "https://api.enablebanking.com";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BankCall {
    app_id: String,
    key_pem: String,
    method: String,
    path: String,
    #[serde(default)]
    query: Vec<(String, String)>,
    body: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct BankResponse {
    status: u16,
    body: String,
}

/// Token de la API: cabecera con el id de la aplicación, válido una hora, firmado con RS256.
pub fn sign_jwt(app_id: &str, key_pem: &str, now: u64) -> Result<String, String> {
    let key = RsaPrivateKey::from_pkcs8_pem(key_pem)
        .or_else(|_| RsaPrivateKey::from_pkcs1_pem(key_pem))
        .map_err(|_| "El archivo .pem no es una clave privada RSA válida".to_string())?;
    let header = serde_json::json!({ "typ": "JWT", "alg": "RS256", "kid": app_id });
    let claims = serde_json::json!({ "iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": now, "exp": now + 3600 });
    let input = format!("{}.{}", URL_SAFE_NO_PAD.encode(header.to_string()), URL_SAFE_NO_PAD.encode(claims.to_string()));
    let signature = SigningKey::<Sha256>::new(key).sign(input.as_bytes()).to_bytes();
    Ok(format!("{input}.{}", URL_SAFE_NO_PAD.encode(signature)))
}

/// La ruta tiene que ser de la API, sin forma de cambiar de servidor.
fn valid_path(path: &str) -> bool {
    path.starts_with('/') && !path.contains("//") && !path.contains("..") && !path.contains('@') && !path.contains('\\') && !path.contains('#')
}

fn request(call: BankCall) -> Result<BankResponse, String> {
    if !valid_path(&call.path) {
        return Err("Ruta de la API no válida".into());
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
    let token = format!("Bearer {}", sign_jwt(&call.app_id, &call.key_pem, now)?);
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .tls_config(ureq::tls::TlsConfig::builder().provider(ureq::tls::TlsProvider::NativeTls).build())
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(60)))
        .build()
        .into();
    let url = format!("{API}{}", call.path);
    let query = call.query.iter().map(|(k, v)| (k.as_str(), v.as_str()));
    let result = match call.method.as_str() {
        "GET" => agent.get(&url).header("Authorization", &token).query_pairs(query).call(),
        "DELETE" => agent.delete(&url).header("Authorization", &token).query_pairs(query).call(),
        "POST" => agent
            .post(&url)
            .header("Authorization", &token)
            .header("Content-Type", "application/json")
            .query_pairs(query)
            .send(call.body.unwrap_or(serde_json::Value::Null).to_string()),
        other => return Err(format!("Método no permitido: {other}")),
    };
    let mut res = result.map_err(|e| format!("No se pudo conectar con Enable Banking: {e}"))?;
    let status = res.status().as_u16();
    let body = res
        .body_mut()
        .with_config()
        .limit(20 * 1024 * 1024)
        .read_to_string()
        .map_err(|e| e.to_string())?;
    Ok(BankResponse { status, body })
}

#[tauri::command]
pub async fn bank_request(call: BankCall) -> Result<BankResponse, String> {
    tauri::async_runtime::spawn_blocking(move || request(call)).await.map_err(|e| e.to_string())?
}

/// ¿Es esta navegación la vuelta del banco? Mismo esquema, servidor y ruta que la dirección de vuelta registrada.
pub fn is_redirect(url: &str, redirect: &str) -> bool {
    let (Ok(u), Ok(r)) = (tauri::Url::parse(url), tauri::Url::parse(redirect)) else {
        return false;
    };
    u.scheme() == r.scheme()
        && u.host_str() == r.host_str()
        && u.port_or_known_default() == r.port_or_known_default()
        && u.path().trim_end_matches('/') == r.path().trim_end_matches('/')
}

/// Entrar en el banco dentro de una ventana de la app. Cuando el banco devuelve al usuario a la dirección de vuelta,
/// la ventana lo detecta antes de cargarla (no sale ninguna petición hacia esa dirección), se cierra y devuelve la
/// dirección con el código. Así vale cualquier dirección https registrada en Enable Banking, aunque no exista.
/// La ventana no tiene permisos de la app (las capacidades son solo de «main») y solo navega por https.
/// Devuelve None si el usuario la cierra o pasa media hora.
#[tauri::command]
pub async fn bank_auth_window(app: tauri::AppHandle, url: String, redirect: String) -> Result<Option<String>, String> {
    use tauri::Manager;
    let start = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if start.scheme() != "https" {
        return Err("La página del banco tiene que ser https".into());
    }
    if let Some(old) = app.get_webview_window("bank-auth") {
        let _ = old.destroy();
    }
    let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
    let on_nav = tx.clone();
    let window = tauri::WebviewWindowBuilder::new(&app, "bank-auth", tauri::WebviewUrl::External(start))
        .title("Gastópolis · Entra en tu banco")
        .inner_size(960.0, 780.0)
        .center()
        .on_navigation(move |u| {
            if is_redirect(u.as_str(), &redirect) {
                let _ = on_nav.send(Some(u.to_string()));
                return false;
            }
            u.scheme() == "https"
        })
        .build()
        .map_err(|e| e.to_string())?;
    window.on_window_event(move |e| {
        if let tauri::WindowEvent::Destroyed = e {
            let _ = tx.send(None);
        }
    });
    let got = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(1800)).ok().flatten())
        .await
        .map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("bank-auth") {
        let _ = w.destroy();
    }
    Ok(got)
}

/// Abre una dirección https en el navegador del sistema (la página del banco, el panel de Enable Banking…).
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_control() || c == ' ') {
        return Err("Solo se abren direcciones https".into());
    }
    open::that_detached(&url).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::pkcs1v15::{Signature, VerifyingKey};
    use rsa::pkcs8::{EncodePrivateKey, LineEnding};
    use rsa::signature::Verifier;

    #[test]
    fn firma_un_token_que_se_verifica_con_la_clave_publica() {
        let mut rng = rand::thread_rng();
        let key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let pem = key.to_pkcs8_pem(LineEnding::LF).unwrap();
        let jwt = sign_jwt("app-123", &pem, 1_700_000_000).unwrap();
        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3);
        let header: serde_json::Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0]).unwrap()).unwrap();
        assert_eq!(header["alg"], "RS256");
        assert_eq!(header["kid"], "app-123");
        let claims: serde_json::Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).unwrap()).unwrap();
        assert_eq!(claims["aud"], "api.enablebanking.com");
        assert_eq!(claims["exp"].as_u64().unwrap() - claims["iat"].as_u64().unwrap(), 3600);
        let sig = Signature::try_from(URL_SAFE_NO_PAD.decode(parts[2]).unwrap().as_slice()).unwrap();
        let verifier = VerifyingKey::<Sha256>::new(key.to_public_key());
        assert!(verifier.verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &sig).is_ok());
        assert!(sign_jwt("app", "no es una clave", 0).is_err());
    }

    #[test]
    fn solo_rutas_de_la_api() {
        assert!(valid_path("/accounts/abc/transactions"));
        assert!(!valid_path("https://otro.com/x"));
        assert!(!valid_path("//otro.com/x"));
        assert!(!valid_path("/../x"));
        assert!(!valid_path("@otro.com"));
    }

    #[test]
    fn detecta_la_direccion_de_vuelta() {
        let r = "https://gastopolis.invalid/callback";
        assert!(is_redirect("https://gastopolis.invalid/callback?code=1&state=2", r));
        assert!(is_redirect("https://gastopolis.invalid/callback/?code=1", r));
        assert!(!is_redirect("https://gastopolis.invalid/otra?code=1", r));
        assert!(!is_redirect("https://banco.es/callback?code=1", r));
        assert!(!is_redirect("http://gastopolis.invalid/callback?code=1", r));
    }
}

#[cfg(test)]
mod red {
    use super::*;
    use rsa::pkcs8::{EncodePrivateKey, LineEnding};

    /// Con red: la API responde (401, porque la clave es inventada). `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn llega_a_enable_banking() {
        let key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let pem = key.to_pkcs8_pem(LineEnding::LF).unwrap().to_string();
        let r = request(BankCall {
            app_id: "00000000-0000-0000-0000-000000000000".into(),
            key_pem: pem,
            method: "GET".into(),
            path: "/aspsps".into(),
            query: vec![("country".into(), "ES".into())],
            body: None,
        })
        .unwrap();
        println!("{} {}", r.status, &r.body[..r.body.len().min(200)]);
        assert!(r.status == 401 || r.status == 403 || r.status == 422, "{}", r.status);
    }
}
