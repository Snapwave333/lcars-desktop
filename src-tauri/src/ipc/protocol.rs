use serde::{Deserialize, Serialize};

pub const PIPE_NAME: &str = r"\\.\pipe\lcars_cli";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
  pub id: String,
  pub cmd: String,
  #[serde(default)]
  pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
  pub id: String,
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<serde_json::Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl Response {
  pub fn ok(id: String, data: serde_json::Value) -> Self {
    Self {
      id,
      ok: true,
      data: Some(data),
      error: None,
    }
  }

  pub fn err(id: String, error: String) -> Self {
    Self {
      id,
      ok: false,
      data: None,
      error: Some(error),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn test_request_serialization() {
    let req = Request {
      id: "req-123".to_string(),
      cmd: "alert".to_string(),
      args: json!({ "mode": "red" }),
    };
    let json_str = serde_json::to_string(&req).expect("serialize request");
    let decoded: Request = serde_json::from_str(&json_str).expect("deserialize request");
    assert_eq!(decoded.id, "req-123");
    assert_eq!(decoded.cmd, "alert");
    assert_eq!(decoded.args["mode"], "red");
  }

  #[test]
  fn test_response_ok() {
    let res = Response::ok("res-1".to_string(), json!({ "visible": true }));
    assert!(res.ok);
    assert!(res.error.is_none());
    assert_eq!(res.data.unwrap()["visible"], true);
  }

  #[test]
  fn test_response_err() {
    let res = Response::err("res-2".to_string(), "failure".to_string());
    assert!(!res.ok);
    assert!(res.data.is_none());
    assert_eq!(res.error.as_deref(), Some("failure"));
  }
}

