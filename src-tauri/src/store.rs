//! What the app remembers between runs.
//!
//! Two things, and deliberately only two: which folders to scan, and what the
//! player has done with each cartridge. The list of ROMs itself is never
//! stored — it is derived from the filesystem on every scan, so a folder that
//! has gone away needs no reconciling. Marks are keyed by path and simply go
//! unmentioned while their drive is absent.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// A folder the player added, and whether it is currently being scanned.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub path: String,
    pub enabled: bool,
}

/// What has happened to one cartridge. Absent until something has.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mark {
    #[serde(default)]
    pub favorite: bool,
    /// Total minutes played, accumulated across sessions.
    #[serde(default)]
    pub play_minutes: u32,
    /// When the last session ended, in milliseconds since the epoch.
    #[serde(default)]
    pub last_played_at: Option<i64>,
}

/// What is in one save slot. The state itself is a file; this is its label.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slot {
    /// When it was written, in milliseconds since the epoch.
    pub saved_at: i64,
    /// The cartridge's total playtime at the moment it was written.
    pub play_minutes: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Store {
    pub folders: Vec<Folder>,
    /// Keyed by the cartridge's absolute path.
    pub marks: BTreeMap<String, Mark>,
    /// Save slots, by cartridge path and then by slot number.
    ///
    /// Only the labels. The states are files of their own, because a machine
    /// snapshot is tens of kilobytes and this file is read at every launch.
    pub slots: BTreeMap<String, BTreeMap<u8, Slot>>,
}

impl Store {
    /// Reads the store, or hands back an empty one.
    ///
    /// A file that will not parse is treated as absent rather than fatal: the
    /// worst case is a player re-adding their folders, which is a great deal
    /// better than an app that will not start.
    pub fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    /// Writes the store, creating its directory if need be.
    ///
    /// Written to a sibling file and renamed over the real one, so a crash
    /// mid-write leaves the previous store intact rather than a half a one.
    /// Rename is atomic within a filesystem, which these two share by
    /// construction.
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string_pretty(self)?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, text)?;
        fs::rename(&tmp, path)
    }

    /// The folders a scan should walk, as `(path, enabled)`.
    pub fn scan_list(&self) -> Vec<(PathBuf, bool)> {
        self.folders
            .iter()
            .map(|f| (PathBuf::from(&f.path), f.enabled))
            .collect()
    }

    /// Adds a folder if it is new. Returns whether anything changed.
    ///
    /// Adding a folder already covered by another is allowed — people organise
    /// their collections in overlapping ways, and the scan lists a cartridge
    /// once regardless of how many folders reach it.
    pub fn add_folder(&mut self, path: String) -> bool {
        if self.folders.iter().any(|f| f.path == path) {
            return false;
        }
        self.folders.push(Folder {
            path,
            enabled: true,
        });
        true
    }

    pub fn remove_folder(&mut self, path: &str) {
        self.folders.retain(|f| f.path != path);
    }

    pub fn set_folder_enabled(&mut self, path: &str, enabled: bool) {
        if let Some(folder) = self.folders.iter_mut().find(|f| f.path == path) {
            folder.enabled = enabled;
        }
    }

    /// Credits a finished session to a cartridge, and stamps when it ended.
    ///
    /// Added to the running total rather than replacing it, so a short session
    /// after a long one does not erase the long one.
    pub fn add_playtime(&mut self, path: &str, minutes: u32) {
        let mark = self.marks.entry(path.to_string()).or_default();
        mark.play_minutes = mark.play_minutes.saturating_add(minutes);
        mark.last_played_at = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0),
        );
    }

    /// Marks or unmarks a favourite, forgetting the entry once it says nothing.
    pub fn set_favorite(&mut self, path: &str, favorite: bool) {
        let mark = self.marks.entry(path.to_string()).or_default();
        mark.favorite = favorite;
        self.prune(path);
    }

    /// Drops a mark that has nothing left to say, so the store does not grow
    /// an entry for every cartridge merely looked at.
    fn prune(&mut self, path: &str) {
        let empty = self
            .marks
            .get(path)
            .is_some_and(|m| !m.favorite && m.play_minutes == 0 && m.last_played_at.is_none());
        if empty {
            self.marks.remove(path);
        }
    }

    /// Records what went into a slot.
    pub fn set_slot(&mut self, path: &str, slot: u8, meta: Slot) {
        self.slots
            .entry(path.to_string())
            .or_default()
            .insert(slot, meta);
    }

    /// What one cartridge has in its slots.
    pub fn slots_for(&self, path: &str) -> BTreeMap<u8, Slot> {
        self.slots.get(path).cloned().unwrap_or_default()
    }

    pub fn mark(&self, path: &str) -> Mark {
        self.marks.get(path).cloned().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("octet-store-{name}.json"));
        let _ = fs::remove_file(&path);
        path
    }

    #[test]
    fn survives_a_round_trip() {
        let path = scratch("round-trip");
        let mut store = Store::default();
        store.add_folder("/roms/nes".into());
        store.add_folder("/roms/unsorted".into());
        store.set_folder_enabled("/roms/unsorted", false);
        store.set_favorite("/roms/nes/astro vole.nes", true);
        store.save(&path).unwrap();

        let back = Store::load(&path);
        assert_eq!(back.folders.len(), 2);
        assert!(back.folders[0].enabled);
        assert!(!back.folders[1].enabled);
        assert!(back.mark("/roms/nes/astro vole.nes").favorite);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn refuses_to_add_the_same_folder_twice() {
        let mut store = Store::default();
        assert!(store.add_folder("/roms/nes".into()));
        assert!(!store.add_folder("/roms/nes".into()));
        assert_eq!(store.folders.len(), 1);
    }

    #[test]
    fn forgets_a_mark_with_nothing_left_to_say() {
        let mut store = Store::default();
        store.set_favorite("/a.nes", true);
        assert_eq!(store.marks.len(), 1);
        store.set_favorite("/a.nes", false);
        assert!(
            store.marks.is_empty(),
            "an unfavourited cartridge should leave no trace behind"
        );
    }

    #[test]
    fn keeps_a_mark_that_still_has_playtime() {
        let mut store = Store::default();
        store.set_favorite("/a.nes", true);
        store.marks.get_mut("/a.nes").unwrap().play_minutes = 12;
        store.set_favorite("/a.nes", false);
        assert_eq!(store.mark("/a.nes").play_minutes, 12, "playtime outlives the star");
    }

    #[test]
    fn a_store_that_will_not_parse_is_treated_as_absent() {
        let path = scratch("garbage");
        fs::write(&path, b"{ this is not json").unwrap();
        let store = Store::load(&path);
        assert!(store.folders.is_empty(), "started clean rather than refusing to start");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn removing_a_folder_leaves_the_others() {
        let mut store = Store::default();
        store.add_folder("/a".into());
        store.add_folder("/b".into());
        store.remove_folder("/a");
        assert_eq!(store.folders.len(), 1);
        assert_eq!(store.folders[0].path, "/b");
    }
}
