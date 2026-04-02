"""
NGW Lab Knowledge Base PDF Generator
Generates a professional internal developer reference PDF using ReportLab Platypus.
"""

import os
import io
from datetime import datetime
from PIL import Image as PILImage
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether, Image as RLImage
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
from reportlab.platypus.flowables import Flowable
from reportlab.platypus import NextPageTemplate

# ─── Colour palette ──────────────────────────────────────────────────────────
NAVY        = colors.HexColor("#0f1724")
NAVY_LIGHT  = colors.HexColor("#1a2840")
ACCENT      = colors.HexColor("#3b82f6")   # bright blue
ACCENT2     = colors.HexColor("#60a5fa")   # lighter blue
WHITE       = colors.white
GREY_BG     = colors.HexColor("#f5f7fa")
GREY_RULE   = colors.HexColor("#d1d5db")
TEXT_DARK   = colors.HexColor("#1e293b")
TEXT_MID    = colors.HexColor("#475569")
TEXT_LIGHT  = colors.HexColor("#94a3b8")
GREEN_SOFT  = colors.HexColor("#d1fae5")
GREEN_DARK  = colors.HexColor("#065f46")

OUTPUT_PATH   = "/Users/toddwillis/Documents/ngw-core/docs/NGW_LAB_KB.pdf"
SCREENSHOTS   = "/Users/toddwillis/Documents/ngw-core/docs/screenshots"

# Screenshot display settings
SCREENSHOT_WIDTH_PT  = 200          # rendered width in PDF points
SCREENSHOT_BORDER_PT = 0.5         # border thickness
SCREENSHOT_BORDER_CL = colors.HexColor("#cccccc")
SCREENSHOT_CAP_COLOR = colors.HexColor("#888888")
# Crop: keep top 1300px of 1688px-tall @2x images (removes excess space at bottom)
SCREENSHOT_CROP_PX   = 1300


# ─── Custom flowable: full-width coloured band ───────────────────────────────
class SectionHeader(Flowable):
    """A full-width coloured band with white section title."""
    def __init__(self, number, title, width=7.5*inch):
        super().__init__()
        self.number = number
        self.title  = title
        self.width  = width
        self.height = 0.45*inch

    def draw(self):
        c = self.canv
        # Band
        c.setFillColor(NAVY)
        c.roundRect(0, 0, self.width, self.height, 4, fill=1, stroke=0)
        # Accent left strip
        c.setFillColor(ACCENT)
        c.rect(0, 0, 0.18*inch, self.height, fill=1, stroke=0)
        # Section number chip
        c.setFillColor(ACCENT)
        c.roundRect(0.28*inch, 0.07*inch, 0.30*inch, 0.30*inch, 3, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(0.43*inch, 0.13*inch, str(self.number))
        # Title text
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(0.70*inch, 0.13*inch, self.title)

    def wrap(self, availW, availH):
        self.width = availW
        return self.width, self.height


class SubSectionHeader(Flowable):
    """A lighter sub-section marker with accent left border."""
    def __init__(self, title, width=7.5*inch):
        super().__init__()
        self.title = title
        self.width = width
        self.height = 0.34*inch

    def draw(self):
        c = self.canv
        c.setFillColor(GREY_BG)
        c.roundRect(0, 0, self.width, self.height, 3, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.rect(0, 0, 0.10*inch, self.height, fill=1, stroke=0)
        c.setFillColor(TEXT_DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(0.22*inch, 0.10*inch, self.title)

    def wrap(self, availW, availH):
        self.width = availW
        return self.width, self.height


# ─── TOC-aware document ──────────────────────────────────────────────────────
class NGWDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        self.allowSplitting = 1
        body_frame = Frame(
            self.leftMargin, self.bottomMargin,
            self.width, self.height,
            id="body"
        )
        self.addPageTemplates([
            PageTemplate(id="cover",  frames=[body_frame], onPage=self._cover_page),
            PageTemplate(id="normal", frames=[body_frame], onPage=self._normal_page),
        ])

    @staticmethod
    def _cover_page(canvas, doc):
        pass  # cover page decorates itself via flowables

    @staticmethod
    def _normal_page(canvas, doc):
        canvas.saveState()
        w, h = letter
        # Top rule
        canvas.setStrokeColor(GREY_RULE)
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, h - 0.55*inch, w - doc.rightMargin, h - 0.55*inch)
        # Header text
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(TEXT_LIGHT)
        canvas.drawString(doc.leftMargin, h - 0.42*inch, "NGW Lab \u2014 Knowledge Base")
        canvas.drawRightString(w - doc.rightMargin, h - 0.42*inch, "Internal Developer Reference")
        # Bottom rule
        canvas.line(doc.leftMargin, 0.55*inch, w - doc.rightMargin, 0.55*inch)
        # Footer
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(TEXT_LIGHT)
        canvas.drawString(doc.leftMargin, 0.35*inch, "NGW Internal \u2014 Confidential")
        canvas.drawCentredString(w/2, 0.35*inch, f"Page {doc.page}")
        canvas.drawRightString(w - doc.rightMargin, 0.35*inch, "March 2026")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        """Register TOC entries from tagged paragraphs."""
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            if style == "TOCHeading1":
                self.notify("TOCEntry", (0, flowable.getPlainText(), self.page))
            elif style == "TOCHeading2":
                self.notify("TOCEntry", (1, flowable.getPlainText(), self.page))


# ─── Styles ──────────────────────────────────────────────────────────────────
def build_styles():
    base = getSampleStyleSheet()

    styles = {}

    styles["body"] = ParagraphStyle(
        "body",
        fontName="Helvetica",
        fontSize=9.5,
        leading=15,
        textColor=TEXT_DARK,
        spaceAfter=6,
    )
    styles["body_justify"] = ParagraphStyle(
        "body_justify",
        parent=styles["body"],
        alignment=TA_JUSTIFY,
    )
    styles["small"] = ParagraphStyle(
        "small",
        fontName="Helvetica",
        fontSize=8,
        leading=12,
        textColor=TEXT_MID,
        spaceAfter=4,
    )
    styles["code"] = ParagraphStyle(
        "code",
        fontName="Courier",
        fontSize=8.5,
        leading=13,
        textColor=colors.HexColor("#0d47a1"),
        backColor=colors.HexColor("#eff6ff"),
        borderPadding=(4, 6, 4, 6),
        spaceAfter=6,
    )
    styles["bullet"] = ParagraphStyle(
        "bullet",
        parent=styles["body"],
        leftIndent=18,
        bulletIndent=6,
        spaceAfter=3,
    )
    styles["num_list"] = ParagraphStyle(
        "num_list",
        parent=styles["body"],
        leftIndent=24,
        bulletIndent=6,
        spaceAfter=3,
    )
    styles["faq_q"] = ParagraphStyle(
        "faq_q",
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=14,
        textColor=ACCENT,
        spaceBefore=10,
        spaceAfter=2,
    )
    styles["faq_a"] = ParagraphStyle(
        "faq_a",
        parent=styles["body"],
        leftIndent=14,
        spaceAfter=6,
    )
    styles["toc_h1"] = ParagraphStyle(
        "TOCHeading1",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=16,
        textColor=TEXT_DARK,
    )
    styles["toc_h2"] = ParagraphStyle(
        "TOCHeading2",
        fontName="Helvetica",
        fontSize=9,
        leading=14,
        textColor=TEXT_MID,
        leftIndent=16,
    )
    styles["toc_entry1"] = ParagraphStyle(
        "toc_entry1",
        fontName="Helvetica",
        fontSize=9.5,
        leading=16,
        textColor=TEXT_DARK,
    )
    styles["toc_entry2"] = ParagraphStyle(
        "toc_entry2",
        fontName="Helvetica",
        fontSize=9,
        leading=14,
        textColor=TEXT_MID,
        leftIndent=16,
    )
    styles["note_box"] = ParagraphStyle(
        "note_box",
        fontName="Helvetica-Oblique",
        fontSize=8.5,
        leading=13,
        textColor=colors.HexColor("#1e40af"),
        backColor=colors.HexColor("#dbeafe"),
        borderPadding=(5, 8, 5, 8),
        spaceAfter=8,
    )
    return styles


# ─── Cover page builder ──────────────────────────────────────────────────────
def build_cover(styles):
    story = []
    story.append(Spacer(1, 1.4*inch))

    # Dark background card via Table trick
    cover_data = [[
        Paragraph(
            '<font color="#60a5fa" size="9"><b>NO GUESSWORK LIGHTING</b></font><br/>'
            '<font color="#ffffff" size="28"><b>NGW Lab</b></font><br/>'
            '<font color="#60a5fa" size="13">Knowledge Base</font><br/><br/>'
            '<font color="#94a3b8" size="10">Internal Developer Reference &amp; FAQ</font>',
            ParagraphStyle("cover_inner", alignment=TA_CENTER, leading=36)
        )
    ]]
    cover_table = Table(cover_data, colWidths=[7.5*inch])
    cover_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), NAVY),
        ("ROUNDEDCORNERS", [10]),
        ("TOPPADDING",   (0,0), (-1,-1), 36),
        ("BOTTOMPADDING",(0,0), (-1,-1), 36),
        ("LEFTPADDING",  (0,0), (-1,-1), 32),
        ("RIGHTPADDING", (0,0), (-1,-1), 32),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
    ]))
    story.append(cover_table)
    story.append(Spacer(1, 0.4*inch))

    # Tagline
    story.append(Paragraph(
        '<font color="#475569" size="10"><i>"No Guesswork Lighting"</i></font>',
        ParagraphStyle("tagline", alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 1.0*inch))
    story.append(HRFlowable(width="60%", thickness=1, color=GREY_RULE, hAlign="CENTER"))
    story.append(Spacer(1, 0.25*inch))

    # Meta table
    meta = [
        ["Document Type", "Internal Knowledge Base"],
        ["Audience",      "NGW Core Engineering Team"],
        ["Date",          "March 2026"],
        ["Classification","Confidential \u2014 Internal Only"],
    ]
    meta_table = Table(meta, colWidths=[2.0*inch, 5.0*inch])
    meta_table.setStyle(TableStyle([
        ("FONTNAME",     (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME",     (1,0), (1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("TEXTCOLOR",    (0,0), (0,-1), TEXT_MID),
        ("TEXTCOLOR",    (1,0), (1,-1), TEXT_DARK),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[WHITE, GREY_BG]),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("GRID",         (0,0), (-1,-1), 0.3, GREY_RULE),
    ]))
    story.append(meta_table)
    story.append(PageBreak())
    return story


# ─── TOC builder ─────────────────────────────────────────────────────────────
def build_toc():
    story = []
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "toc_lvl1",
            fontName="Helvetica",
            fontSize=10,
            leading=18,
            textColor=TEXT_DARK,
            leftIndent=0,
        ),
        ParagraphStyle(
            "toc_lvl2",
            fontName="Helvetica",
            fontSize=9,
            leading=15,
            textColor=TEXT_MID,
            leftIndent=20,
        ),
    ]
    story.append(Paragraph(
        '<font color="#0f1724" size="16"><b>Table of Contents</b></font>',
        ParagraphStyle("toc_title", alignment=TA_LEFT, spaceAfter=4)
    ))
    story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
    story.append(Spacer(1, 0.15*inch))
    story.append(toc)
    story.append(PageBreak())
    return story, toc


