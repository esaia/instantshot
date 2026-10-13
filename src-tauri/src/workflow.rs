//! Capture workflow state machine. Pure logic, no Tauri types, so every transition is testable.
//!
//! ```text
//! Idle → SelectingRegion → Capturing → ProcessingOcr → Copying → Idle
//! ```
//! Every session carries an id; calls with a stale id are ignored, so a late event from an old
//! overlay can never affect a newer session.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Idle,
    SelectingRegion,
    Capturing,
    ProcessingOcr,
    Copying,
}

/// How a session ended. Drives the user-facing feedback message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    Completed { chars: usize },
    Cancelled,
    PermissionDenied,
    CaptureFailed(String),
    OcrFailed(String),
    NoTextFound,
    ClipboardFailed,
}

impl Outcome {
    /// Short, non-technical message for the HUD. `None` means show nothing.
    pub fn message(&self) -> Option<String> {
        match self {
            Outcome::Completed { chars } => Some(if *chars == 1 {
                "Copied 1 character".to_string()
            } else {
                format!("Copied {chars} characters")
            }),
            Outcome::Cancelled => None,
            Outcome::PermissionDenied => {
                Some("Screen Recording permission is required".to_string())
            }
            Outcome::CaptureFailed(msg) | Outcome::OcrFailed(msg) => Some(msg.clone()),
            Outcome::NoTextFound => Some("No text found".to_string()),
            Outcome::ClipboardFailed => Some("Couldn't access the clipboard".to_string()),
        }
    }

    pub fn is_success(&self) -> bool {
        matches!(self, Outcome::Completed { .. })
    }
}

/// What the caller should do in response to the capture shortcut.
#[derive(Debug, PartialEq, Eq)]
pub enum HotkeyAction {
    Start(u64),
    Cancel(u64),
    Ignore,
}

#[derive(Debug)]
pub struct Workflow {
    phase: Phase,
    session: u64,
}

impl Default for Workflow {
    fn default() -> Self {
        Self {
            phase: Phase::Idle,
            session: 0,
        }
    }
}

impl Workflow {
    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn session(&self) -> u64 {
        self.session
    }

    /// Shortcut pressed: start a session when idle, cancel when selecting (escape hatch), and
    /// ignore while a capture is already being processed.
    pub fn on_hotkey(&mut self) -> HotkeyAction {
        match self.phase {
            Phase::Idle => {
                self.session = self.session.wrapping_add(1);
                self.phase = Phase::SelectingRegion;
                HotkeyAction::Start(self.session)
            }
            Phase::SelectingRegion => HotkeyAction::Cancel(self.session),
            _ => HotkeyAction::Ignore,
        }
    }

    /// Selection finished. Succeeds only for the current session while selecting.
    pub fn begin_capture(&mut self, session: u64) -> bool {
        self.advance(session, Phase::SelectingRegion, Phase::Capturing)
    }

    pub fn begin_ocr(&mut self, session: u64) -> bool {
        self.advance(session, Phase::Capturing, Phase::ProcessingOcr)
    }

    pub fn begin_copy(&mut self, session: u64) -> bool {
        self.advance(session, Phase::ProcessingOcr, Phase::Copying)
    }

    /// Cancels a session that is still selecting. Returns `true` if it was cancelled.
    pub fn cancel(&mut self, session: u64) -> bool {
        if session == self.session && self.phase == Phase::SelectingRegion {
            self.reset();
            true
        } else {
            false
        }
    }

    /// Ends the given session from any phase. Returns `true` if it was the active session.
    pub fn finish(&mut self, session: u64) -> bool {
        if session == self.session && self.phase != Phase::Idle {
            self.reset();
            true
        } else {
            false
        }
    }

    fn advance(&mut self, session: u64, from: Phase, to: Phase) -> bool {
        if session == self.session && self.phase == from {
            self.phase = to;
            true
        } else {
            false
        }
    }

    fn reset(&mut self) {
        self.phase = Phase::Idle;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_path() {
        let mut w = Workflow::default();
        let HotkeyAction::Start(s) = w.on_hotkey() else {
            panic!("expected start")
        };
        assert!(w.begin_capture(s));
        assert!(w.begin_ocr(s));
        assert!(w.begin_copy(s));
        assert!(w.finish(s));
        assert_eq!(w.phase(), Phase::Idle);
    }

    #[test]
    fn second_press_while_selecting_cancels() {
        let mut w = Workflow::default();
        let HotkeyAction::Start(s) = w.on_hotkey() else {
            panic!()
        };
        assert_eq!(w.on_hotkey(), HotkeyAction::Cancel(s));
        assert!(w.cancel(s));
        assert_eq!(w.phase(), Phase::Idle);
    }

    #[test]
    fn presses_during_processing_are_ignored() {
        let mut w = Workflow::default();
        let HotkeyAction::Start(s) = w.on_hotkey() else {
            panic!()
        };
        w.begin_capture(s);
        assert_eq!(w.on_hotkey(), HotkeyAction::Ignore);
        w.begin_ocr(s);
        assert_eq!(w.on_hotkey(), HotkeyAction::Ignore);
    }

    #[test]
    fn stale_sessions_are_ignored() {
        let mut w = Workflow::default();
        let HotkeyAction::Start(old) = w.on_hotkey() else {
            panic!()
        };
        w.cancel(old);
        let HotkeyAction::Start(new) = w.on_hotkey() else {
            panic!()
        };
        assert_ne!(old, new);
        assert!(!w.begin_capture(old));
        assert!(!w.cancel(old));
        assert!(!w.finish(old));
        assert_eq!(w.phase(), Phase::SelectingRegion);
        assert!(w.begin_capture(new));
    }

    #[test]
    fn cannot_cancel_after_capture_started() {
        let mut w = Workflow::default();
        let HotkeyAction::Start(s) = w.on_hotkey() else {
            panic!()
        };
        w.begin_capture(s);
        assert!(!w.cancel(s));
        assert!(w.finish(s));
    }

    #[test]
    fn out_of_order_transitions_fail() {
        let mut w = Workflow::default();
        let HotkeyAction::Start(s) = w.on_hotkey() else {
            panic!()
        };
        assert!(!w.begin_ocr(s));
        assert!(!w.begin_copy(s));
        assert_eq!(w.phase(), Phase::SelectingRegion);
    }

    #[test]
    fn messages() {
        assert_eq!(
            Outcome::Completed { chars: 1 }.message().as_deref(),
            Some("Copied 1 character")
        );
        assert_eq!(Outcome::Cancelled.message(), None);
        assert_eq!(
            Outcome::NoTextFound.message().as_deref(),
            Some("No text found")
        );
    }
}
