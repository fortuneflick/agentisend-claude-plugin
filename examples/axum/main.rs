// Axum — the function a handler calls.
//
// Axum 0.8 routes a POST to an async handler that extracts Json. That handler
// calls `send` below. This binary does not compile axum: the standard library
// has no HTTP client, so `send` uses ureq for the request and for TLS, the
// same call the handler would make. There is no Rust package for this API.
// AGENTISEND_API_KEY is the key. MAIL_FROM is an address on a domain you have
// verified. AGENTISEND_BASE_URL is optional.
//
// Run: cargo run --quiet

use std::env;
use std::io::{self, Write};

fn env_var(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("Set {name}."))
}

fn mail_from() -> String {
    let from = env_var("MAIL_FROM");
    if from.is_empty() {
        panic!("Set MAIL_FROM to an address on a domain you have verified.");
    }
    from
}

fn base_url() -> String {
    env::var("AGENTISEND_BASE_URL")
        .unwrap_or_else(|_| "https://api.agentisend.com".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn address_ok(email: &str) -> bool {
    let mut parts = email.split('@');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(local), Some(host), None) if !local.is_empty() && !local.contains(char::is_whitespace) => {
            host.split('.').filter(|label| !label.is_empty()).count() >= 2
        }
        _ => false,
    }
}

fn json_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn json_string<'a>(raw: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{key}\"");
    let start = raw.find(&needle)? + needle.len();
    let rest = raw[start..].trim_start_matches([':', ' ', '\n', '\t']);
    let rest = rest.strip_prefix('"')?;
    let end = rest.find('"')?;
    Some(&rest[..end])
}

struct Outcome {
    status: u16,
    id: Option<String>,
    code: Option<String>,
    fix: Option<String>,
    error: Option<String>,
}

fn send(email: &str, note: &str) -> Outcome {
    let email = email.trim();
    if !address_ok(email) {
        return Outcome {
            status: 400,
            id: None,
            code: None,
            fix: None,
            error: Some("email must be one address, like you@example.com".to_string()),
        };
    }

    let payload = format!(
        "{{\"from\":\"{}\",\"to\":\"{}\",\"subject\":\"Your release is out\",\"text\":\"Release note: {}\"}}",
        json_escape(&mail_from()),
        json_escape(email),
        json_escape(note)
    );
    let url = format!("{}/emails", base_url());
    let idem = format!("release/{email}");
    let key = env_var("AGENTISEND_API_KEY");

    let (status, body) = match ureq::post(&url)
        .set("authorization", &format!("Bearer {key}"))
        .set("content-type", "application/json")
        .set("accept", "application/json")
        .set("idempotency-key", &idem)
        .send_string(&payload)
    {
        Ok(response) => {
            let status = response.status();
            let text = response.into_string().unwrap_or_default();
            (status, text)
        }
        Err(ureq::Error::Status(status, response)) => {
            let text = response.into_string().unwrap_or_default();
            (status, text)
        }
        Err(err) => panic!("request failed: {err}"),
    };

    if status >= 400 {
        return Outcome {
            status,
            id: None,
            code: json_string(&body, "code").map(str::to_string),
            fix: json_string(&body, "fix").map(str::to_string),
            error: None,
        };
    }
    Outcome {
        status,
        id: json_string(&body, "id").map(str::to_string),
        code: None,
        fix: None,
        error: None,
    }
}

fn emit(step: &str, result: &Outcome) {
    let mut out = format!("{{\"step\":\"{step}\",\"status\":{}", result.status);
    if let Some(id) = &result.id {
        out.push_str(&format!(",\"id\":\"{}\"", json_escape(id)));
    }
    if let Some(code) = &result.code {
        out.push_str(&format!(",\"code\":\"{}\"", json_escape(code)));
    }
    if let Some(fix) = &result.fix {
        out.push_str(&format!(",\"fix\":\"{}\"", json_escape(fix)));
    }
    if let Some(error) = &result.error {
        out.push_str(&format!(",\"error\":\"{}\"", json_escape(error)));
    }
    out.push('}');
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{out}").unwrap();
}

fn main() {
    emit("send", &send("axum@example.com", "first"));
    emit("retry", &send("axum@example.com", "first"));
    emit("invalid", &send("not-an-address", "first"));
    emit("refused", &send("axum@example.com", "second"));
}
