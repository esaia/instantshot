//! Turns positioned OCR fragments into plain text: reading order, line grouping, paragraph gaps
//! and indentation. Shared by every OCR backend. Never rewrites the recognized characters.

use super::TextBox;

/// Vertical gap (in median line heights) above which a blank line separates paragraphs.
const PARAGRAPH_GAP: f64 = 0.9;
/// Indentation smaller than this many characters is treated as alignment noise.
const MIN_INDENT_CHARS: usize = 2;
const MAX_INDENT_CHARS: usize = 64;

struct Row<'a> {
    top: f64,
    bottom: f64,
    left: f64,
    boxes: Vec<&'a TextBox>,
}

impl Row<'_> {
    fn center(&self) -> f64 {
        (self.top + self.bottom) / 2.0
    }
}

/// Composes text from fragments. Coordinates are in pixels with a top-left origin.
pub fn compose(boxes: &[TextBox], preserve_line_breaks: bool) -> String {
    let mut items: Vec<&TextBox> = boxes
        .iter()
        .filter(|b| !b.text.trim().is_empty() && b.height > 0.0)
        .collect();
    if items.is_empty() {
        return String::new();
    }
    items.sort_by(|a, b| a.y.total_cmp(&b.y).then(a.x.total_cmp(&b.x)));

    let rows = group_rows(items);
    let line_height = median(rows.iter().map(|r| r.bottom - r.top));
    let char_width = average_char_width(boxes);
    let left_edge = rows.iter().map(|r| r.left).fold(f64::INFINITY, f64::min);

    let mut paragraphs: Vec<Vec<String>> = vec![Vec::new()];
    let mut prev_bottom: Option<f64> = None;
    for row in &rows {
        if let Some(prev) = prev_bottom {
            if row.top - prev > PARAGRAPH_GAP * line_height {
                paragraphs.push(Vec::new());
            }
        }
        prev_bottom = Some(row.bottom);

        let text = row
            .boxes
            .iter()
            .map(|b| b.text.trim())
            .collect::<Vec<_>>()
            .join(" ");
        let indent = if char_width > 0.0 {
            ((row.left - left_edge) / char_width).round() as usize
        } else {
            0
        };
        let indent = if (MIN_INDENT_CHARS..=MAX_INDENT_CHARS).contains(&indent) {
            indent
        } else {
            0
        };
        paragraphs
            .last_mut()
            .expect("at least one paragraph")
            .push(format!("{}{}", " ".repeat(indent), text.trim_end()));
    }

    let line_sep = if preserve_line_breaks { "\n" } else { " " };
    let text = paragraphs
        .into_iter()
        .filter(|p| !p.is_empty())
        .map(|lines| {
            if preserve_line_breaks {
                lines.join(line_sep)
            } else {
                lines
                    .iter()
                    .map(|l| l.trim())
                    .collect::<Vec<_>>()
                    .join(line_sep)
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    text.trim_end().trim_start_matches(['\n', '\r']).to_string()
}

/// Groups fragments (sorted by top edge) into visual rows by vertical overlap.
fn group_rows(items: Vec<&TextBox>) -> Vec<Row<'_>> {
    let mut rows: Vec<Row> = Vec::new();
    for b in items {
        let center = b.y + b.height / 2.0;
        let joined = rows.iter_mut().rev().take(3).find(|r| {
            let overlap = (r.bottom.min(b.y + b.height) - r.top.max(b.y)).max(0.0);
            let min_h = (r.bottom - r.top).min(b.height);
            (center > r.top && center < r.bottom && (r.center() - center).abs() < min_h * 0.6)
                || overlap > 0.6 * min_h
        });
        match joined {
            Some(row) => {
                row.top = row.top.min(b.y);
                row.bottom = row.bottom.max(b.y + b.height);
                row.left = row.left.min(b.x);
                row.boxes.push(b);
            }
            None => rows.push(Row {
                top: b.y,
                bottom: b.y + b.height,
                left: b.x,
                boxes: vec![b],
            }),
        }
    }
    for row in &mut rows {
        row.boxes.sort_by(|a, b| a.x.total_cmp(&b.x));
    }
    rows.sort_by(|a, b| a.top.total_cmp(&b.top));
    rows
}

fn median(values: impl Iterator<Item = f64>) -> f64 {
    let mut v: Vec<f64> = values.filter(|x| x.is_finite() && *x > 0.0).collect();
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(f64::total_cmp);
    v[v.len() / 2]
}

fn average_char_width(boxes: &[TextBox]) -> f64 {
    let (width, chars) = boxes.iter().fold((0.0, 0usize), |(w, c), b| {
        let n = b.text.trim().chars().count();
        if n == 0 { (w, c) } else { (w + b.width, c + n) }
    });
    if chars == 0 {
        0.0
    } else {
        width / chars as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tb(text: &str, x: f64, y: f64, w: f64, h: f64) -> TextBox {
        TextBox {
            text: text.to_string(),
            x,
            y,
            width: w,
            height: h,
        }
    }

    #[test]
    fn empty_input() {
        assert_eq!(compose(&[], true), "");
        assert_eq!(compose(&[tb("  ", 0.0, 0.0, 10.0, 10.0)], true), "");
    }

    #[test]
    fn orders_lines_top_to_bottom() {
        let boxes = [
            tb("second line", 0.0, 24.0, 110.0, 20.0),
            tb("first line", 0.0, 0.0, 100.0, 20.0),
        ];
        assert_eq!(compose(&boxes, true), "first line\nsecond line");
    }

    #[test]
    fn merges_fragments_on_same_row_left_to_right() {
        let boxes = [
            tb("World", 120.0, 1.0, 50.0, 20.0),
            tb("Hello", 0.0, 0.0, 50.0, 20.0),
        ];
        assert_eq!(compose(&boxes, true), "Hello World");
    }

    #[test]
    fn blank_line_between_paragraphs_only() {
        let boxes = [
            tb("one", 0.0, 0.0, 30.0, 20.0),
            tb("two", 0.0, 25.0, 30.0, 20.0),
            tb("three", 0.0, 90.0, 50.0, 20.0),
        ];
        assert_eq!(compose(&boxes, true), "one\ntwo\n\nthree");
    }

    #[test]
    fn unwraps_lines_when_not_preserving_breaks() {
        let boxes = [
            tb("a wrapped", 0.0, 0.0, 90.0, 20.0),
            tb("sentence", 0.0, 25.0, 80.0, 20.0),
            tb("next para", 0.0, 90.0, 90.0, 20.0),
        ];
        assert_eq!(compose(&boxes, false), "a wrapped sentence\n\nnext para");
    }

    #[test]
    fn preserves_code_indentation() {
        // 10 px per character.
        let boxes = [
            tb("fn main() {", 0.0, 0.0, 110.0, 20.0),
            tb("println!();", 40.0, 24.0, 110.0, 20.0),
            tb("}", 0.0, 48.0, 10.0, 20.0),
        ];
        assert_eq!(compose(&boxes, true), "fn main() {\n    println!();\n}");
    }

    #[test]
    fn ignores_small_alignment_jitter() {
        let boxes = [
            tb("aligned", 0.0, 0.0, 70.0, 20.0),
            tb("text", 6.0, 24.0, 40.0, 20.0),
        ];
        assert_eq!(compose(&boxes, true), "aligned\ntext");
    }

    #[test]
    fn keeps_unicode_untouched() {
        let boxes = [
            tb("გამარჯობა", 0.0, 0.0, 90.0, 20.0),
            tb("日本語テキスト — café", 0.0, 24.0, 200.0, 20.0),
        ];
        assert_eq!(compose(&boxes, true), "გამარჯობა\n日本語テキスト — café");
    }
}
