#!/usr/bin/env python3
"""Convert a markdown file to PDF using reportlab.

Usage:
  python3 scripts/md_to_pdf.py                          # defaults to docs/lab-guide.md
  python3 scripts/md_to_pdf.py docs/modes.md            # specify source
  python3 scripts/md_to_pdf.py docs/lab-guide.md docs/modes.md   # multiple files
"""

import re
import sys
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, Preformatted, KeepTogether,
    HRFlowable, Image,
)

# ── Styles ──────────────────────────────────────────────
styles = getSampleStyleSheet()

styles.add(ParagraphStyle(
    "DocTitle", parent=styles["Title"],
    fontSize=22, leading=28, spaceAfter=6,
    textColor=HexColor("#1A1D24"),
))
styles.add(ParagraphStyle(
    "Subtitle", parent=styles["Normal"],
    fontSize=11, leading=14, spaceAfter=18,
    textColor=HexColor("#5A6070"),
))
styles.add(ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontSize=16, leading=20, spaceBefore=22, spaceAfter=8,
    textColor=HexColor("#1A1D24"),
))
styles.add(ParagraphStyle(
    "H3", parent=styles["Heading3"],
    fontSize=13, leading=17, spaceBefore=16, spaceAfter=6,
    textColor=HexColor("#2B7DE9"),
))
styles.add(ParagraphStyle(
    "H4", parent=styles["Heading4"],
    fontSize=11, leading=15, spaceBefore=12, spaceAfter=4,
    textColor=HexColor("#333333"),
))
styles.add(ParagraphStyle(
    "Body", parent=styles["Normal"],
    fontSize=10, leading=14, spaceAfter=6,
    textColor=HexColor("#1A1D24"),
))
styles.add(ParagraphStyle(
    "CodeBlock", parent=styles["Code"],
    fontSize=8, leading=11, spaceAfter=8,
    fontName="Courier", backColor=HexColor("#F4F5F7"),
    borderColor=HexColor("#D8DCE3"), borderWidth=0.5,
    borderPadding=6, leftIndent=12,
    textColor=HexColor("#1A1D24"),
))
styles.add(ParagraphStyle(
    "BulletItem", parent=styles["Normal"],
    fontSize=10, leading=14, spaceAfter=3,
    leftIndent=20, bulletIndent=8,
    textColor=HexColor("#1A1D24"),
))
styles.add(ParagraphStyle(
    "NumberedStep", parent=styles["Normal"],
    fontSize=10, leading=14, spaceAfter=3,
    leftIndent=20, bulletIndent=8,
    textColor=HexColor("#1A1D24"),
))
styles.add(ParagraphStyle(
    "TableCell", parent=styles["Normal"],
    fontSize=9, leading=12,
    textColor=HexColor("#1A1D24"),
))
styles.add(ParagraphStyle(
    "TableHeader", parent=styles["Normal"],
    fontSize=9, leading=12, fontName="Helvetica-Bold",
    textColor=white,
))

# ── Markdown helpers ────────────────────────────────────

def _inline(text):
    """Convert inline markdown (bold, italic, code, links) to reportlab XML."""
    # Escape XML entities first
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    # Italic
    text = re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'<i>\1</i>', text)
    # Inline code
    text = re.sub(r'`([^`]+)`', r'<font face="Courier" size="9" color="#C7254E">\1</font>', text)
    # Links  [text](url) → just text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'<u>\1</u>', text)
    return text


def _parse_table(lines):
    """Parse markdown table lines into list of lists."""
    rows = []
    for line in lines:
        line = line.strip()
        if line.startswith("|") and line.endswith("|"):
            cells = [c.strip() for c in line.split("|")[1:-1]]
            # skip separator rows
            if all(re.match(r'^[-:]+$', c) for c in cells):
                continue
            rows.append(cells)
    return rows


def _build_table(rows):
    """Build a reportlab Table from parsed rows."""
    if not rows:
        return None
    header = rows[0]
    body = rows[1:]
    col_count = len(header)

    data = []
    data.append([Paragraph(_inline(c), styles["TableHeader"]) for c in header])
    for row in body:
        # pad short rows
        while len(row) < col_count:
            row.append("")
        data.append([Paragraph(_inline(c), styles["TableCell"]) for c in row[:col_count]])

    avail = 6.5 * inch
    col_widths = [avail / col_count] * col_count

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#2B7DE9")),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BACKGROUND", (0, 1), (-1, -1), HexColor("#F8F9FB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#FFFFFF"), HexColor("#F4F5F7")]),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#D8DCE3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


