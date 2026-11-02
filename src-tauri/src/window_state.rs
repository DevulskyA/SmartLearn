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

/// The size of a window that has nothing to restore (first run, or the monitor it was on is gone): the comfortable page size (logical 1280x820,
/// scaled to the display) but never bigger than 95% of the monitor it opens on.
pub fn first_run_size(monitor_width: u32, monitor_height: u32, scale: f64) -> (u32, u32) {
    let want_w = (1280.0 * scale).round() as u32;
    let want_h = (820.0 * scale).round() as u32;
    let max_w = (f64::from(monitor_width) * 0.95) as u32;
    let max_h = (f64::from(monitor_height) * 0.95) as u32;
    (want_w.min(max_w).max(MIN_SIZE), want_h.min(max_h).max(MIN_SIZE))
}

/// True for Windows display 1 (device name `\\.\DISPLAY1`), the number Windows Settings shows for that monitor.
pub fn is_display_one(device_name: &str) -> bool {
    device_name.ends_with("DISPLAY1")
}

/// Top-left corner that centres a window of this size on the given monitor (never above/left of the monitor's origin).
pub fn centered_in(monitor: MonitorRect, width: u32, height: u32) -> (i32, i32) {
    let (mx, my, mw, mh) = monitor;
    (mx + (mw.saturating_sub(width) / 2) as i32, my + (mh.saturating_sub(height) / 2) as i32)
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

/// Decides what is written now and what is held back. The throttle alone drops the LAST move of a drag, so a process killed right
/// after it (console closed, launcher relaunch, shutdown) would reopen at a mid-drag spot, maybe on the wrong monitor: the held-back
/// state is kept and a flusher writes it with `take_pending`.
pub struct Saver {
    throttle: Throttle,
    pending: Option<WindowState>,
}

impl Saver {
    pub fn new() -> Self {
        Self { throttle: Throttle::new(), pending: None }
    }
    /// Returns the state to write right now, or None when it was held back (it stays pending).
    pub fn record(&mut self, next: WindowState, closing: bool) -> Option<WindowState> {
        if closing || self.throttle.due() {
            self.pending = None;
            Some(next)
        } else {
            self.pending = Some(next);
            None
        }
    }
    pub fn take_pending(&mut self) -> Option<WindowState> {
        self.pending.take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_one_is_recognised_by_its_windows_device_name() {
        assert!(is_display_one(r"\\.\DISPLAY1"));
        assert!(!is_display_one(r"\\.\DISPLAY2"));
        assert!(!is_display_one(r"\\.\DISPLAY11"));
    }

    #[test]
    fn a_first_run_window_is_centred_on_the_chosen_monitor_even_one_left_of_the_origin() {
        // a 1440x900 monitor at x=-1440 (the layout of this machine): the window lands inside it, not on the primary
        assert_eq!(centered_in((-1440, 0, 1440, 900), 1280, 820), (-1360, 40));
    }

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
    fn two_monitors_yesterday_one_today_starts_from_scratch_on_the_connected_one() {
        // saved on the second monitor, which is not plugged in any more: the saved state is ignored (so the window opens fresh, centred)
        let saved = state(2200, 100);
        assert!(!is_visible_on(&saved, &[LEFT]));
        // and the fresh window is the comfortable size, shrunk to a small laptop screen
        assert_eq!(first_run_size(1920, 1080, 1.0), (1280, 820));
        assert_eq!(first_run_size(1366, 768, 1.0), (1280, 729));
        assert_eq!(first_run_size(1920, 1080, 1.5), (1824, 1026));
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

    #[test]
    fn the_last_move_of_a_drag_is_never_lost_even_if_the_throttle_held_it_back() {
        // regression: dragging to another monitor and killing the app right away reopened at a mid-drag position
        let mut saver = Saver::new();
        let mut written = Vec::new();
        for step in 0..25 {
            if let Some(s) = saver.record(state(-100 * step, 80), false) {
                written.push(s);
            }
        }
        assert_eq!(written, vec![state(0, 80)], "only the first move is written at once");
        assert_eq!(saver.take_pending(), Some(state(-2400, 80)), "the final position is waiting for the flusher");
        assert_eq!(saver.take_pending(), None, "and is written only once");
    }

    #[test]
    fn closing_writes_at_once_and_clears_whatever_was_pending() {
        let mut saver = Saver::new();
        saver.record(state(0, 0), false);
        saver.record(state(-500, 10), false);
        assert_eq!(saver.record(state(-1300, 80), true), Some(state(-1300, 80)));
        assert_eq!(saver.take_pending(), None, "the close already wrote the final state");
    }
}