# ─── Content helpers ─────────────────────────────────────────────────────────
def section_header(number, title, styles):
    """Returns list of flowables for a section header (TOC-registered)."""
    return [
        SectionHeader(number, title),
        Paragraph(f"Section {number}: {title}", styles["toc_h1"]),  # TOC anchor
        Spacer(1, 0.12*inch),
    ]


def sub_header(title, styles):
    return [
        SubSectionHeader(title),
        Spacer(1, 0.08*inch),
    ]


def body(text, styles, style_key="body"):
    return Paragraph(text, styles[style_key])


def bullets(items, styles):
    out = []
    for item in items:
        out.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles["bullet"]))
    return out


def numbered(items, styles):
    out = []
    for i, item in enumerate(items, 1):
        out.append(Paragraph(f'<bullet>{i}.</bullet> {item}', styles["num_list"]))
    return out


def note(text, styles):
    return Paragraph(f'<b>Note:</b> {text}', styles["note_box"])


def code_line(text, styles):
    return Paragraph(f'<font name="Courier">{text}</font>', styles["code"])


def faq_entry(q, a, styles):
    return [
        Paragraph(f'Q: {q}', styles["faq_q"]),
        Paragraph(f'A: {a}', styles["faq_a"]),
    ]


def spacer(h=0.15):
    return Spacer(1, h*inch)


def screenshot_block(filename, caption, styles):
    """Return a KeepTogether flowable containing a cropped, bordered screenshot and caption.

    - Crops the source PNG to SCREENSHOT_CROP_PX rows (removes empty lower space)
    - Renders centred at SCREENSHOT_WIDTH_PT wide with a thin border
    - Places an italic grey caption below, centred, 8pt
    - Adds 10pt vertical space above and below the whole block
    """
    src_path = os.path.join(SCREENSHOTS, filename)

    # ── Crop with PIL ────────────────────────────────────────────────────────
    pil_img = PILImage.open(src_path)
    w_px, h_px = pil_img.size
    crop_h = min(SCREENSHOT_CROP_PX, h_px)
    cropped = pil_img.crop((0, 0, w_px, crop_h))

    # Save cropped image to an in-memory buffer so we don't touch disk
    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    buf.seek(0)

    # ── Compute display dimensions ───────────────────────────────────────────
    aspect = crop_h / w_px          # height/width ratio of cropped image
    display_w = SCREENSHOT_WIDTH_PT
    display_h = display_w * aspect

    # ── ReportLab Image flowable (centred via Table) ─────────────────────────
    rl_img = RLImage(buf, width=display_w, height=display_h)

    # Wrap in a 1-cell Table to apply border and centring
    img_table = Table([[rl_img]], colWidths=[display_w])
    img_table.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("BOX",           (0, 0), (-1, -1), SCREENSHOT_BORDER_PT, SCREENSHOT_BORDER_CL),
    ]))

    caption_style = ParagraphStyle(
        "screenshot_caption",
        fontName="Helvetica-Oblique",
        fontSize=8,
        leading=11,
        textColor=SCREENSHOT_CAP_COLOR,
        alignment=TA_CENTER,
        spaceAfter=0,
    )
    cap_para = Paragraph(caption, caption_style)

    # Outer centering table: single column, full content width; image + caption stacked
    outer_table = Table(
        [[img_table], [cap_para]],
        colWidths=[display_w],
        hAlign="CENTER",
    )
    outer_table.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (0, 0), 4),   # gap between image and caption
        ("BOTTOMPADDING", (0, 1), (0, 1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))

    block = [
        Spacer(1, 10),
        outer_table,
        Spacer(1, 10),
    ]
    return KeepTogether(block)


# ─── Section builders ─────────────────────────────────────────────────────────

