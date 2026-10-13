use thiserror::Error;

#[derive(Debug, Error)]
#[cfg_attr(windows, allow(dead_code))]
pub enum CaptureError {
    #[error("Screen Recording permission is required")]
    PermissionDenied,
    #[error("The selected display is no longer available")]
    DisplayUnavailable,
    #[error("The selection is empty")]
    EmptySelection,
    #[error("Screen capture timed out")]
    Timeout,
    #[error("Screen capture failed: {0}")]
    Platform(String),
}

impl CaptureError {
    /// Message suitable for end users (no technical details).
    pub fn user_message(&self) -> String {
        match self {
            CaptureError::Platform(_) => "Couldn't capture the screen".to_string(),
            other => other.to_string(),
        }
    }
}

#[derive(Debug, Error)]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum OcrError {
    #[error("No OCR language is installed")]
    NoLanguage,
    #[error("The image is too large to recognize")]
    ImageTooLarge,
    #[error("Text recognition failed: {0}")]
    Platform(String),
}

impl OcrError {
    pub fn user_message(&self) -> String {
        match self {
            OcrError::NoLanguage => {
                "Install an OCR language in Windows Settings › Time & language".to_string()
            }
            OcrError::Platform(_) => "Text recognition failed".to_string(),
            other => other.to_string(),
        }
    }
}

/// Error returned from Tauri commands; serialized as a plain user-facing string.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
}

impl AppError {
    pub fn msg(message: impl Into<String>) -> Self {
        AppError::Message(message.into())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
