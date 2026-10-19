//! Remembers where the main window was (position, size, maximized, therefore also WHICH monitor) and puts it back on the next start.
//! The file lives next to the data it belongs to (the same folder as the database, so a throwaway or pinned data folder keeps its own
//! window and never touches another instance's). Everything here is best effort: a missing, corrupt or stale file just means the
//! default window, never a failed start. A saved position that no longer lies on a connected monitor (display unplugged, resolution
//! changed) is ignored, so the window can never open off-screen.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub const FILE_NAME: &str = "window-state.json";
const SAVE_EVERY: Duration = Duration::from_millis(600);
const MIN_SIZE: u32 = 300;

/// Physical pixels of the normal (not maximized, not minimized) window, plus whether it was maximized.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// A monitor's work area in physical pixels: x, y, width, height.
pub type MonitorRect = (i32, i32, u32, u32);

pub fn state_file_for(data_dir: &Path) -> PathBuf {
    data_dir.join(FILE_NAME)
}

pub fn load(path: &Path) -> Option<WindowState> {
    let text = std::fs::read_to_string(path).ok()?;
    let state: WindowState = serde_json::from_str(&text).ok()?;
    (state.width >= MIN_SIZE && state.height >= MIN_SIZE).then_some(state)
}

pub fn save(path: &Path, state: &WindowState) {
    if let Ok(json) = serde_json::to_string(state) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        // write-then-rename: a crash mid-write never leaves a half file that would be read as the state
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

/// The saved window is usable only if its title-bar strip (the part the student grabs) is on a connected monitor.
pub fn is_visible_on(state: &WindowState, monitors: &[MonitorRect]) -> bool {
    let probe_x = i64::from(state.x) + i64::from(state.width / 2);
    let probe_y = i64::from(state.y) + 16;
    monitors.iter().any(|&(mx, my, mw, mh)| {
        probe_x >= i64::from(mx) && probe_x < i64::from(mx) + i64::from(mw) && probe_y >= i64::from(my) && probe_y < i64::from(my) + i64::from(mh)
    })
}

/// Shrinks a saved size that is bigger than the monitor it will open on (the monitor may have a lower resolution today).
pub fn clamp_to_monitor(state: WindowState, monitors: &[MonitorRect]) -> WindowState {
    let probe_x = i64::from(state.x) + i64::from(state.width / 2);
    let probe_y = i64::from(state.y) + 16;
    let Some(&(mx, my, mw, mh)) = monitors.iter().find(|&&(mx, my, mw, mh)| {
        probe_x >= i64::from(mx) && probe_x < i64::from(mx) + i64::from(mw) && probe_y >= i64::from(my) && probe_y < i64::from(my) + i64::from(mh)
    }) else {
        return state;
    };
    let width = state.width.min(mw);
    let height = state.height.min(mh);
    let x = state.x.max(mx).min(mx + (mw - width) as i32);
    let y = state.y.max(my).min(my + (mh - height) as i32);
    WindowState { x, y, width, height, maximized: state.maximized }
}

/// Throttle for the stream of Moved/Resized events while a window is dragged: at most one disk write per SAVE_EVERY; the close always saves.
pub struct Throttle {
    last: Option<Instant>,
}

impl Throttle {
    pub fn new() -> Self {
        Self { last: None }
    }
    pub fn due(&mut self) -> bool {
        let now = Instant::now();
        match self.last {
            Some(prev) if now.duration_since(prev) < SAVE_EVERY => false,
            _ => {
                self.last = Some(now);
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEFT: MonitorRect = (0, 0, 1920, 1080);
    const RIGHT: MonitorRect = (1920, 0, 1280, 1024);
    const ABOVE: MonitorRect = (0, -1080, 1920, 1080);

    fn state(x: i32, y: i32) -> WindowState {
        WindowState { x, y, width: 800, height: 600, maximized: false }
    }

    #[test]
    fn a_window_on_the_second_monitor_stays_there() {
        let s = state(2200, 100);
        assert!(is_visible_on(&s, &[LEFT, RIGHT]));
        assert_eq!(clamp_to_monitor(s, &[LEFT, RIGHT]), s, "a window that fits is not moved");
    }

    #[test]
    fn a_window_whose_monitor_is_gone_is_ignored_so_it_never_opens_off_screen() {
        assert!(!is_visible_on(&state(2200, 100), &[LEFT]));
        assert!(!is_visible_on(&state(100, 5000), &[LEFT, RIGHT]));
    }

    #[test]
    fn a_monitor_above_with_negative_coordinates_works() {
        assert!(is_visible_on(&state(300, -900), &[LEFT, ABOVE]));
    }

    #[test]
    fn a_size_larger_than_todays_monitor_is_shrunk_and_pulled_inside() {
        let big = WindowState { x: 1000, y: 0, width: 1600, height: 1100, maximized: false };
        let fixed = clamp_to_monitor(big, &[LEFT]);
        assert!(fixed.width <= 1920 && fixed.height <= 1080);
        assert!(fixed.x + fixed.width as i32 <= 1920 && fixed.y >= 0);
        assert!(is_visible_on(&fixed, &[LEFT]));
    }

    #[test]
    fn save_then_load_round_trips_and_garbage_is_ignored() {
        let dir = std::env::temp_dir().join(format!("sl-window-state-{}", std::process::id()));
        let file = state_file_for(&dir);
        let s = WindowState { x: -20, y: 40, width: 1000, height: 700, maximized: true };
        save(&file, &s);
        assert_eq!(load(&file), Some(s));
        std::fs::write(&file, "not json").unwrap();
        assert_eq!(load(&file), None);
        std::fs::write(&file, r#"{"x":0,"y":0,"width":10,"height":10,"maximized":false}"#).unwrap();
        assert_eq!(load(&file), None, "an absurdly small saved size is not trusted");
        assert_eq!(load(&dir.join("missing.json")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_throttle_lets_the_first_event_through_and_then_waits() {
        let mut t = Throttle::new();
        assert!(t.due());
        assert!(!t.due());
    }
}