def build_section_overview(styles):
    s = []
    s += section_header(1, "Overview & Access", styles)
    s.append(body(
        "NGW Lab is the internal development environment for testing and improving the "
        "<b>No Guesswork Lighting</b> analysis engine. It is accessible only to admin-whitelisted "
        "accounts and provides four tabs: <b>Workbench</b>, <b>Gold Set</b>, <b>Candidates</b>, "
        "and <b>Reference Dataset</b>.",
        styles, "body_justify"
    ))
    s.append(spacer(0.12))
    s += sub_header("Purpose", styles)
    s += bullets([
        "Test any portrait photo through the full CV + VLM analysis pipeline",
        "Maintain a benchmark truth dataset (Gold Set) for accuracy measurement",
        "Track proposed engine rule changes (Candidates)",
        "Review and curate reference images (Reference Dataset)",
    ], styles)
    s.append(spacer(0.12))
    s += sub_header("How to Get There", styles)
    s += numbered([
        "Sign in with an admin-whitelisted email address",
        "The app loads on the Home screen",
        "Look for the Lab flask icon (\u2697) in the header \u2014 tap it to enter Lab",
    ], styles)
    # Screenshot after the "How to get there" steps
    s.append(screenshot_block(
        "00_home.png",
        "Step 3: The Lab flask icon (\u2697) appears in the header after sign-in \u2014 tap to enter",
        styles,
    ))
    s.append(spacer(0.12))
    s += sub_header("Access Requirements", styles)
    s += bullets([
        "Must be signed in with an admin-whitelisted email address",
        "Admin emails are defined in <font name=\"Courier\" size=\"8.5\">auth/dev_guard.py</font>",
        "Admin accounts automatically receive enterprise-level plan access",
    ], styles)
    s.append(spacer(0.12))
    s += sub_header("Dev Tools — Plan Tier Override", styles)
    s.append(body(
        "Admin accounts always operate at Enterprise tier. In Settings \u2192 Dev Tools you can "
        "inspect your active plan tier. The selector is visible to all users but admin accounts "
        "always show <b>Enterprise</b> regardless of the chosen value.",
        styles
    ))
    # Screenshot after the Dev Tools subsection
    s.append(screenshot_block(
        "07c_settings_devtools.png",
        "Settings \u2192 Dev Tools: admin accounts always show Enterprise tier",
        styles,
    ))
    s.append(spacer(0.2))
    return s


def build_section_workbench(styles):
    s = []
    s += section_header(2, "Workbench Tab", styles)
    s.append(body(
        "The Workbench is the primary analysis sandbox. Upload any portrait and run it through "
        "the complete NGW pipeline — computer vision passes followed by optional VLM signal "
        "extraction and physical reconstruction.",
        styles, "body_justify"
    ))
    # Screenshot after intro paragraph
    s.append(screenshot_block(
        "01_workbench.png",
        "Workbench empty state \u2014 tap Select Image to begin",
        styles,
    ))
    s.append(spacer(0.12))

    # Step-by-Step subsection
    s += sub_header("Step-by-Step", styles)
    s += numbered([
        "Tap the flask icon (\u2697) in the header \u2014 lands on Workbench",
        'Tap <b>"Select Image"</b> \u2014 pick a JPEG, PNG, WebP, HEIC, or TIFF (max 10\u00a0MB)',
        'Optional \u2014 tick <b>"Debug Overlay"</b> before analyzing to get an annotated image',
        'Tap <b>"Analyze"</b> \u2014 a scan animation plays while the pipeline runs (5\u201320 seconds)',
        'Results appear \u2014 switch between <b>Formatted</b> / <b>VLM vs CV</b> / <b>Raw JSON</b> / <b>Debug Overlay</b> sub-tabs',
        'Accept VLM overrides in the <b>VLM vs CV</b> tab if those signals are better than CV',
        'Tap <b>"\u2714 Commit to Gold Set"</b> or <b>"Save to Gold Set"</b> \u2014 or <b>"Propose Rule"</b> for engine changes',
    ], styles)
    s.append(spacer(0.08))
    # Screenshot again as reference for the step-by-step
    s.append(screenshot_block(
        "01_workbench.png",
        "Workbench reference \u2014 the Select Image button starts the full pipeline",
        styles,
    ))
    s.append(spacer(0.12))

    s += sub_header("Result Sub-Views", styles)
    sub_views = [
        ("Formatted View",
         "Human-readable cards showing Description, Narrative, Lighting (family, quality, direction, "
         "shadow, fill/rim, light count), and Recreation Setup (modifier, key placement, fill and "
         "background strategy)."),
        ("VLM vs CV View",
         "Side-by-side comparison of VLM-extracted signals versus computer vision signals. Each row "
         "has an \"Accept VLM\" button to override the CV value with the VLM reading. Only available "
         "when a VLM API key is configured and returned data."),
        ("Raw JSON View",
         "The full API response as pretty-printed JSON \u2014 every signal, candidate, reliability score, "
         "and debug field."),
        ("Debug Overlay View",
         "The annotated image with drawn overlays for shadows, highlights, catchlights, surface classes, "
         "light roles, and reconstruction geometry. Only available when \"Debug Overlay\" was checked "
         "before analysis."),
    ]
    for title, desc in sub_views:
        s.append(body(f'<b>{title}:</b> {desc}', styles))
    s.append(spacer(0.12))

    s += sub_header("Post-Analysis Actions", styles)
    s += bullets([
        '<b>Save to Gold Set</b> \u2014 pre-fills a Gold Set entry with this image and analysis. If VLM overrides were accepted, the button turns green: "\u2714 Commit to Gold Set"',
        '<b>Propose Rule</b> \u2014 pre-fills a Candidates entry with the lighting family and setup from this analysis',
        '<b>New Image</b> \u2014 clears everything and returns to the upload screen',
    ], styles)
    s.append(spacer(0.1))
    s.append(note(
        "If the VLM vs CV tab is greyed out, either no VLM API key is set in .env, or the VLM "
        "returned no data. Check server logs for 429 rate-limit or timeout errors.",
        styles
    ))
    s.append(spacer(0.2))
    return s


def build_section_gold_set(styles):
    s = []
    s += section_header(3, "Gold Set Tab", styles)
    s.append(body(
        "The Gold Set is the benchmark truth dataset. Each entry pairs a known image with the expected "
        "analysis output. It drives automated evaluation via "
        "<font name=\"Courier\" size=\"8.5\">run_benchmarks.py</font> and is the ground truth for "
        "measuring engine accuracy.",
        styles, "body_justify"
    ))
    # Screenshot after intro
    s.append(screenshot_block(
        "02_gold_set.png",
        "Gold Set tab \u2014 status filters and action buttons",
        styles,
    ))
    s.append(spacer(0.12))

    s += sub_header("Status Values", styles)
    status_data = [
        ["Status", "Meaning"],
        ["Draft",    "Being created or verified \u2014 not yet eligible for benchmarks"],
        ["Approved", "Confirmed correct \u2014 eligible for benchmark inclusion"],
        ["Archived", "Retired but retained for reference \u2014 excluded from benchmarks"],
    ]
    status_table = Table(status_data, colWidths=[1.3*inch, 6.0*inch])
    status_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), NAVY),
        ("TEXTCOLOR",    (0,0), (-1,0), WHITE),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, GREY_BG]),
        ("GRID",         (0,0), (-1,-1), 0.3, GREY_RULE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
    ]))
    s.append(status_table)
    s.append(spacer(0.12))

    s += sub_header("Adding an Entry Manually", styles)
    s += numbered([
        'Tap <b>"+ New"</b>',
        "Enter the image path (relative to server working directory)",
        "Paste or type the expected analysis JSON",
        "Set status to <b>Draft</b> while working, <b>Approved</b> when confirmed",
        "Tap <b>Create Entry</b>",
    ], styles)
    # Screenshot after "Adding an entry" subsection
    s.append(screenshot_block(
        "03_gold_set_new.png",
        "New Gold Set Entry form \u2014 Image Path, Notes, and Expected Analysis JSON",
        styles,
    ))
    s.append(spacer(0.1))

    s += sub_header("Adding from Workbench (Faster)", styles)
    s.append(body(
        'Analyse an image in Workbench, then tap <b>"Save to Gold Set"</b>. The form auto-fills '
        "with the image path and analysis result.",
        styles
    ))
    s.append(spacer(0.1))

    s += sub_header("Running Evaluation", styles)
    s.append(body("Gold Set evaluation runs from the server CLI \u2014 not from the UI.", styles))
    s.append(code_line("python3 scripts/run_benchmarks.py", styles))
    s.append(body(
        "Results print to terminal showing <b>PASS</b>, <b>SOFT_PASS</b>, and <b>FAIL</b> counts per entry.",
        styles
    ))
    s.append(spacer(0.1))

    s += sub_header("Editing and Archiving", styles)
    s += bullets([
        "Tap any entry to edit expected analysis, add notes, or change status",
        "Archive approved entries rather than deleting them \u2014 deletion is permanent",
    ], styles)
    s.append(spacer(0.2))
    return s


