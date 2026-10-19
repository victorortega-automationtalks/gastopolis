//! Sincronización con el banco a través de Enable Banking (PSD2, solo lectura). Es lo único de la app que sale a
//! internet, y solo si conectas un banco: a una sola dirección fija (api.enablebanking.com), con tu propia credencial
//! (la clave de tu aplicación de Enable Banking), que firma cada token aquí, en tu equipo.
//!
//! - `bank_request`: petición a la API con un token RS256 recién firmado. La web no puede elegir el servidor.
//! - `bank_wait_callback`: espera en localhost a que el banco devuelva al usuario con el código de autorización.
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
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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

static CANCEL: AtomicBool = AtomicBool::new(false);

/// De «GET /callback?code=1&state=2 HTTP/1.1» saca «/callback?code=1&state=2» si es la vuelta del banco.
pub fn callback_target(request_line: &str) -> Option<String> {
    let mut parts = request_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    let path = target.split('?').next().unwrap_or("");
    (path == "/callback" || path == "/callback/").then(|| target.to_string())
}

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Gastópolis</title>\
<body style=\"font-family:system-ui;background:#06070c;color:#eef0ff;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h1>Listo</h1><p>Ya puedes cerrar esta pestaña y volver a Gastópolis.</p></div>";

fn wait_callback(port: u16, timeout: Duration) -> Result<Option<String>, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| format!("No se pudo escuchar en el puerto {port}: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let start = Instant::now();
    while start.elapsed() < timeout && !CANCEL.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut line = String::new();
                let _ = BufReader::new(&stream).read_line(&mut line);
                if let Some(target) = callback_target(&line) {
                    let _ = write!(
                        stream,
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{DONE_PAGE}",
                        DONE_PAGE.len()
                    );
                    return Ok(Some(target));
                }
                let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(150)),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(None)
}

/// Espera la vuelta del banco en http://localhost:{port}/callback. None si se cancela o pasa el tiempo.
#[tauri::command]
pub async fn bank_wait_callback(port: u16, timeout_secs: u64) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || wait_callback(port, Duration::from_secs(timeout_secs.min(1800))))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn bank_cancel_callback() {
    CANCEL.store(true, Ordering::SeqCst);
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
    fn reconoce_la_vuelta_del_banco() {
        assert_eq!(
            callback_target("GET /callback?code=abc&state=1 HTTP/1.1\r\n").as_deref(),
            Some("/callback?code=abc&state=1")
        );
        assert_eq!(callback_target("GET /favicon.ico HTTP/1.1"), None);
        assert_eq!(callback_target("POST /callback HTTP/1.1"), None);
    }

    #[test]
    fn espera_la_vuelta_en_localhost() {
        let port = 47_899;
        let handle = std::thread::spawn(move || wait_callback(port, Duration::from_secs(5)));
        std::thread::sleep(Duration::from_millis(300));
        let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(s, "GET /callback?code=XYZ&state=s HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
        let mut reply = String::new();
        let _ = std::io::Read::read_to_string(&mut s, &mut reply);
        assert!(reply.starts_with("HTTP/1.1 200"));
        assert_eq!(handle.join().unwrap().unwrap().as_deref(), Some("/callback?code=XYZ&state=s"));
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
