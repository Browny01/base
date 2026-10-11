use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

pub struct Startup {
    began: Instant,
    reported: AtomicBool,
    enabled: bool,
}
impl Default for Startup {
    fn default() -> Self {
        Self {
            began: Instant::now(),
            reported: AtomicBool::new(false),
            enabled: std::env::var("BASE_DESKTOP_PROFILE").as_deref() == Ok("1"),
        }
    }
}
/// Optional numeric startup evidence only; no file paths or workspace data.
#[tauri::command]
pub fn record_frontend_ready(frontend_ms: f64, startup: tauri::State<'_, Startup>) -> bool {
    if !startup.enabled || !frontend_ms.is_finite() || !(0.0..=600_000.0).contains(&frontend_ms) {
        return false;
    }
    if !startup.reported.swap(true, Ordering::Relaxed) {
        println!(
            "BASE_PROFILE {{\"native_to_first_route_ms\":{},\"frontend_to_first_route_ms\":{}}}",
            startup.began.elapsed().as_millis(),
            frontend_ms
        );
    }
    std::env::var("BASE_DESKTOP_PROFILE_FRAMES").as_deref() == Ok("1")
}

#[tauri::command]
pub fn record_scroll_sample(
    frames: u32,
    p50_ms: f64,
    p95_ms: f64,
    max_ms: f64,
    rows: u32,
    startup: tauri::State<'_, Startup>,
) {
    if !startup.enabled
        || frames > 600
        || rows > 20_000
        || [p50_ms, p95_ms, max_ms]
            .iter()
            .any(|v| !v.is_finite() || !(0.0..=60_000.0).contains(v))
    {
        return;
    }
    println!("BASE_PROFILE {{\"scroll_frames\":{frames},\"p50_ms\":{p50_ms},\"p95_ms\":{p95_ms},\"max_ms\":{max_ms},\"rendered_rows\":{rows}}}");
}