def build_section_candidates(styles):
    s = []
    s += section_header(4, "Candidates Tab", styles)
    s.append(body(
        "The Candidates tab tracks proposed engine rule changes. When the Workbench reveals a pattern "
        "gap, contradiction, or new signal worth adding, create a Candidate to document and track it.",
        styles, "body_justify"
    ))
    # Screenshot after intro
    s.append(screenshot_block(
        "04_candidates.png",
        "Candidates tab \u2014 status workflow filters",
        styles,
    ))
    s.append(spacer(0.12))

    s += sub_header("Fields", styles)
    fields = [
        ("Title",          "Short description of the proposed change"),
        ("Description",    "What the current engine gets wrong or misses"),
        ("Rationale",      "Why this change improves accuracy, with evidence from benchmark data or Workbench results"),
        ("Proposed Change","JSON describing the rule delta (pattern weights, new conditions, scoring adjustments)"),
    ]
    field_data = [["Field", "Description"]] + [[f, d] for f, d in fields]
    field_table = Table(field_data, colWidths=[1.5*inch, 5.8*inch])
    field_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), NAVY),
        ("TEXTCOLOR",    (0,0), (-1,0), WHITE),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME",     (0,1), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, GREY_BG]),
        ("GRID",         (0,0), (-1,-1), 0.3, GREY_RULE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
    ]))
    s.append(field_table)
    s.append(spacer(0.12))

    s += sub_header("Status Flow", styles)
    flow_data = [["draft", "\u2192", "review", "\u2192", "accepted", "or", "rejected"]]
    flow_table = Table(flow_data, colWidths=[0.9*inch, 0.25*inch, 0.9*inch, 0.25*inch, 1.1*inch, 0.4*inch, 1.0*inch])
    flow_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (0,0), colors.HexColor("#fef9c3")),
        ("BACKGROUND",   (2,0), (2,0), colors.HexColor("#dbeafe")),
        ("BACKGROUND",   (4,0), (4,0), colors.HexColor("#d1fae5")),
        ("BACKGROUND",   (6,0), (6,0), colors.HexColor("#fee2e2")),
        ("FONTNAME",     (0,0), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("GRID",         (0,0), (-1,-1), 0, WHITE),
    ]))
    s.append(flow_table)
    s.append(spacer(0.12))

    s += sub_header("Adding a Candidate", styles)
    s += numbered([
        'Tap <b>"+ New"</b> in the Candidates tab',
        "Enter a Title, Description, and Rationale for the proposed change",
        "Paste the Proposed Change JSON describing the rule delta",
        "Set Source Gold Set ID if the candidate was triggered by a specific benchmark entry",
        'Tap <b>"Create Candidate"</b>',
    ], styles)
    # Screenshot after "Adding a candidate" subsection
    s.append(screenshot_block(
        "05_candidates_new.png",
        "New Rule Candidate form \u2014 Title, Description, Rationale, and Proposed Change JSON",
        styles,
    ))
    s.append(spacer(0.1))

    s += sub_header("Adding from Workbench (Faster)", styles)
    s.append(body(
        'Tap <b>"Propose Rule"</b> after analysis. The form auto-fills with the lighting family and '
        "a reference to the source image.",
        styles
    ))
    s.append(spacer(0.2))
    return s


def build_section_reference_dataset(styles):
    s = []
    s += section_header(5, "Reference Dataset Tab", styles)
    s.append(body(
        "A curated library of reference photos with full pipeline analysis attached. Each entry stores "
        "the original image, VLM description, CV signals, and complete reference_analysis JSON. Used "
        "to build the pattern match library and validate the engine.",
        styles, "body_justify"
    ))
    # Screenshot after intro
    s.append(screenshot_block(
        "06_ref_dataset.png",
        "Reference Dataset \u2014 status and tier filters, + Import for new entries",
        styles,
    ))
    s.append(spacer(0.12))

    s += sub_header("Browsing", styles)
    s += bullets([
        "Entries appear as a grid of authenticated thumbnails with filename and status badge",
        "Images load via authenticated fetch (Bearer token handled automatically)",
        'Tap <b>"Load More"</b> to paginate',
    ], styles)
    s.append(spacer(0.1))

    s += sub_header("Viewing an Entry", styles)
    s += numbered([
        "Tap any thumbnail to open the detail view",
        "The full-size image renders at the top",
        "Use the \u2190 Prev / Next \u2192 arrows to navigate between entries without returning to the grid",
        'The counter shows current position (e.g. "3 / 47")',
    ], styles)
    s.append(spacer(0.1))

    s += sub_header("Collapsible Detail Sections", styles)
    s += bullets([
        "<b>Reference Analysis</b> \u2014 Core analysis JSON: lighting read, recreation setup, image read. Open by default.",
        "<b>Pipeline Signals</b> \u2014 Raw CV pipeline pass outputs: shadow, highlight, catchlight, geometry, etc.",
        "<b>VLM Reconstruction</b> \u2014 VLM-based physical reconstruction with primary candidate, alternatives, confidence, and ambiguity notes.",
    ], styles)
    s.append(spacer(0.1))

    s += sub_header("Actions", styles)
    actions_data = [
        ["Action", "Effect"],
        ["Approve",   "Marks entry as a valid reference image. Eligible for benchmark inclusion."],
        ["Reject",    "Marks entry as unsuitable (bad framing, ambiguous lighting, duplicate). Stays in dataset but filtered from benchmarks."],
        ["Reprocess", "Re-runs the full CV + VLM pipeline on the existing entry. Use after engine updates for fresh signals. Does not change status."],
    ]
    actions_table = Table(actions_data, colWidths=[1.1*inch, 6.2*inch])
    actions_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), NAVY),
        ("TEXTCOLOR",    (0,0), (-1,0), WHITE),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME",     (0,1), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, GREY_BG]),
        ("GRID",         (0,0), (-1,-1), 0.3, GREY_RULE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
    ]))
    s.append(actions_table)
    s.append(spacer(0.12))

    s += sub_header("Ingesting New Images", styles)
    s.append(body("New reference images are added via API:", styles))
    s.append(code_line("POST /api/lab/reference/ingest", styles))
    s.append(body(
        'Once ingested, entries appear as <b>"pending"</b> and can be reviewed. The UI does not '
        "have a direct upload button for the Reference Dataset \u2014 use the Workbench for one-off "
        "analysis, and the ingest API for curated dataset additions.",
        styles
    ))
    s.append(spacer(0.2))
    return s