# ── Main conversion ─────────────────────────────────────

def convert(src_path):
    src_path = Path(src_path).resolve()
    src_dir = src_path.parent
    dst_path = src_path.with_suffix(".pdf")

    md = src_path.read_text()
    lines = md.split("\n")
    story = []

    i = 0
    in_code = False
    code_buf = []
    table_buf = []

    def flush_table():
        nonlocal table_buf
        if table_buf:
            rows = _parse_table(table_buf)
            t = _build_table(rows)
            if t:
                story.append(t)
                story.append(Spacer(1, 8))
            table_buf = []

    while i < len(lines):
        line = lines[i]

        # Code fence
        if line.strip().startswith("```"):
            if in_code:
                # End code block
                code_text = "\n".join(code_buf)
                # Use Preformatted for code blocks to preserve whitespace
                story.append(Preformatted(code_text, styles["CodeBlock"]))
                code_buf = []
                in_code = False
            else:
                flush_table()
                in_code = True
                code_buf = []
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # Table line
        if line.strip().startswith("|") and line.strip().endswith("|"):
            table_buf.append(line)
            i += 1
            continue
        else:
            flush_table()

        stripped = line.strip()

        # Empty line
        if not stripped:
            i += 1
            continue

        # Horizontal rule
        if stripped == "---":
            story.append(Spacer(1, 6))
            story.append(HRFlowable(
                width="100%", thickness=1,
                color=HexColor("#D8DCE3"), spaceAfter=6,
            ))
            i += 1
            continue

        # H1
        if stripped.startswith("# "):
            text = stripped[2:]
            story.append(Paragraph(_inline(text), styles["DocTitle"]))
            i += 1
            continue

        # H2
        if stripped.startswith("## "):
            text = stripped[3:]
            story.append(Paragraph(_inline(text), styles["H2"]))
            i += 1
            continue

        # H3
        if stripped.startswith("### "):
            text = stripped[4:]
            story.append(Paragraph(_inline(text), styles["H3"]))
            i += 1
            continue

        # H4
        if stripped.startswith("#### "):
            text = stripped[5:]
            story.append(Paragraph(_inline(text), styles["H4"]))
            i += 1
            continue

        # Numbered list
        m = re.match(r'^(\d+)\.\s+(.+)', stripped)
        if m:
            num, text = m.group(1), m.group(2)
            story.append(Paragraph(
                f"<b>{num}.</b> {_inline(text)}",
                styles["NumberedStep"],
            ))
            i += 1
            continue

        # Bullet
        if stripped.startswith("- "):
            text = stripped[2:]
            story.append(Paragraph(
                f"\u2022 {_inline(text)}",
                styles["BulletItem"],
            ))
            i += 1
            continue

        # Image: ![alt](path)
        img_match = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)', stripped)
        if img_match:
            alt, img_path = img_match.group(1), img_match.group(2)
            # Resolve relative to the source file's directory
            img_file = (src_dir / img_path).resolve()
            if img_file.exists():
                # Scale to fit within page width, max 3 inches tall
                max_w = 5.0 * inch
                max_h = 3.0 * inch
                img = Image(str(img_file), width=max_w, height=max_h)
                img._restrictSize(max_w, max_h)
                story.append(Spacer(1, 6))
                story.append(img)
                if alt:
                    story.append(Paragraph(
                        f"<i>{_inline(alt)}</i>",
                        styles["Body"],
                    ))
                story.append(Spacer(1, 6))
            else:
                story.append(Paragraph(
                    f"<i>[Image not found: {_inline(img_path)}]</i>",
                    styles["Body"],
                ))
            i += 1
            continue

        # Regular paragraph
        story.append(Paragraph(_inline(stripped), styles["Body"]))
        i += 1

    # Flush any remaining table
    flush_table()

    # Build PDF
    title = src_path.stem.replace("-", " ").replace("_", " ").title()
    doc = SimpleDocTemplate(
        str(dst_path),
        pagesize=letter,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        title=title,
        author="NGW Core",
    )
    doc.build(story)
    print(f"PDF written to {dst_path} ({dst_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    default = Path(__file__).resolve().parent.parent / "docs" / "lab-guide.md"
    sources = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else [default]
    for src in sources:
        convert(src)
