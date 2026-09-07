//! Noticing when a ROM folder changes underneath us.
//!
//! The library is derived from the filesystem on every scan, so keeping it
//! current is only a matter of knowing when to scan again. This watches the
//! folders and tells the window; the window asks for a fresh library, and the
//! scan does the rest.
//!
//! Events arrive in bursts — copying a file in produces a create and several
//! writes — so they are collected for a moment before anything is said. A
//! rescan is cheap but not free, and a burst should cost one, not thirty.

use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// The event the window listens for. Carries nothing: the answer is a rescan.
pub const CHANGED: &str = "library-changed";

/// How long to wait for a burst of changes to finish before speaking up.
const SETTLE: Duration = Duration::from_millis(400);

/// Watches whatever folders it is given, until dropped.
pub struct Watch {
    /// Held so the watcher lives; dropping it unwatches everything.
    inner: Mutex<Option<notify::RecommendedWatcher>>,
    /// Whether the player wants this at all.
    on: Mutex<bool>,
    folders: Mutex<Vec<PathBuf>>,
    app: AppHandle,
}

impl Watch {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Watch {
            inner: Mutex::new(None),
            on: Mutex::new(true),
            folders: Mutex::new(Vec::new()),
            app,
        })
    }

    /// Turns watching on or off, rebuilding to match.
    pub fn set_enabled(self: &Arc<Self>, on: bool) {
        if let Ok(mut held) = self.on.lock() {
            *held = on;
        }
        self.rebuild();
    }

    /// Points the watcher at a new set of folders.
    pub fn set_folders(self: &Arc<Self>, folders: Vec<PathBuf>) {
        if let Ok(mut held) = self.folders.lock() {
            *held = folders;
        }
        self.rebuild();
    }

    /// Drops the old watcher and starts one on the current folders.
    ///
    /// Rebuilt wholesale rather than diffed: the list is three or four entries
    /// and a watcher is cheap to make, so there is nothing to be gained by
    /// working out what actually changed.
    fn rebuild(self: &Arc<Self>) {
        let on = self.on.lock().map(|f| *f).unwrap_or(false);
        let folders = self.folders.lock().map(|f| f.clone()).unwrap_or_default();

        let mut held = match self.inner.lock() {
            Ok(held) => held,
            Err(_) => return,
        };
        // Dropped first, so the old watcher stops before the new one starts.
        *held = None;
        if !on || folders.is_empty() {
            return;
        }

        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            if let Ok(event) = res {
                let notify::Event { kind, .. } = &event;
                // Access times and metadata touches say nothing about what
                // the library holds; only the shape of the folder matters.
                if matches!(
                    kind,
                    EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
                ) {
                    let _ = tx.send(());
                }
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("octet: could not watch folders: {e}");
                return;
            }
        };

        for folder in &folders {
            if let Err(e) = watcher.watch(folder, RecursiveMode::Recursive) {
                // A folder that cannot be watched — an absent drive — is not
                // a reason to stop watching the others.
                eprintln!("octet: not watching {}: {e}", folder.display());
            }
        }

        // One thread per watcher generation, ending when its channel closes.
        let app = self.app.clone();
        thread::Builder::new()
            .name("octet-watch".into())
            .spawn(move || {
                while rx.recv().is_ok() {
                    // Swallow the rest of the burst, then speak once.
                    while rx.recv_timeout(SETTLE).is_ok() {}
                    let _ = app.emit(CHANGED, ());
                }
            })
            .ok();

        *held = Some(watcher);
    }
}