def build_section_workflows(styles):
    s = []
    s += section_header(6, "Common Workflows", styles)
    # Screenshot at the start of section 6
    s.append(screenshot_block(
        "01_workbench.png",
        "Start every workflow from the Workbench \u2014 upload, analyze, then act",
        styles,
    ))
    s.append(spacer(0.08))

    workflows = [
        (
            "Workflow 1 \u2014 Testing a New Image End-to-End",
            [
                "Workbench \u2192 Select Image \u2192 Analyze",
                "Review Formatted view: lighting family, modifier, light count",
                "Switch to VLM vs CV: confirm signals agree or accept VLM overrides",
                "Switch to Raw JSON: check <font name=\"Courier\" size=\"8.5\">bestMatch.reliabilityScore</font> and <font name=\"Courier\" size=\"8.5\">pattern_candidates</font>",
                "If result is useful: Save to Gold Set",
                "If the engine got something wrong: Propose Rule",
            ]
        ),
        (
            "Workflow 2 \u2014 Adding a Benchmark Image",
            [
                "Upload to Workbench, verify the analysis is correct",
                "Save to Gold Set (status: Draft)",
                "Edit the Gold Set entry to confirm expected_analysis matches ground truth",
                "Set status to Approved",
                "Run: <font name=\"Courier\" size=\"8.5\">python3 scripts/run_benchmarks.py</font> to verify the entry passes",
            ]
        ),
        (
            "Workflow 3 \u2014 Investigating a SOFT_PASS Benchmark",
            [
                "Find the image path from benchmark output",
                "Load it in Workbench with Debug Overlay enabled",
                "Inspect the overlay: look for weak catchlights, occlusion shadows, ambiguous geometry",
                "Check VLM vs CV tab for signal conflicts",
                "If a rule fix is clear: Propose Rule with the relevant signal data attached",
            ]
        ),
        (
            "Workflow 4 \u2014 Reviewing Reference Dataset Images",
            [
                "Open Reference Dataset tab",
                "Step through entries with \u2190 / \u2192 navigation",
                "Check Reference Analysis section: is the lighting family and setup correct?",
                "If correct: Approve. If wrong framing, bad lighting, or ambiguous: Reject",
                "If signals look stale after an engine update: Reprocess",
            ]
        ),
    ]

    for i, (title, steps) in enumerate(workflows):
        s += sub_header(title, styles)
        s += numbered(steps, styles)
        if i < len(workflows) - 1:
            s.append(spacer(0.12))

    s.append(spacer(0.2))
    return s


def build_section_environment(styles):
    s = []
    s += section_header(7, "Environment & Configuration", styles)
    s += sub_header("Environment Variables", styles)

    env_vars = [
        ("VLM_PROVIDER",
         "Override auto-detection. Values: <font name=\"Courier\" size=\"8.5\">openai</font> / "
         "<font name=\"Courier\" size=\"8.5\">anthropic</font> / "
         "<font name=\"Courier\" size=\"8.5\">none</font>. When unset or \"auto\", uses OpenAI if "
         "OPENAI_API_KEY is present, otherwise Anthropic, otherwise disables VLM."),
        ("OPENAI_API_KEY",
         "Required when VLM_PROVIDER is \"openai\". Used for GPT-4.1 vision calls."),
        ("ANTHROPIC_API_KEY",
         "Required when VLM_PROVIDER is \"anthropic\". Used for Claude Sonnet vision calls."),
        ("VLM_MODEL",
         "Override the default model. Defaults: <font name=\"Courier\" size=\"8.5\">gpt-4.1</font> (OpenAI), "
         "<font name=\"Courier\" size=\"8.5\">claude-sonnet-4-20250514</font> (Anthropic)."),
    ]

    for var, desc in env_vars:
        s.append(Paragraph(
            f'<font name="Courier" size="9" color="#0d47a1"><b>{var}</b></font>',
            ParagraphStyle("env_var", spaceAfter=2, spaceBefore=8)
        ))
        s.append(body(desc, styles))

    s.append(spacer(0.1))
    s.append(note(
        "VLM is optional. Without it, Workbench runs the full CV pipeline and returns results. "
        "The VLM vs CV tab is disabled and shows \"VLM not configured\" on hover.",
        styles
    ))
    # Screenshot after the env vars table
    s.append(screenshot_block(
        "07c_settings_devtools.png",
        "Dev Tools in Settings confirms your active plan tier and admin status",
        styles,
    ))
    s.append(spacer(0.12))

    s += sub_header("Rate Limit Handling (429 Errors)", styles)
    s.append(body("The VLM layer automatically retries on rate-limit responses:", styles))

    retry_data = [
        ["Attempt", "Failure Action",       "Wait Before Retry"],
        ["1",       "First call fails",     "2 seconds"],
        ["2",       "Retry fails",          "5 seconds"],
        ["3",       "Retry fails",          "15 seconds"],
        ["4",       "Logs error; pipeline continues without VLM data", "\u2014"],
    ]
    retry_table = Table(retry_data, colWidths=[0.9*inch, 3.8*inch, 2.6*inch])
    retry_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), NAVY),
        ("TEXTCOLOR",    (0,0), (-1,0), WHITE),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, GREY_BG]),
        ("GRID",         (0,0), (-1,-1), 0.3, GREY_RULE),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("ALIGN",        (0,0), (0,-1), "CENTER"),
    ]))
    s.append(retry_table)
    s.append(spacer(0.1))
    s.append(body(
        'To request a rate limit increase: '
        '<font color="#3b82f6">https://platform.openai.com/settings/organization/limits</font>',
        styles
    ))
    s.append(spacer(0.12))

    s += sub_header("Upload Limits", styles)
    s += bullets([
        "Maximum file size: <b>10 MB</b>",
        "Supported formats: JPEG, PNG, WebP, HEIC, HEIF, TIFF",
    ], styles)
    s.append(spacer(0.2))
    return s


def build_section_datasets_updated(styles):
    s = []
    s += section_header(9, "How Datasets Are Updated", styles)
    s.append(body(
        "The three datasets \u2014 Gold Set, Reference Dataset, and Candidates \u2014 are the learning substrate "
        "of the engine. Every time you add, approve, or reject an entry you are making a verifiable "
        "claim about what the correct output looks like for a given input. The engine is only as "
        "accurate as these datasets are correct.",
        styles, "body_justify"
    ))
    s.append(spacer(0.12))

    # SubSection: Gold Set
    s += sub_header("Gold Set \u2014 Ground Truth for Benchmarks", styles)
    s.append(body(
        "The Gold Set is the evaluation benchmark. Each entry is an (image, expected_analysis) pair. "
        "When <font name=\"Courier\" size=\"8.5\">run_benchmarks.py</font> runs, it calls "
        "<font name=\"Courier\" size=\"8.5\">analyze_image()</font> on every approved entry and "
        "compares the live result against the stored "
        "<font name=\"Courier\" size=\"8.5\">expected_analysis</font>. Entries that produce a "
        "matching pattern and confidence above threshold score <b>PASS</b>; partial matches score "
        "<b>SOFT_PASS</b>; failures score <b>FAIL</b>.",
        styles, "body_justify"
    ))
    # Gold Set screenshot
    s.append(screenshot_block(
        "02_gold_set.png",
        "Gold Set showing Draft/Approved/Archived lifecycle filters",
        styles,
    ))
    s.append(body("<b>How an entry enters the Gold Set:</b>", styles))
    s += numbered([
        "Upload the image in Workbench \u2192 run full analysis",
        "Review Formatted and VLM vs CV views \u2014 confirm the output is correct",
        "If VLM signals are better: accept overrides in VLM vs CV tab",
        'Tap "Save to Gold Set" (green "\u2714 Commit to Gold Set" when VLM overrides were accepted)',
        "In Gold Set tab: set status to <b>Approved</b> when you are certain the expected_analysis is correct",
        "Run <font name=\"Courier\" size=\"8.5\">python3 scripts/run_benchmarks.py</font> \u2014 the entry now affects the PASS/SOFT_PASS/FAIL score",
    ], styles)
    # Gold Set new form screenshot
    s.append(screenshot_block(
        "03_gold_set_new.png",
        "The New Entry form \u2014 paste the expected_analysis JSON from Workbench",
        styles,
    ))
    s.append(spacer(0.08))
    s.append(body("<b>How entries evolve:</b>", styles))
    s += bullets([
        "<b>Draft</b> \u2192 first save from Workbench or manual entry. Not yet included in benchmark scoring.",
        "<b>Approved</b> \u2192 confirmed correct, included in benchmark runs. Requires human verification.",
        "<b>Archived</b> \u2192 retired from active benchmarks but preserved for historical reference.",
    ], styles)
    s.append(spacer(0.08))
    s.append(note(
        "Never approve a Gold Set entry unless you have verified the expected_analysis by hand. "
        "Incorrect ground truth produces misleading benchmark scores and corrupts the learning signal.",
        styles
    ))
    s.append(body("<b>How to update an existing entry:</b>", styles))
    s += bullets([
        "Reopen the entry in the Gold Set tab",
        "Edit the expected_analysis JSON directly",
        "If the engine output has improved for this image, update expected_analysis to match the new correct output",
        "Save and re-run benchmarks to confirm PASS",
    ], styles)
    s.append(spacer(0.08))
    s.append(body(
        "<b>Impact on engine:</b> Benchmark score directly measures engine accuracy. Adding more approved "
        "Gold Set entries increases benchmark coverage. Every SOFT_PASS is a signal that a rule is close "
        "but needs refinement \u2014 create a Candidate to track the fix.",
        styles
    ))
    s.append(spacer(0.12))

    # SubSection: Reference Dataset
    s += sub_header("Reference Dataset \u2014 Curated Signal Library", styles)
    s.append(body(
        "The Reference Dataset stores curated reference photos with full pipeline analysis attached. "
        "It is not an evaluation benchmark \u2014 it is a signal library. The engine uses Reference Dataset "
        "entries as pattern exemplars during the shoot-match process: when a user uploads a photo, the "
        "engine compares it against approved reference entries to find the closest pattern match.",
        styles, "body_justify"
    ))
    # Reference Dataset screenshot
    s.append(screenshot_block(
        "06_ref_dataset.png",
        "Reference Dataset \u2014 pending entries await approval before entering pattern matching",
        styles,
    ))
    s.append(body("<b>How an entry enters the Reference Dataset:</b>", styles))
    s += numbered([
        "Ingest via API: <font name=\"Courier\" size=\"8.5\">POST /api/lab/reference/ingest</font> with the image file",
        "The pipeline runs automatically: CV passes + VLM signal extraction + VLM reconstruction",
        'Entry appears in Reference Dataset tab as "pending"',
        "Open the entry: review Reference Analysis section (lighting family, modifier, setup)",
        "Check Pipeline Signals and VLM Reconstruction for consistency",
        "If correct: Approve. If wrong or ambiguous: Reject.",
        "Approved entries become active pattern exemplars",
    ], styles)
    s.append(spacer(0.08))
    s.append(body("<b>Keeping the dataset current:</b>", styles))
    s += bullets([
        "After an engine update, use <b>Reprocess</b> to re-run the pipeline on existing entries with fresh signals",
        "Reject entries where lighting is ambiguous, framing is poor, or the setup cannot be reliably identified",
        "Aim for 3\u20135 approved entries per lighting pattern family for robust coverage",
        "Approved entries with high VLM reconstruction confidence (&gt;0.75) are the most valuable",
    ], styles)
    s.append(spacer(0.08))

    ref_status_data = [
        ["Status", "Included in Matching", "Action"],
        ["pending",  "No",  "Review in detail view \u2014 Approve or Reject"],
        ["approved", "Yes", "Active exemplar \u2014 Reprocess after engine updates"],
        ["rejected", "No",  "Excluded \u2014 can be re-approved if issue is resolved"],
    ]
    ref_status_table = Table(ref_status_data, colWidths=[1.1*inch, 1.6*inch, 4.6*inch])
    ref_status_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), NAVY),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GREY_BG]),
        ("GRID",          (0,0), (-1,-1), 0.3, GREY_RULE),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    s.append(ref_status_table)
    s.append(spacer(0.12))

    # SubSection: Candidates
    s += sub_header("Candidates \u2014 Proposed Rule Changes", styles)
    s.append(body(
        "A Candidate is a formal proposal to change the engine's classification rules. Candidates are "
        "the change management system \u2014 they prevent ad-hoc rule edits and ensure every change is "
        "traceable to an observed failure.",
        styles, "body_justify"
    ))
    # Candidates screenshot
    s.append(screenshot_block(
        "04_candidates.png",
        "Candidates tab tracking proposed rule changes by status",
        styles,
    ))
    s.append(body("<b>Lifecycle of a Candidate:</b>", styles))
    s += numbered([
        "Observe a gap: Workbench shows wrong pattern, or benchmark shows SOFT_PASS on a clear case",
        'Create candidate via "Propose Rule" in Workbench (auto-fills from analysis) or manually in Candidates tab',
        "Set status to <b>Proposed</b> \u2014 record the failing image path, the incorrect output, and the expected output in the proposed_change JSON",
        "Run benchmarks to establish baseline: document current PASS/SOFT_PASS/FAIL counts",
        "Implement the rule change in the engine (pattern weights, cue thresholds, scoring adjustments)",
        "Re-run benchmarks: confirm the target case improved without regressing others",
        "Update Candidate status to <b>Accepted</b>. Add implementation notes.",
        "Update any affected Gold Set entries if expected_analysis changed",
    ], styles)
    # Candidates new form screenshot
    s.append(screenshot_block(
        "05_candidates_new.png",
        "New Rule Candidate \u2014 capture the failing pattern, evidence, and proposed fix",
        styles,
    ))
    s.append(spacer(0.08))
    s.append(code_line("draft \u2192 proposed \u2192 review \u2192 accepted | rejected", styles))
    s.append(spacer(0.08))
    s.append(note(
        "A Candidate should never be accepted until benchmarks confirm improvement with zero new FAIL "
        "regressions. If a rule change fixes one case but breaks another, split it into two Candidates.",
        styles
    ))
    s.append(spacer(0.2))
    return s


def build_section_lighting_intelligence(styles):
    s = []
    s += section_header(10, "Lighting Intelligence \u2014 How the System Learns", styles)
    s.append(body(
        "Lighting Intelligence is the structured knowledge object that the engine produces for every "
        "analysis. It is not a static lookup \u2014 it is synthesised in real time from computer vision "
        "signals, VLM interpretation, environment inference, and pattern classification. Every field "
        "in <font name=\"Courier\" size=\"8.5\">lightingIntelligence</font> reflects a specific "
        "inference step, and every field can be improved by better Gold Set coverage, better reference "
        "images, or a more precise classification rule.",
        styles, "body_justify"
    ))
    s.append(spacer(0.12))

    # SubSection: What lightingIntelligence Contains
    s += sub_header("What lightingIntelligence Contains", styles)
    s.append(body(
        "<font name=\"Courier\" size=\"8.5\">lightingIntelligence</font> is assembled by "
        "<font name=\"Courier\" size=\"8.5\">_build_lighting_intelligence()</font> in "
        "<font name=\"Courier\" size=\"8.5\">engine/services/shoot_match_service.py</font>. It is "
        "the final output layer of the engine \u2014 the synthesised result after all CV passes, VLM calls, "
        "pattern classification, and environment inference have completed.",
        styles, "body_justify"
    ))
    s.append(spacer(0.08))

    fields_data = [
        ["Field", "Source", "What It Means"],
        ["detectedPattern",       "Pattern classifier + VLM reconciliation",         "The authoritative lighting pattern (rembrandt, butterfly, loop, split, clamshell, etc.)"],
        ["patternConfidence",     "Reliability score from pattern candidates",        "How certain the engine is of the detected pattern (0.0\u20131.0)"],
        ["detectedModifier",      "CV modifier shape solver + VLM reconstruction",   "The most likely light modifier (softbox, octa, beauty dish, umbrella, window, etc.)"],
        ["lightCount",            "Light role hypothesis pass",                       "Number of distinct light sources detected"],
        ["keyPosition",           "Key light geometry inference",                     'Position of the key light (e.g. "45\u00b0 camera-left, high")'],
        ["fillMethod",            "Fill role inference",                              "How fill is achieved (reflector, second light, negative fill, none)"],
        ["lightSourceType",       "Environment inference",                            "natural / artificial / mixed / unknown"],
        ["ambientConditions",     "Environment inference",                            "Human-readable description of shooting conditions"],
        ["detectedCCT",           "Color temperature pass",                           "Estimated color temperature in Kelvin"],
        ["backgroundLight",       "Background light role detector",                   "Whether a dedicated background light is detected"],
        ["moodDiscrepancy",       "User mood vs detected mood comparison",            "Flags when user's selected mood differs from what the image shows"],
        ["perceptionExplanation", "Perception layer (supporting/contradicting signals)", "Supporting signals, contradicting signals, ambiguity flags"],
    ]
    fields_table = Table(fields_data, colWidths=[1.65*inch, 2.15*inch, 3.47*inch])
    fields_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), NAVY),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME",      (0,1), (0,-1), "Courier"),
        ("FONTSIZE",      (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GREY_BG]),
        ("GRID",          (0,0), (-1,-1), 0.3, GREY_RULE),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    s.append(fields_table)
    s.append(spacer(0.12))

    # SubSection: The Analysis Pipeline
    s += sub_header("The Analysis Pipeline \u2014 How Each Signal Is Built", styles)
    s.append(body(
        "Every field in lightingIntelligence traces back through a specific pipeline stage. "
        "The engine runs these stages sequentially:",
        styles
    ))
    s += numbered([
        "<b>CV Vision Pipeline</b> (<font name=\"Courier\" size=\"8.5\">engine/vision_pipeline.py</font>) "
        "\u2014 MediaPipe face detection, shadow analysis, highlight mapping, catchlight geometry, surface "
        "classification, environment detection, color temperature. Produces raw signal measurements.",

        "<b>VLM Signal Extraction</b> (<font name=\"Courier\" size=\"8.5\">engine/vlm.py</font>) "
        "\u2014 A vision model (GPT-4.1 or Claude Sonnet) analyses the image and extracts observable "
        "physical signals: shadow vector, highlight width ratio, catchlight shape/position, head "
        "geometry, reconstruction estimates. Retries up to 4 times on 429 rate limits.",

        "<b>VLM Reconstruction</b> (<font name=\"Courier\" size=\"8.5\">engine/vlm_reconstruction.py</font>) "
        "\u2014 A second VLM call interprets the structured CV + VLM signals and produces a physical "
        "reconstruction: dominant source direction, source size class, modifier family candidates, "
        "light roles, environment type. This sits between raw signals and the rule engine.",

        "<b>Cue Inference Pipeline</b> (<font name=\"Courier\" size=\"8.5\">engine/cue_inference_pipeline.py</font>) "
        "\u2014 23 typed cue fields are computed from all upstream signals. Each cue has a confidence "
        "score. Low-confidence and missing cues are flagged.",

        "<b>Pattern Classification</b> (<font name=\"Courier\" size=\"8.5\">engine/orchestrator.py</font>) "
        "\u2014 Pattern candidates are scored and ranked. The authoritative pattern is selected by "
        "reconciling the classifier result, VLM lighting_style, and reconstruction candidates. "
        "The reliability score measures signal consistency.",

        "<b>Environment Intelligence</b> (<font name=\"Courier\" size=\"8.5\">_describe_ambient_conditions</font>) "
        "\u2014 The environment inference result is translated into "
        "<font name=\"Courier\" size=\"8.5\">lightSourceType</font>, "
        "<font name=\"Courier\" size=\"8.5\">ambientConditions</font>, and "
        "<font name=\"Courier\" size=\"8.5\">environmentConfidence</font>.",

        "<b>Perception Layer</b> \u2014 Face validation, signal reliability assessment, edge-case flags "
        "(blown highlights, mixed color temperature, extreme low-key, B&amp;W processing), and the "
        "perception explanation (supporting signals, contradicting signals, ambiguity flags).",
    ], styles)
    # Screenshot after pipeline stages
    s.append(screenshot_block(
        "01_workbench.png",
        "Every Workbench analysis runs the full 7-stage pipeline \u2014 results reflect all active signals",
        styles,
    ))
    s.append(spacer(0.12))

    # SubSection: How the Engine Improves Over Time
    s += sub_header("How the Engine Improves Over Time", styles)
    s.append(body(
        "The engine does not have a training loop \u2014 it improves through the deliberate human curation "
        "loop that the Lab enables. The learning cycle is:",
        styles
    ))
    s += numbered([
        "<b>Observe</b> \u2014 An image produces an incorrect or low-confidence result. Found via: "
        "benchmark SOFT_PASS/FAIL, user feedback, Workbench testing.",

        "<b>Diagnose</b> \u2014 Open the image in Workbench with Debug Overlay. Identify which signal is "
        "weak or wrong: catchlight geometry? shadow direction? VLM vs CV conflict? Check the "
        "perceptionExplanation ambiguity flags.",

        "<b>Curate</b> \u2014 If the reference exemplars for this pattern are sparse, add more approved "
        "Reference Dataset entries for that lighting family. More exemplars \u2192 better pattern "
        "matching coverage.",

        "<b>Propose</b> \u2014 Create a Candidate with the failing image, the incorrect output, the "
        "expected output, and the specific signal gap as evidence.",

        "<b>Fix</b> \u2014 Implement the rule change: adjust pattern scoring weights, add a new cue "
        "threshold, refine the VLM reconstruction prompt, or update "
        "<font name=\"Courier\" size=\"8.5\">_AMBIENT_DESCRIPTIONS</font>.",

        "<b>Verify</b> \u2014 Re-run benchmarks. The target case must improve. No existing PASS should "
        "become FAIL.",

        "<b>Commit</b> \u2014 Mark the Candidate as Accepted. Add the corrected image to the Gold Set. "
        "The next benchmark run reflects the improvement permanently.",
    ], styles)
    # Screenshot after the improvement cycle
    s.append(screenshot_block(
        "03_gold_set_new.png",
        "End the improvement cycle by adding the verified result to the Gold Set as ground truth",
        styles,
    ))
    s.append(spacer(0.08))
    s.append(note(
        "Every improvement to the engine should be traceable: failing image \u2192 Candidate \u2192 code change "
        "\u2192 benchmark delta \u2192 Gold Set entry. If any step in that chain is missing, the improvement "
        "cannot be verified or reproduced.",
        styles
    ))
    s.append(spacer(0.12))

    # SubSection: What Makes a Signal "Better"
    s += sub_header('What Makes a Signal "Better"', styles)
    s += bullets([
        "<b>More Gold Set coverage</b> \u2014 Each approved entry adds a data point. Patterns with fewer "
        "than 3 Gold Set entries are under-tested. Aim for 5+ per pattern.",

        "<b>Higher VLM reconstruction confidence</b> \u2014 If "
        "<font name=\"Courier\" size=\"8.5\">reconstruction_confidence</font> is below 0.6 for a "
        "pattern that should be clear, the VLM prompt or the signal aggregation needs refinement.",

        "<b>Fewer ambiguity flags</b> \u2014 The perception layer flags conditions that reduce reliability: "
        "<font name=\"Courier\" size=\"8.5\">no_face</font>, "
        "<font name=\"Courier\" size=\"8.5\">tiny_face</font>, "
        "<font name=\"Courier\" size=\"8.5\">multiple_patterns_close_confidence</font>, "
        "<font name=\"Courier\" size=\"8.5\">bw_limits_color_cues</font>, "
        "<font name=\"Courier\" size=\"8.5\">low_signal_count</font>. "
        "Reducing these flags means the engine has more usable signal.",

        "<b>Tighter SOFT_PASS cluster</b> \u2014 As rules improve, SOFT_PASS cases should move to PASS. "
        "If SOFT_PASS count stays flat or grows, signals for those patterns are fundamentally weak "
        "and need more Reference Dataset entries or VLM prompt tuning.",

        "<b>Signal consistency (VLM vs CV agreement)</b> \u2014 In the Workbench VLM vs CV tab, "
        "disagreements between VLM and CV signals reveal where perception is uncertain. When VLM "
        "and CV agree, confidence is high. Systematic disagreements identify where one source is "
        "unreliable for a specific pattern.",
    ], styles)
    s.append(spacer(0.2))
    return s


def build_section_faq(styles):
    s = []
    s += section_header(11, "FAQ", styles)

    faqs = [
        (
            "I don't see the NGW Lab option anywhere in the app.",
            "Lab is only visible to admin-whitelisted accounts. Confirm your login email is in the "
            "<font name=\"Courier\" size=\"8.5\">ADMIN_EMAILS</font> list in "
            "<font name=\"Courier\" size=\"8.5\">auth/dev_guard.py</font>. If it is and the tab "
            "still doesn't appear, check that the <font name=\"Courier\" size=\"8.5\">enable_lab</font> "
            "feature flag is active in your environment."
        ),
        (
            "I see \"Sign in required\" when I open Lab.",
            "You are not authenticated. Tap \"Sign In\" and log in with an admin email address. "
            "The Lab screen will appear after successful authentication."
        ),
        (
            "The VLM vs CV tab is greyed out after analysis.",
            "Either no VLM API key is set in .env (add OPENAI_API_KEY or ANTHROPIC_API_KEY), or the "
            "VLM returned no data for this image. Check server logs for 429 rate-limit errors, "
            "timeout messages, or JSON parse failures."
        ),
        (
            "Analysis is taking a very long time or hanging.",
            "The pipeline runs CV processing plus up to two VLM calls (signal extraction and "
            "reconstruction). With a rate-limited VLM, retries add 2 + 5 + 15 = 22 seconds before "
            "failing gracefully. If you want faster results without VLM, set "
            "<font name=\"Courier\" size=\"8.5\">VLM_PROVIDER=none</font> in .env."
        ),
        (
            "I'm getting 429 rate limit errors from OpenAI.",
            "The engine retries automatically (2s, 5s, 15s delays). If errors persist, you have hit "
            "your tier rate limit. Request an increase at "
            "<font color=\"#3b82f6\">https://platform.openai.com/settings/organization/limits</font> "
            "or reduce benchmark concurrency."
        ),
        (
            "Images in the Reference Dataset tab show \"Image unavailable\".",
            "All /api/lab/ image endpoints require a Bearer token. Images are fetched via authenticated "
            "blob requests automatically. If you see this error, the session may have expired \u2014 "
            "sign out and sign back in."
        ),
        (
            "I approved a Reference Dataset entry by mistake.",
            "Currently there is no undo button. As a workaround, use the Reject action to re-mark "
            "the entry as rejected, or reprocess it to reset to pending status."
        ),
        (
            "How do I add an image to the Reference Dataset?",
            "Reference images are ingested via the API: "
            "<font name=\"Courier\" size=\"8.5\">POST /api/lab/reference/ingest</font>. Once ingested "
            "they appear in the grid as \"pending\" and can be reviewed. The UI does not have a direct "
            "upload button for the Reference Dataset."
        ),
        (
            "The Debug Overlay option isn't showing.",
            "The Debug Overlay checkbox only appears before analysis runs (before tapping Analyze). "
            "If you have already run an analysis, tap \"New Image\" to reset and select the image "
            "again with Debug Overlay checked."
        ),
        (
            "A Gold Set entry shows as SOFT_PASS instead of PASS in benchmarks.",
            "SOFT_PASS means the engine found the right lighting pattern but with lower confidence "
            "than expected, or a secondary signal differed from the expected analysis. Open the image "
            "in Workbench with Debug Overlay, compare signals to your expected_analysis JSON in the "
            "Gold Set, and propose a rule change if the discrepancy is systematic."
        ),
        (
            "How do I run benchmarks?",
            "From the server CLI: "
            "<font name=\"Courier\" size=\"8.5\">python3 scripts/run_benchmarks.py</font>. The UI "
            "does not trigger benchmark runs. Results show PASS / SOFT_PASS / FAIL per entry with "
            "confidence scores and signal diagnostics."
        ),
        (
            "Can I export the Gold Set?",
            "The Gold Set is stored in the database. You can query it directly or use the "
            "<font name=\"Courier\" size=\"8.5\">/api/lab/gold-set</font> endpoint with your Bearer "
            "token to get all entries as JSON. There is no built-in export button in the current UI."
        ),
        (
            "What is the difference between Approve and Reprocess in the Reference Dataset?",
            "Approve marks the entry as a valid curated reference (changes status, no pipeline "
            "re-run). Reprocess runs the full CV + VLM pipeline again on the existing image and "
            "updates the stored signals and analysis \u2014 useful after an engine update. Status is "
            "not changed by Reprocess."
        ),
        (
            "Can I use LAB on mobile?",
            "Yes. The Lab screen is responsive and works on mobile. Image upload uses the native "
            "file picker. The Debug Overlay and JSON views are scrollable. For detailed signal "
            "review, a desktop or tablet is more comfortable due to screen width."
        ),
    ]

    for q, a in faqs:
        s += faq_entry(q, a, styles)

    s.append(spacer(0.2))
    return s


# ─── Main builder ─────────────────────────────────────────────────────────────
def build_pdf():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    doc = NGWDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch,
        topMargin=0.80*inch,
        bottomMargin=0.75*inch,
    )

    styles = build_styles()
    story  = []

    # Switch to normal template for all content
    story.append(NextPageTemplate("normal"))

    # Cover
    story += build_cover(styles)

    # TOC
    toc_flowables, toc = build_toc()
    story += toc_flowables

    # Sections
    story += build_section_overview(styles)
    story.append(PageBreak())
    story += build_section_workbench(styles)
    story.append(PageBreak())
    story += build_section_gold_set(styles)
    story.append(PageBreak())
    story += build_section_candidates(styles)
    story.append(PageBreak())
    story += build_section_reference_dataset(styles)
    story.append(PageBreak())
    story += build_section_workflows(styles)
    story.append(PageBreak())
    story += build_section_environment(styles)
    story.append(PageBreak())
    story += build_section_datasets_updated(styles)
    story.append(PageBreak())
    story += build_section_lighting_intelligence(styles)
    story.append(PageBreak())
    story += build_section_faq(styles)

    doc.multiBuild(story)
    print(f"PDF generated: {OUTPUT_PATH}")


if __name__ == "__main__":
    build_pdf()
