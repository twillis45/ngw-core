#!/usr/bin/env python3
"""
NGW Complete Documentation System
Premium PDF Documentation Suite — 15 Documents
Brand: No Guesswork Lighting (NGW)
Quality: Apple / Notion / Stripe documentation level
"""

import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    Table, TableStyle, KeepTogether, HRFlowable, NextPageTemplate,
    Image as RLImage, Flowable, PageBreak,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PATHS & VERSION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BASE     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS    = os.path.join(BASE, 'docs', 'screenshots')
IMGS     = os.path.join(BASE, 'docs', 'images')
OUT_DIR  = os.path.join(BASE, 'docs', 'pdf')
os.makedirs(OUT_DIR, exist_ok=True)

VERSION    = "v1.0"
BUILD_DATE = datetime.now().strftime("%B %Y")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PAGE GEOMETRY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PW, PH  = letter              # 612 × 792 pt  (US Letter 8.5 × 11 in)
ML = MR = 0.75 * inch         # side margins
MT      = 1.0  * inch         # top  (clears header)
MB      = 0.7  * inch         # bottom (clears footer)
TW      = PW - ML - MR        # usable text width ≈ 468 pt

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BRAND PALETTE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BG      = HexColor('#0E0F12')   # page background
CARD    = HexColor('#17191F')   # card / panel surface
CARD2   = HexColor('#1E2029')   # slightly lighter card
BORDER  = HexColor('#2A2D36')   # divider / outline
BLUE    = HexColor('#3B82F6')   # primary accent / CTA
BLUE_DK = HexColor('#1D4ED8')   # darker blue
GREEN   = HexColor('#22C55E')   # success
AMBER   = HexColor('#F59E0B')   # warning / gold
RED     = HexColor('#EF4444')   # error
WHITE   = HexColor('#FFFFFF')   # primary text
MUTED   = HexColor('#A1A1AA')   # secondary text
DIM     = HexColor('#6B7280')   # tertiary / placeholder
COVER_LINE = HexColor('#1C2030') # subtle geometry lines on covers

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FONT REGISTRATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_HN  = '/System/Library/Fonts/HelveticaNeue.ttc'
_AI  = '/System/Library/Fonts/Supplemental/Arial Italic.ttf'
_AB  = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

def _reg(name, path, idx=0):
    if os.path.exists(path):
        try:
            pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
            return True
        except Exception:
            pass
    return False

_reg('HN',   _HN, 0)   # HelveticaNeue Regular
_reg('HN-B', _HN, 1)   # HelveticaNeue Bold
_reg('HN-L', _HN, 2)   # HelveticaNeue Light
_reg('HN-I', _AI, 0)   # Italic (Arial Italic fallback)

FREG  = 'HN'
FBOLD = 'HN-B'
FMONO = 'Courier'
FITAL = 'HN-I'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PARAGRAPH STYLES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
S = {}

def _ps(n, **kw):
    S[n] = ParagraphStyle(n, **kw)

_ps('cov_num',    fontName=FREG,  fontSize=11, textColor=BLUE,  leading=16, spaceAfter=6,  alignment=TA_LEFT)
_ps('cov_title',  fontName=FBOLD, fontSize=40, textColor=WHITE, leading=48, spaceAfter=10, alignment=TA_LEFT)
_ps('cov_sub',    fontName=FREG,  fontSize=17, textColor=MUTED, leading=26, spaceAfter=14, alignment=TA_LEFT)
_ps('cov_meta',   fontName=FREG,  fontSize=12, textColor=DIM,   leading=18, spaceAfter=0,  alignment=TA_LEFT)
_ps('div_num',    fontName=FBOLD, fontSize=72, textColor=CARD2, leading=80, spaceAfter=0,  alignment=TA_LEFT)
_ps('div_title',  fontName=FBOLD, fontSize=30, textColor=WHITE, leading=38, spaceAfter=6,  alignment=TA_LEFT)
_ps('div_sub',    fontName=FREG,  fontSize=14, textColor=MUTED, leading=22, spaceAfter=0,  alignment=TA_LEFT)
_ps('h1',         fontName=FBOLD, fontSize=24, textColor=WHITE, leading=32, spaceAfter=12, spaceBefore=20)
_ps('h2',         fontName=FBOLD, fontSize=18, textColor=WHITE, leading=26, spaceAfter=8,  spaceBefore=18)
_ps('h3',         fontName=FBOLD, fontSize=15, textColor=WHITE, leading=22, spaceAfter=6,  spaceBefore=18)
_ps('h4',         fontName=FBOLD, fontSize=12, textColor=BLUE,  leading=18, spaceAfter=4,  spaceBefore=10)
_ps('body',       fontName=FREG,  fontSize=13, textColor=WHITE, leading=22, spaceAfter=12)
_ps('body_muted', fontName=FREG,  fontSize=12, textColor=MUTED, leading=20, spaceAfter=10)
_ps('bullet',     fontName=FREG,  fontSize=13, textColor=WHITE, leading=21, spaceAfter=7,  leftIndent=16, firstLineIndent=-10)
_ps('bullet_sm',  fontName=FREG,  fontSize=12, textColor=MUTED, leading=19, spaceAfter=6,  leftIndent=16, firstLineIndent=-10)
_ps('caption',    fontName=FITAL, fontSize=11, textColor=MUTED, leading=16, spaceAfter=16, alignment=TA_CENTER)
_ps('label',      fontName=FBOLD, fontSize=10, textColor=MUTED, leading=14, spaceAfter=4,  spaceBefore=8)
_ps('code',       fontName=FMONO, fontSize=11, textColor=GREEN, leading=16, backColor=CARD, leftIndent=8, rightIndent=8, spaceAfter=8)
_ps('note',       fontName=FITAL, fontSize=12, textColor=AMBER, leading=18, spaceAfter=8)
_ps('th',         fontName=FBOLD, fontSize=11, textColor=WHITE, leading=16)
_ps('td',         fontName=FREG,  fontSize=11, textColor=MUTED, leading=16)
_ps('td_w',       fontName=FREG,  fontSize=11, textColor=WHITE, leading=16)
_ps('tag_blue',   fontName=FBOLD, fontSize=10, textColor=BLUE,  leading=14)
_ps('tag_green',  fontName=FBOLD, fontSize=10, textColor=GREEN, leading=14)
_ps('tag_amber',  fontName=FBOLD, fontSize=10, textColor=AMBER, leading=14)
_ps('step_num',   fontName=FBOLD, fontSize=11, textColor=BLUE,  leading=16)
_ps('step_title', fontName=FBOLD, fontSize=13, textColor=WHITE, leading=20, spaceAfter=3)
_ps('step_body',  fontName=FREG,  fontSize=12, textColor=MUTED, leading=20, spaceAfter=0)
_ps('qr_head',    fontName=FBOLD, fontSize=14, textColor=WHITE, leading=20, spaceAfter=6)
_ps('qr_item',    fontName=FREG,  fontSize=11, textColor=WHITE, leading=18, spaceAfter=3, leftIndent=10, firstLineIndent=-6)
_ps('arch_label', fontName=FBOLD, fontSize=10, textColor=BLUE,  leading=14, alignment=TA_CENTER)
_ps('arch_body',  fontName=FREG,  fontSize=10, textColor=MUTED, leading=14, alignment=TA_CENTER)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PAGE CHROME HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _bg(c):
    """Fill page with brand background."""
    c.setFillColor(BG)
    c.rect(0, 0, PW, PH, fill=1, stroke=0)

def _draw_header(c, doc_title):
    """Two-line header: product name + doc title | NGW badge."""
    c.saveState()
    # Header background strip
    c.setFillColor(CARD)
    c.rect(0, PH - MT + 0.1*inch, PW, MT - 0.1*inch, fill=1, stroke=0)
    # Blue bottom rule
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.2)
    c.line(ML, PH - MT + 0.12*inch, PW - MR, PH - MT + 0.12*inch)
    # Brand text
    c.setFont(FREG, 8)
    c.setFillColor(DIM)
    c.drawString(ML, PH - 0.38*inch, 'NO GUESSWORK LIGHTING')
    # Document title
    c.setFont(FBOLD, 11)
    c.setFillColor(WHITE)
    c.drawString(ML, PH - 0.58*inch, doc_title)
    # NGW badge (right)
    c.setFont(FBOLD, 18)
    c.setFillColor(BLUE)
    c.drawRightString(PW - MR, PH - 0.56*inch, 'NGW')
    c.restoreState()

def _draw_footer(c, page_num):
    """Footer: version | ● page | date."""
    c.saveState()
    # Footer background strip
    c.setFillColor(CARD)
    c.rect(0, 0, PW, MB - 0.05*inch, fill=1, stroke=0)
    # Top rule
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    c.line(ML, MB - 0.07*inch, PW - MR, MB - 0.07*inch)
    # Left: version
    c.setFont(FREG, 9)
    c.setFillColor(DIM)
    c.drawString(ML, 0.22*inch, VERSION)
    # Center: page number
    c.setFont(FBOLD, 9)
    c.setFillColor(MUTED)
    c.drawCentredString(PW/2, 0.22*inch, f'  {page_num}  ')
    # Right: date
    c.setFont(FREG, 9)
    c.setFillColor(DIM)
    c.drawRightString(PW - MR, 0.22*inch, BUILD_DATE)
    c.restoreState()

def make_on_body(title):
    """Closure: returns onPage callback for body pages."""
    def on_body(c, doc):
        _bg(c)
        _draw_header(c, title)
        _draw_footer(c, doc.page)
    return on_body

def on_cover(c, doc):
    """onPage for cover/divider pages — dark bg only, no header/footer."""
    _bg(c)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CUSTOM FLOWABLES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DocCover(Flowable):
    """Full-page premium document cover."""
    def __init__(self, doc_num, title, subtitle, accent=BLUE):
        super().__init__()
        self.doc_num  = doc_num
        self.title    = title
        self.subtitle = subtitle
        self.accent   = accent

    def wrap(self, aw, ah):
        return (aw, ah)

    def draw(self):
        c = self.canv
        w, h = PW, PH
        c.saveState()

        # Register PDF destination anchor so TOC links can jump here
        c.bookmarkPage(f'doc_{self.doc_num:02d}' if self.doc_num else 'doc_00')

        # Background already set by onPage; draw accent geometry
        # Large subtle circle (top-right)
        c.setStrokeColor(COVER_LINE)
        c.setLineWidth(1)
        c.circle(w * 0.82, h * 0.72, 180, stroke=1, fill=0)
        c.circle(w * 0.82, h * 0.72, 120, stroke=1, fill=0)
        c.circle(w * 0.82, h * 0.72, 60,  stroke=1, fill=0)

        # Left accent bar
        c.setFillColor(self.accent)
        c.rect(ML, h * 0.32, 3, h * 0.36, fill=1, stroke=0)

        # Document number
        c.setFont(FREG, 11)
        c.setFillColor(self.accent)
        num_str = f'DOCUMENT {self.doc_num:02d}' if self.doc_num else 'NGW'
        c.drawString(ML + 12, h * 0.72, num_str)

        # Title — word-wrap manually
        title_x = ML + 12
        title_y = h * 0.67
        c.setFont(FBOLD, 38)
        c.setFillColor(WHITE)
        words = self.title.split()
        line = ''
        lines = []
        for w_ in words:
            test = (line + ' ' + w_).strip()
            if c.stringWidth(test, FBOLD, 38) > TW - 20:
                lines.append(line)
                line = w_
            else:
                line = test
        if line:
            lines.append(line)
        for i, ln in enumerate(lines):
            c.drawString(title_x, title_y - i * 46, ln)

        # Subtitle
        sub_y = title_y - len(lines) * 46 - 14
        c.setFont(FREG, 16)
        c.setFillColor(MUTED)
        c.drawString(title_x, sub_y, self.subtitle)

        # Bottom metadata bar
        c.setFillColor(CARD)
        c.rect(0, 0, PW, 1.4*inch, fill=1, stroke=0)
        c.setStrokeColor(self.accent)
        c.setLineWidth(2)
        c.line(0, 1.4*inch, PW, 1.4*inch)

        c.setFont(FBOLD, 11)
        c.setFillColor(WHITE)
        c.drawString(ML, 0.9*inch, 'NO GUESSWORK LIGHTING')
        c.setFont(FREG, 10)
        c.setFillColor(DIM)
        c.drawString(ML, 0.68*inch, f'{VERSION}  ·  {BUILD_DATE}  ·  Confidential')

        # NGW monogram (bottom right)
        c.setFont(FBOLD, 28)
        c.setFillColor(self.accent)
        c.drawRightString(PW - MR, 0.78*inch, 'NGW')

        c.restoreState()


class SectionDivider(Flowable):
    """Full-page section divider with large number and title."""
    def __init__(self, num, title, description='', accent=BLUE):
        super().__init__()
        self.num         = num
        self.title       = title
        self.description = description
        self.accent      = accent

    def wrap(self, aw, ah):
        return (aw, ah)

    def draw(self):
        c = self.canv
        c.saveState()

        # Giant watermark number
        c.setFont(FBOLD, 140)
        c.setFillColor(CARD2)
        c.drawString(ML - 6, PH * 0.35, str(self.num).zfill(2))

        # Accent bar
        c.setFillColor(self.accent)
        c.rect(ML, PH * 0.54, TW, 2, fill=1, stroke=0)

        # "SECTION" label
        c.setFont(FBOLD, 10)
        c.setFillColor(self.accent)
        c.drawString(ML, PH * 0.58, 'SECTION')

        # Title
        c.setFont(FBOLD, 28)
        c.setFillColor(WHITE)
        title_y = PH * 0.63
        words = self.title.split()
        line, lines = '', []
        for wrd in words:
            t = (line + ' ' + wrd).strip()
            if c.stringWidth(t, FBOLD, 28) > TW:
                lines.append(line); line = wrd
            else:
                line = t
        if line: lines.append(line)
        for i, ln in enumerate(lines):
            c.drawString(ML, title_y + i * 34, ln)

        # Description
        if self.description:
            c.setFont(FREG, 14)
            c.setFillColor(MUTED)
            c.drawString(ML, title_y - 28, self.description)

        c.restoreState()


MAX_IMG_H = 340   # cap for tall mobile screenshots (pt)

class ScreenshotCard(Flowable):
    """Screenshot embedded in a dark card frame with caption."""
    def __init__(self, filename, caption, width=None, pad=10):
        super().__init__()
        self.path    = os.path.join(SHOTS, filename) if not os.path.isabs(filename) else filename
        self.caption = caption
        self.tgt_w   = width or TW
        self.pad     = pad
        self._exists = os.path.exists(self.path)
        self._img_w  = self.tgt_w - pad * 2
        self._img_h  = 90
        self._total_h = self._calc_height()

    def _calc_height(self):
        CAP_H = 26
        if self._exists:
            try:
                tmp   = RLImage(self.path)
                ar    = tmp.imageHeight / tmp.imageWidth
                img_w = self.tgt_w - self.pad * 2
                img_h = img_w * ar
                # Cap height for tall mobile screenshots; shrink width to match
                if img_h > MAX_IMG_H:
                    img_h = MAX_IMG_H
                    img_w = img_h / ar
                self._img_w = img_w
                self._img_h = img_h
                return img_h + self.pad * 2 + CAP_H
            except Exception:
                pass
        return 140

    def wrap(self, aw, ah):
        return (self.tgt_w, self._total_h)

    def draw(self):
        c   = self.canv
        w   = self.tgt_w
        h   = self._total_h
        pad = self.pad
        c.saveState()
        # Card background
        c.setFillColor(CARD)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.8)
        c.roundRect(0, 24, w, h - 24, 6, fill=1, stroke=1)
        # Image or placeholder
        if self._exists:
            try:
                img   = RLImage(self.path, width=self._img_w, height=self._img_h)
                img_x = (w - self._img_w) / 2   # center horizontally
                img_y = h - pad - self._img_h
                img.drawOn(c, img_x, img_y)
            except Exception:
                self._placeholder(c, w, h, pad)
        else:
            self._placeholder(c, w, h, pad)
        # Caption
        c.setFont(FITAL, 10)
        c.setFillColor(MUTED)
        c.drawCentredString(w / 2, 8, self.caption)
        c.restoreState()

    def _placeholder(self, c, w, h, pad):
        c.setFillColor(CARD2)
        c.roundRect(pad, 30, w - pad*2, h - pad - 30, 4, fill=1, stroke=0)
        fn = os.path.basename(self.path) if self.path else 'screenshot'
        c.setFont(FREG, 11)
        c.setFillColor(DIM)
        c.drawCentredString(w/2, h/2, f'[ Screenshot: {fn} ]')


class CalloutBox(Flowable):
    """Left-bordered callout box for notes / tips / warnings."""
    COLORS = {'blue': BLUE, 'green': GREEN, 'amber': AMBER, 'red': RED}

    def __init__(self, label, items, kind='blue', width=None):
        super().__init__()
        self.label  = label
        self.items  = items  # list of strings
        self.color  = self.COLORS.get(kind, BLUE)
        self.width  = width or TW

    def wrap(self, aw, ah):
        line_h  = 19
        pad     = 10
        label_h = 18
        content_h = sum(len(item) // 52 * line_h + line_h for item in self.items)
        self._h = label_h + content_h + pad * 2 + 6
        return (self.width, self._h)

    def draw(self):
        c  = self.canv
        w  = self.width
        h  = self._h
        c.saveState()
        # Background
        c.setFillColor(CARD)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.roundRect(6, 0, w - 6, h, 5, fill=1, stroke=1)
        # Left accent bar
        c.setFillColor(self.color)
        c.roundRect(0, 0, 4, h, 2, fill=1, stroke=0)
        # Label
        c.setFont(FBOLD, 10)
        c.setFillColor(self.color)
        c.drawString(18, h - 18, self.label.upper())
        # Items
        y = h - 34
        for item in self.items:
            c.setFont(FREG, 12)
            c.setFillColor(WHITE)
            bullet_text = f'\u2022  {item}'
            # Naive word-wrap
            words = bullet_text.split()
            line, lines_ = '', []
            for wrd in words:
                t = (line + ' ' + wrd).strip()
                if c.stringWidth(t, FREG, 12) > w - 26:
                    lines_.append(line); line = wrd
                else:
                    line = t
            if line: lines_.append(line)
            for ln in lines_:
                if y < 6: break
                c.drawString(18, y, ln)
                y -= 19
            y -= 4
        c.restoreState()


class StepBox(Flowable):
    """Numbered step in a workflow."""
    def __init__(self, num, title, body, width=None):
        super().__init__()
        self.num   = num
        self.title = title
        self.body  = body
        self.width = width or TW

    def wrap(self, aw, ah):
        self._h = 74
        return (self.width, self._h)

    def draw(self):
        c  = self.canv
        w  = self.width
        h  = self._h
        c.saveState()
        # Background card
        c.setFillColor(CARD)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=1)
        # Step number circle
        cx, cy, r = 32, h/2, 16
        c.setFillColor(BLUE)
        c.circle(cx, cy, r, fill=1, stroke=0)
        c.setFont(FBOLD, 13)
        c.setFillColor(WHITE)
        c.drawCentredString(cx, cy - 5, str(self.num))
        # Title
        c.setFont(FBOLD, 13)
        c.setFillColor(WHITE)
        c.drawString(56, h - 22, self.title)
        # Body
        c.setFont(FREG, 11)
        c.setFillColor(MUTED)
        c.drawString(56, h - 40, self.body[:90] + ('…' if len(self.body) > 90 else ''))
        if len(self.body) > 90:
            c.drawString(56, h - 57, self.body[90:180])
        c.restoreState()


class DiagramPlaceholder(Flowable):
    """Placeholder for an architecture diagram."""
    def __init__(self, title, height=200, width=None):
        super().__init__()
        self.title  = title
        self._h     = height
        self.width  = width or TW

    def wrap(self, aw, ah):
        return (self.width, self._h)

    def draw(self):
        c = self.canv
        w = self.width
        h = self._h
        c.saveState()
        c.setFillColor(CARD)
        c.setStrokeColor(BORDER)
        c.setLineWidth(1)
        c.setDash(4, 4)
        c.roundRect(0, 0, w, h, 8, fill=1, stroke=1)
        c.setDash()
        c.setFont(FBOLD, 13)
        c.setFillColor(DIM)
        c.drawCentredString(w/2, h/2 + 8, f'[ {self.title} ]')
        c.setFont(FREG, 10)
        c.setFillColor(DIM)
        c.drawCentredString(w/2, h/2 - 12, 'Diagram — See Technical Appendix')
        c.restoreState()


class MetricRow(Flowable):
    """Row of metric cards (value + label)."""
    def __init__(self, metrics, width=None):
        super().__init__()
        self.metrics = metrics  # list of (value, label, color)
        self.width   = width or TW
        self._h      = 68

    def wrap(self, aw, ah):
        return (self.width, self._h)

    def draw(self):
        c  = self.canv
        w  = self.width
        h  = self._h
        n  = len(self.metrics)
        cw = (w - (n - 1) * 8) / n
        c.saveState()
        for i, (val, lbl, col) in enumerate(self.metrics):
            x = i * (cw + 8)
            c.setFillColor(CARD)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.5)
            c.roundRect(x, 0, cw, h, 5, fill=1, stroke=1)
            # Top accent
            c.setFillColor(col)
            c.rect(x, h - 4, cw, 4, fill=1, stroke=0)
            # Value
            c.setFont(FBOLD, 20)
            c.setFillColor(WHITE)
            c.drawCentredString(x + cw/2, h - 32, str(val))
            # Label
            c.setFont(FREG, 10)
            c.setFillColor(MUTED)
            c.drawCentredString(x + cw/2, 10, lbl)
        c.restoreState()


class AccentH2(Flowable):
    """H2 heading with left blue bar — registers PDF bookmark."""
    def __init__(self, text, width=None, key=None):
        super().__init__()
        self.text  = text
        self.width = width or TW
        self._h    = 32
        self._key  = key or text.lower().replace(' ', '_')

    def wrap(self, aw, ah):
        return (self.width, self._h)

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(BLUE)
        c.rect(0, 0, 3.5, self._h, fill=1, stroke=0)
        c.setFont(FBOLD, 18)
        c.setFillColor(WHITE)
        c.drawString(12, 8, self.text)
        c.bookmarkPage(self._key)
        c.restoreState()

    def getSpaceBefore(self):
        return 20

    def getSpaceAfter(self):
        return 10


class HRule(Flowable):
    """Subtle horizontal rule."""
    def __init__(self, width=None, color=BORDER, thickness=0.7):
        super().__init__()
        self.width     = width or TW
        self.color     = color
        self.thickness = thickness
        self._h        = 14

    def wrap(self, aw, ah):
        return (self.width, self._h)

    def draw(self):
        c = self.canv
        c.saveState()
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        c.line(0, self._h/2, self.width, self._h/2)
        c.restoreState()


class CodeBlock(Flowable):
    """Terminal-style code block with title bar and syntax tinting."""
    LINE_H   = 16
    TITLE_H  = 26
    PAD_V    = 10
    PAD_H    = 12

    def __init__(self, title, lines, width=None, lang='shell'):
        super().__init__()
        self.title  = title
        self.lines  = lines
        self.lang   = lang
        self.width  = width or TW
        self._h     = self.TITLE_H + self.PAD_V + len(lines) * self.LINE_H + self.PAD_V

    def wrap(self, aw, ah):
        return (self.width, self._h)

    def draw(self):
        c  = self.canv
        w  = self.width
        h  = self._h
        ph = self.PAD_H
        c.saveState()
        # Outer card
        c.setFillColor(HexColor('#111318'))
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.7)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=1)
        # Title bar
        c.setFillColor(CARD2)
        c.rect(0, h - self.TITLE_H, w, self.TITLE_H, fill=1, stroke=0)
        c.roundRect(0, h - self.TITLE_H, w, self.TITLE_H, 6, fill=1, stroke=0)
        c.rect(0, h - self.TITLE_H, w, self.TITLE_H / 2, fill=1, stroke=0)
        # Title text
        c.setFont(FBOLD, 9)
        c.setFillColor(MUTED)
        c.drawString(ph, h - self.TITLE_H + 9, self.title)
        # Terminal dots
        dot_y = h - self.TITLE_H / 2 - 1
        for i, col in enumerate([RED, AMBER, GREEN]):
            c.setFillColor(col)
            c.circle(w - 14 - i * 14, dot_y, 4, fill=1, stroke=0)
        # Code lines
        y = h - self.TITLE_H - self.PAD_V - 11
        for raw in self.lines:
            # Truncate to ~78 chars at 10pt Courier
            line = raw[:82] + ('…' if len(raw) > 82 else '')
            c.setFont(FMONO, 10)
            stripped = line.lstrip()
            if stripped.startswith('#') or stripped.startswith('--') or stripped.startswith('//'):
                c.setFillColor(DIM)
            elif stripped.startswith('$') or stripped.startswith('>'):
                c.setFillColor(GREEN)
                line = line  # keep the $ for shell prompts
            elif stripped.startswith('"') or stripped.startswith("'"):
                c.setFillColor(AMBER)
            elif any(stripped.startswith(k) for k in ('SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','FROM','WHERE','GROUP')):
                c.setFillColor(BLUE)
            else:
                c.setFillColor(WHITE)
            c.drawString(ph, y, line)
            y -= self.LINE_H
        c.restoreState()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CONTENT HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def P(text, style='body'):
    return Paragraph(text, S[style])

def sp(n=12):
    return Spacer(1, n)

def H1(text):
    return [AccentH2(text, key=text.lower().replace(' ', '_')), sp(4)]

def H2(text):
    return AccentH2(text, key=text.lower().replace(' ', '_'))

def H2_NP(text):
    """H2 heading preceded by a page break — use for major section starts."""
    return [PageBreak(), AccentH2(text, key=text.lower().replace(' ', '_'))]

def H3(text):
    return Paragraph(text, S['h3'])

def H4(text):
    return Paragraph(text, S['h4'])

def B(text, style='bullet'):
    return Paragraph(f'\u2022\u2002{text}', S[style])

def B2(text):
    return Paragraph(f'\u2013\u2002{text}', S['bullet_sm'])

def fig(filename, caption, width=None):
    """Return a ScreenshotCard from the docs/screenshots/ directory."""
    return ScreenshotCard(filename, caption, width=width)

def img(filename, caption, width=None):
    """Return a ScreenshotCard from the docs/images/ directory."""
    return ScreenshotCard(os.path.join(IMGS, filename), caption, width=width)

def step(num, title, body):
    return [StepBox(num, title, body), sp(10)]

def callout(label, items, kind='blue'):
    return [CalloutBox(label, items, kind=kind), sp(14)]

def cb(title, lines, lang='shell'):
    """Return a [CodeBlock, spacer] pair."""
    return [CodeBlock(title, lines, lang=lang), sp(14)]

def table(rows, col_widths=None, header=True):
    """Build a styled dark table."""
    n_cols  = len(rows[0])
    if col_widths is None:
        col_widths = [TW / n_cols] * n_cols
    # Convert strings to Paragraphs
    data = []
    for r_idx, row in enumerate(rows):
        data_row = []
        for cell in row:
            if isinstance(cell, str):
                sty = 'th' if (r_idx == 0 and header) else 'td'
                data_row.append(Paragraph(cell, S[sty]))
            else:
                data_row.append(cell)
        data.append(data_row)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0 if header else -1), CARD2 if header else CARD),
        ('BACKGROUND', (0, 1), (-1, -1), CARD),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [CARD, HexColor('#1A1C24')]),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    if header:
        style += [
            ('LINEBELOW', (0, 0), (-1, 0), 1.2, BLUE),
        ]
    return Table(data, colWidths=col_widths, style=TableStyle(style))

def two_col(left_items, right_items, left_w=None, gap=12):
    """Two-column layout via a Table."""
    lw = left_w or (TW * 0.55)
    rw = TW - lw - gap
    from reportlab.platypus import ListFlowable
    def wrap_items(items):
        from io import StringIO
        from reportlab.platypus import CondPageBreak
        result = []
        for item in items:
            if isinstance(item, str):
                result.append(Paragraph(item, S['body']))
            else:
                result.append(item)
        return result
    data = [[wrap_items(left_items), wrap_items(right_items)]]
    ts   = TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING',    (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING',   (0,0), (-1,-1), 0),
        ('RIGHTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING',  (0,0), (0,-1), gap),
    ])
    return Table(data, colWidths=[lw, rw], style=ts)

def cover(doc_num, title, subtitle, accent=BLUE):
    return [
        NextPageTemplate('cover'),
        DocCover(doc_num, title, subtitle, accent=accent),
        NextPageTemplate('body'),
        PageBreak(),
    ]

def section_divider(num, title, description=''):
    return [
        NextPageTemplate('cover'),
        SectionDivider(num, title, description),
        NextPageTemplate('body'),
        PageBreak(),
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 01 — PRODUCT OVERVIEW
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_product_overview():
    s = cover(1, 'Product Overview', 'What NGW is, what it does, and who it\'s built for.')
    s += [
        H2('What is No Guesswork Lighting?'), sp(6),
        P('No Guesswork Lighting (NGW) is a deterministic lighting recommendation engine. '
          'Upload any reference photo — portrait, editorial, product — and NGW instantly '
          'analyzes its lighting, matches it against 30+ canonical patterns, and delivers '
          'a precise setup guide tailored to your gear.'),
        sp(4),
        P('There is no guessing. No forum searching. No trial-and-error. You get exact '
          'positions, distances, angles, modifier choices, and power settings — all derived '
          'from the image itself.'),
        sp(14),
        img('welcome-dark.png', 'NGW — Welcome screen, dark theme'),
        sp(14),
        img('welcome-light.png', 'NGW — Welcome screen, light theme'),
        sp(16),
        fig('00_home.png', 'NGW Home — three entry points: Analyze, Shoot Mode, My Kit'),
        sp(20),

        H2('Core Capabilities'), sp(6),
        KeepTogether([
            B('Reference Photo Analysis — Upload any reference image; NGW identifies the lighting pattern, modifiers, and geometry.'),
            B('Pattern Matching — Compares against 30+ patterns: clamshell, loop, Rembrandt, butterfly, Caravaggio, and more.'),
            B('Gear-Aware Recommendations — Filters suggestions through your actual equipment across 5 flexibility tiers.'),
            B('Shoot Mode — Converts a recommendation into step-by-step on-set instructions for photographers and assistants.'),
            B('Recipes — 13 pre-built master lighting setups as learning references and starting points.'),
            B('NGW Lab — Developer tools for curating gold-set test images and reviewing engine improvement candidates.'),
            B('Signal System — Tracks real user outcomes to power continuous, safety-gated learning.'),
        ]),
        sp(20),

        H2('Who It\'s For'), sp(6),
        table([
            ['Audience',      'Primary Use Case',                'Key Benefit'],
            ['Photographers', 'Replicate reference lighting',    'Save hours of setup time on location'],
            ['Assistants',    'Execute lighting instructions',   'Clear, role-specific step guidance'],
            ['Studios',       'Maintain consistent look & feel', 'Repeatable gear configurations'],
            ['Educators',     'Teach lighting principles',       'Named patterns + visual examples'],
            ['Retouchers',    'Understand source lighting',      'Pattern detection from final images'],
        ], col_widths=[TW*0.28, TW*0.40, TW*0.32]),
        sp(20),

        H2('Technical Highlights'), sp(6),
        KeepTogether([
            B('Vision-Powered — Multi-layer analysis pipeline combining image processing and VLM interpretation.'),
            B('Deterministic Output — Same reference image always produces the same recommendation baseline.'),
            B('Consensus Solver — Multiple analysis passes are merged through a weighted consensus algorithm.'),
            B('5-Tier Gear Matching — From exact-match gear to ambient-only fallback, always a useful output.'),
            B('Signal Hygiene — Live, seeded, internal, and expert signals are tracked and filtered separately.'),
            B('Auto-Candidate Generation — Failure clusters automatically surface as reviewable improvement proposals.'),
        ]),
        sp(16),
        callout('Note', [
            'NGW recommendations are deterministic by design. The system does not randomly vary output. '
            'Variation comes only from changes to your kit, the reference image, or engine updates.',
        ], kind='blue')[0],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 02 — USER GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_user_guide():
    s = cover(2, 'User Guide', 'Screen-by-screen guide to every feature in NGW.')
    s += [
        H2('Application Overview'), sp(6),
        P('NGW is organized around three primary workflows: Analyze, Shoot Mode, and My Kit. '
          'Access each from the Home screen. Settings and the NGW Lab are available via the '
          'navigation bar at all times.'),
        sp(14),
        fig('00_home.png', 'Home Screen — Analyze, Shoot Mode, and My Kit entry points'),
        sp(18),

        H2('Home Screen'), sp(4),
        KeepTogether([
            H4('Entry Points'),
            B('Analyze — Upload a reference photo and receive an immediate lighting recommendation.'),
            B('Shoot Mode — Convert a recommendation into a step-by-step on-set workflow.'),
            B('My Kit — Manage the equipment list that constrains every recommendation.'),
        ]),
        sp(6),
        KeepTogether([
            H4('Navigation Bar'),
            B('Home — Return to the main entry screen.'),
            B('Recipes — Browse 13 master lighting recipes as learning references.'),
            B('Settings — Configure units, notifications, and account preferences.'),
            B('NGW Lab — Developer tools (restricted — see Lab Guide).'),
        ]),
        sp(20),

        *H2_NP('Settings'), sp(6),
        P('Settings controls system-wide preferences and account details. Changes take effect '
          'immediately — no restart required.'),
        sp(12),
        fig('07_settings.png', 'Settings Screen — units, notifications, account, and lab access'),
        sp(14),
        fig('07b_settings_lab.png', 'Settings — Lab access toggle (restricted to allowlisted emails)'),
        sp(14),
        fig('07c_settings_devtools.png', 'Settings — Developer tools panel with debug options'),
        sp(16),
        KeepTogether([
            H4('Configurable Options'),
            B('Distance Units — Switch between feet and meters for all positional guidance.'),
            B('Ceiling Height Default — Set your studio\'s ceiling height; Shoot Mode warns when lights exceed it.'),
            B('Room Dimensions — Pre-set your shooting space for proximity and wall-bounce guidance.'),
            B('Notification Preferences — Control when NGW sends analysis-complete and outcome reminders.'),
            B('Developer Tools — Enable the NGW Lab (restricted to approved team members).'),
        ]),
        sp(20),

        *H2_NP('How To: Change Your Distance Units'), sp(6),
        P('NGW supports both feet and metric units. All positional guidance in Shoot Mode '
          'and recommendations updates instantly when you change the setting.'),
        sp(6),
        *[item for i, (t, b) in enumerate([
            ('Open Settings', 'Tap the gear icon in the navigation bar from any screen.'),
            ('Find Distance Units', 'Scroll to the "Units & Measurements" section.'),
            ('Select your unit', 'Toggle between Feet and Meters. The label updates live.'),
            ('Return to Analyze', 'All distances in the current recommendation re-render immediately.'),
        ], start=1) for item in step(i, t, b)],
        sp(12),

        *H2_NP('How To: Set Up Your Studio Space'), sp(6),
        P('Entering your room dimensions lets Shoot Mode flag when a light position is too '
          'close to a wall, or when a boom arm would exceed your ceiling height.'),
        sp(6),
        *[item for i, (t, b) in enumerate([
            ('Open Settings', 'Tap the gear icon in the navigation bar.'),
            ('Enter Ceiling Height', 'Type your ceiling height in feet or meters. Include any drop from beams.'),
            ('Enter Room Dimensions', 'Width and depth in your preferred units. Approximate is fine.'),
            ('Save', 'Tap outside the field or hit Done on the keyboard. Settings persist across sessions.'),
        ], start=1) for item in step(i, t, b)],
        sp(12),
        callout('Why This Matters', [
            'Without room dimensions, Shoot Mode cannot warn you about wall-proximity bounce, '
            'ceiling clearance, or spill risk from nearby reflective surfaces. '
            'Takes 30 seconds and significantly improves instruction accuracy.',
        ], kind='blue')[0],
        sp(20),

        *H2_NP('Running Your First Analysis'), sp(4),
        *[item for i, (t, b) in enumerate([
            ('Open the Analyze screen', 'Tap "Analyze" from the Home screen.'),
            ('Upload a reference image', 'Choose a photo with clear subject lighting. Portraits work best; avoid heavy post-processing.'),
            ('Set your scene context', 'Specify subject type (portrait / product), environment (studio / outdoor), and any constraints.'),
            ('Review the recommendation', 'NGW returns the detected pattern, confidence score, modifier list, and gear setup.'),
            ('Launch Shoot Mode', 'Tap "Start Shoot Mode" to convert the recommendation into on-set steps.'),
        ], start=1) for item in step(i, t, b)],
        sp(12),
        callout('Pro Tip', [
            'For best results, use a reference photo with a single subject against a neutral background. '
            'Heavy color grading or composite backgrounds reduce detection confidence.',
        ], kind='green')[0],
        sp(16),

        *H2_NP('Reading a Recommendation'), sp(6),
        table([
            ['Field',           'What It Means',                                    'Example'],
            ['Pattern',         'Named lighting configuration detected',             'Loop — Key 45° off-axis, slight elevation'],
            ['Confidence',      'Engine certainty (0–100)',                          '87%'],
            ['Key Light',       'Primary source: type, position, modifier',          'Godox AD600 · 45°R · 6 ft · Octa 90cm'],
            ['Fill Light',      'Secondary source or reflector',                     'V-flat reflector · camera-left'],
            ['Modifiers',       'Shaping tools detected',                            'Diffusion sock · grid'],
            ['Power',           'Estimated flash stop relative to key',              'Key: f/8 · Fill: –2 stops'],
            ['Gear Tier',       'Flexibility applied to your kit',                   'Tier 2 — Close substitute'],
        ], col_widths=[TW*0.22, TW*0.46, TW*0.32]),
        sp(20),

        *H2_NP('How To: Use a Master Mode'), sp(6),
        P('Master Mode lets you bias recommendations toward the aesthetic of a specific '
          'photographer — adjusting contrast ratios, modifier softness, and tonal guidance '
          'to match a signature look.'),
        sp(12),
        img('wizard-master-mode.png', 'Wizard — Master Mode selection screen'),
        sp(16),
        *[item for i, (t, b) in enumerate([
            ('Start an analysis', 'Upload a reference image from the Analyze screen.'),
            ('Open Master Mode', 'After the initial result appears, tap the "Master Mode" option.'),
            ('Select a photographer', 'Choose from Avedon, Penn, Lindbergh, LaChapelle, and others.'),
            ('Review adjusted output', 'The recommendation re-renders with the selected master\'s aesthetic biases applied.'),
            ('Toggle off', 'Tap "None" to return to the unbiased recommendation at any time.'),
        ], start=1) for item in step(i, t, b)],
        sp(14),
        callout('What Changes', [
            'Contrast ratio target shifts to match the master\'s signature fill ratio.',
            'Modifier softness guidance adjusts — Penn favors harder sources; Avedon softer.',
            'Copy in the recommendation reflects the visual philosophy of the selected master.',
        ], kind='blue')[0],
        sp(20),

        *H2_NP('How To: Set Subject and Mood'), sp(6),
        P('NGW adjusts recommendations based on subject type and mood context. '
          'Setting these before analysis improves pattern confidence and modifier selection.'),
        sp(12),
        img('wizard-subject.png', 'Wizard — Subject type selection'),
        sp(14),
        img('wizard-mood.png', 'Wizard — Mood and tone selection'),
        sp(16),
        KeepTogether([
            H4('Subject Types'),
            B('Portrait — Individual subject, face-priority analysis.'),
            B('Editorial — Fashion or lifestyle; full-body and environment considered.'),
            B('Product — Still life; specular and reflection signature prioritized.'),
            B('Group — Multiple subjects; pattern limited to wrap-friendly setups.'),
        ]),
        sp(10),
        KeepTogether([
            H4('Mood Presets'),
            B('Natural — Prioritizes believable, soft, directional light.'),
            B('Dramatic — High contrast, low fill ratio, deep shadows.'),
            B('Commercial — Clean, on-axis, even, highly controlled.'),
            B('Editorial — Edgy, cross-light, mixed source temperature acceptable.'),
        ]),
        sp(20),

        *H2_NP('How To: Enable NGW Lab Access'), sp(6),
        P('The NGW Lab is restricted to approved team members. Access requires both '
          'a Studio plan and an email on the allowlist configured in the backend environment.'),
        sp(12),
        img('welcome-lab-enabled.png', 'Home screen with NGW Lab tab visible'),
        sp(16),
        *[item for i, (t, b) in enumerate([
            ('Confirm eligibility', 'Your email must be in LAB_ALLOWED_EMAILS on the backend. Contact your team admin.'),
            ('Open Settings', 'Tap the gear icon in the navigation bar.'),
            ('Enable Developer Tools', 'Scroll to the bottom. Toggle "Developer Tools" on.'),
            ('Enter your lab email', 'Type the email registered in the allowlist.'),
            ('Lab tab appears', 'The NGW Lab tab appears in the navigation bar immediately.'),
        ], start=1) for item in step(i, t, b)],
        sp(14),
        callout('Troubleshooting Lab Access', [
            'If the Lab tab does not appear after enabling Developer Tools, your email is '
            'not in the allowlist. Ask your backend admin to add it to LAB_ALLOWED_EMAILS '
            'in the server environment variables and restart the backend.',
        ], kind='amber')[0],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 03 — SHOOT MODE GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_shoot_mode():
    s = cover(3, 'Shoot Mode Guide', 'Your on-set playbook — step-by-step lighting execution.', accent=BLUE)
    s += [
        H2('What is Shoot Mode?'), sp(6),
        P('Shoot Mode transforms an NGW recommendation into an ordered, role-aware list of '
          'on-set instructions. Instead of reading a gear list and figuring out placement '
          'yourself, Shoot Mode tells you exactly where to stand each light, at what height, '
          'what angle, and what power — and then walks you through your first test exposure.'),
        sp(4),
        KeepTogether([
            H4('Three Role Views'),
            B('Photographer — Full sequence: camera setup → light placement → test exposure → adjustments.'),
            B('Assistant — Light-placement steps only. No camera settings.'),
            B('Second Shooter — Camera setup and test exposure only. No light placement.'),
        ]),
        sp(16),

        H2('Pre-Shoot Setup'), sp(6),
        P('Before launching Shoot Mode, confirm these inputs are correct. Errors here propagate '
          'through every step.'),
        sp(8),
        callout('Required Before Launch', [
            'My Kit is up to date — add any new gear; remove anything unavailable today.',
            'Ceiling height is set in Settings — Shoot Mode warns if a light position exceeds it.',
            'Room dimensions are entered — enables wall-proximity and bounce guidance.',
            'Reference analysis is complete — Shoot Mode requires an active recommendation.',
        ], kind='amber')[0],
        sp(14),
        KeepTogether([
            H4('Optional Inputs'),
            B('Master Mode — Select a photographer reference (e.g., Avedon, Penn, Lindbergh) to bias tone suggestions.'),
            B('Session Label — Name the session for future reference and outcome tracking.'),
            B('Estimated Duration — Helps NGW weight urgency in step ordering.'),
        ]),
        sp(20),

        *H2_NP('The Shoot Mode Workflow'), sp(4),
        *[item for i, (t, b) in enumerate([
            ('Camera Setup',       'NGW gives aperture, ISO, shutter speed starting points matched to the pattern.'),
            ('Place Key Light',    'Position the primary source at exact angle, height, and distance. Wall-proximity notes included.'),
            ('Place Fill Light',   'Add fill or reflector. Shoot Mode specifies camera-side placement and fill ratio.'),
            ('Add Accent Lights',  'Background, hair, rim, and kicker lights added in order of priority.'),
            ('Set Power Levels',   'Starting power suggestions for each source, referenced to f/8 at key.'),
            ('Take a Test Shot',   'Checklist of what to look for: catch-lights, shadow direction, fill ratio on the face.'),
            ('Evaluate & Adjust',  'NGW compares your test shot result against the pattern and suggests corrections.'),
        ], start=1) for item in step(i, t, b)],
        sp(12),

        *H2_NP('Step Detail — Light Placement'), sp(6),
        P('Each light-placement step includes all measurements in your preferred unit system. '
          'Distance is given in feet, meters, arm-lengths, and walking steps simultaneously '
          'for fieldwork without a tape measure.'),
        sp(8),
        table([
            ['Field',           'Example Value',                'Usage'],
            ['Angle',           '45° camera-right',             'Stand in front of subject; count 45° off-center'],
            ['Height',          '7.5 ft (arms + 1 step up)',    'Top of stand; flag if above ceiling'],
            ['Distance',        '6 ft / 1.8 m / ~4 steps',      'Subject to light source front element'],
            ['Wall proximity',  '3.2 ft from left wall',        'Bounce and spill warning zone'],
            ['Modifier',        'Octa 90cm + diffusion sock',   'Attach before powering on'],
            ['Power hint',      'Start at 1/4 power (~f/8)',    'Full-stop guide only — meter to confirm'],
        ], col_widths=[TW*0.22, TW*0.38, TW*0.40]),
        sp(16),

        *H2_NP('Test Shot Evaluation'), sp(6),
        P('After your test shot, NGW can analyze the image and compare it to the target pattern. '
          'Upload the test shot via the evaluate button in Shoot Mode.'),
        sp(8),
        KeepTogether([
            H4('What NGW Checks'),
            B('Catch-light position — matches expected angle for the pattern.'),
            B('Shadow direction — loop vs. Rembrandt vs. butterfly shadow fall.'),
            B('Fill ratio — side of face in shadow vs. fill, compared to target.'),
            B('Background separation — key vs. background ratio estimate.'),
            B('Specular highlights — modifier signature matches (harsh vs. soft).'),
        ]),
        sp(12),
        callout('Field Note', [
            'If your ceiling is below 9 ft, Shoot Mode will warn on any step that requires '
            'a boom arm above ceiling height. It will automatically suggest floor-level or '
            'camera-mounted alternatives.',
        ], kind='blue')[0],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 04 — RECIPES GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_recipes():
    s = cover(4, 'Recipes Guide', 'Thirteen master lighting setups, pre-built and ready to shoot.')
    s += [
        H2('What Are Recipes?'), sp(6),
        P('Recipes are 13 pre-built lighting setups curated by master photographers. Each recipe '
          'packages a named lighting pattern with specific modifier choices, gear requirements, '
          'and a philosophy statement explaining why the setup works.'),
        sp(4),
        P('Recipes are not user-editable templates. They are reference setups — learning tools '
          'that show how canonical lighting patterns translate to real gear decisions. They also '
          'serve as priors for the recommendation engine.'),
        sp(16),
        callout('Key Distinction', [
            'Recipes are read-only reference material. Use them to learn patterns, not to '
            'replace custom analysis. For your specific reference image, always run Analyze first.',
        ], kind='blue')[0],
        sp(14),

        H2('The 13 Master Recipes'), sp(4),
        table([
            ['Recipe Name',                'Pattern',              'Difficulty', 'Gear Flex'],
            ['Beauty Clamshell',           'Clamshell',            'Medium',     '2/5'],
            ['Dramatic Rembrandt',         'Rembrandt',            'Hard',       '3/5'],
            ['Clean Corporate Headshot',   'Loop',                 'Easy',       '4/5'],
            ['Editorial Hard Light',       'Hard Direct',          'Medium',     '3/5'],
            ['Natural Window Light Look',  'Window / Soft Ambient','Easy',       '5/5'],
            ['High Key Product',           'Flat High Key',        'Medium',     '3/5'],
            ['Low Key Moody',              'Split / Rembrandt',    'Hard',       '3/5'],
            ['Butterfly / Paramount',      'Butterfly',            'Medium',     '3/5'],
            ['Caravaggio Chiaroscuro',     'Single Hard Source',   'Expert',     '2/5'],
            ['Vermeer Window',             'Directional Soft',     'Medium',     '4/5'],
            ['Avedon High-Key',            'Flat Shadowless',      'Hard',       '2/5'],
            ['Penn Precision Beauty',      'Modified Clamshell',   'Expert',     '2/5'],
            ['Heisler Adaptive Rembrandt', 'Rembrandt + Fill',     'Hard',       '3/5'],
        ], col_widths=[TW*0.36, TW*0.27, TW*0.18, TW*0.19]),
        sp(18),

        H2('Recipe Detail — Beauty Clamshell'), sp(6),
        P('The Beauty Clamshell is the canonical beauty portrait setup: a large soft source '
          'directly above camera axis, a reflector or second source directly below, creating '
          'symmetric shadow fill and a distinctive double catch-light.'),
        sp(10),
        table([
            ['Field',          'Value'],
            ['Pattern',        'Clamshell'],
            ['Key Light',      'Large octa or beauty dish above camera axis — 12–18 inches above lens level'],
            ['Fill',           'White reflector or strip box below lens — fills under chin and cheekbone shadows'],
            ['Modifiers',      'Beauty dish + diffusion sock OR 100cm octa; fill V-flat at 45°'],
            ['Power Ratio',    'Key: base exposure · Fill: –1 to –1.5 stops'],
            ['Gear Flex',      '2/5 — requires specific modifier; reflector substitute loses symmetry'],
            ['Use Case',       'Beauty, cosmetics, clean portraiture'],
            ['Why It Works',   'Eliminates under-eye shadows; maximizes catch-light size; flatters most faces'],
        ], col_widths=[TW*0.28, TW*0.72], header=True),
        sp(16),

        H2('How to Use Recipes'), sp(4),
        *[item for i, (t, b) in enumerate([
            ('Browse Recipes', 'Navigate to Recipes in the nav bar. Filter by pattern, difficulty, or gear flexibility.'),
            ('Study the Setup', 'Read the pattern, modifiers, and "Why It Works" for lighting education.'),
            ('Run a Matching Analysis', 'Upload a reference photo inspired by the recipe; NGW confirms how closely it matches.'),
            ('Shoot Mode from Recipe', 'Launch Shoot Mode with a recipe as your target setup instead of an analyzed photo.'),
        ], start=1) for item in step(i, t, b)],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 05 — BUILD FROM SCRATCH
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_build_from_scratch():
    s = cover(5, 'Build From Scratch Guide', 'Create a custom setup from zero — no reference photo required.')
    s += [
        H2('When to Build From Scratch'), sp(6),
        P('Use Build From Scratch when you have no reference image but know your target. '
          'You specify the pattern, subject type, environment, and gear constraints directly '
          'and NGW generates a full setup recommendation as if it had analyzed a reference.'),
        sp(12),
        KeepTogether([
            H4('Common Use Cases'),
            B('Teaching a named pattern without a reference photo.'),
            B('Reproducing a setup you remember but don\'t have documented.'),
            B('Testing how NGW handles your kit against a specific pattern.'),
            B('Pre-planning a shoot based on a style brief, not a specific image.'),
        ]),
        sp(18),

        H2('Step-by-Step Build Process'), sp(4),
        *[item for i, (t, b) in enumerate([
            ('Choose a Pattern', 'Select from 30+ canonical patterns: loop, Rembrandt, clamshell, butterfly, split, hard, high-key, low-key, and more.'),
            ('Set Subject Type', 'Specify portrait, headshot, product, editorial, or architectural. Affects modifier and distance suggestions.'),
            ('Set Environment', 'Studio with controlled ceiling height, outdoor ambient, or hybrid. Affects power and fill recommendations.'),
            ('Confirm Your Kit', 'NGW reads from My Kit automatically. Override specific items for this session only.'),
            ('Set Constraints', 'Ceiling height, room width, power availability (battery vs. AC). All optional but improve output.'),
            ('Generate Setup', 'NGW produces a full recommendation: lights, positions, modifiers, power, and checklist.'),
            ('Launch Shoot Mode', 'Convert the generated setup directly into on-set steps.'),
        ], start=1) for item in step(i, t, b)],
        sp(14),

        H2('Pattern Reference'), sp(4),
        table([
            ['Pattern',     'Shadow Direction',    'Key Position',        'Ideal Subject'],
            ['Loop',        'Short loop under nose','45° off-axis, high', 'Most portraits'],
            ['Rembrandt',   'Triangle cheek shadow','45°+ off-axis',      'Dramatic / editorial'],
            ['Clamshell',   'Near-none (symmetric)', 'On-axis, above',    'Beauty / cosmetics'],
            ['Butterfly',   'Butterfly nose shadow', 'On-axis, very high','Glamour / beauty'],
            ['Split',       'Half-face shadow',     '90° side',           'High drama'],
            ['Broad',       'Away from camera',     '45°, broad side',    'Slimming portraits'],
            ['Short',       'Toward camera',        '45°, short side',    'Full-face emphasis'],
            ['Hard Direct', 'Full frontal harsh',   'On-axis, flat',      'Editorial / fashion'],
        ], col_widths=[TW*0.20, TW*0.26, TW*0.26, TW*0.28]),
        sp(16),
        callout('Important', [
            'Build From Scratch outputs are based on canonical pattern definitions, not image analysis. '
            'Confidence will read as "Blueprint" rather than a percentage. Always run a test shot to '
            'validate against your actual environment.',
        ], kind='amber')[0],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 06 — MY KIT GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_my_kit():
    s = cover(6, 'My Kit Guide', 'Manage your equipment so every recommendation fits what you own.')
    s += [
        H2('Why My Kit Matters'), sp(6),
        P('My Kit is the equipment registry that constrains every NGW recommendation. '
          'If a recommendation includes gear you don\'t own, the engine automatically '
          'substitutes from your kit through a 5-tier matching system. The more accurate '
          'your kit, the more useful every recommendation.'),
        sp(14),
        callout('Rule of Thumb', [
            'Update My Kit before every shoot. If you\'re renting gear for a session, '
            'add it to your kit temporarily and remove it after. NGW always recommends '
            'from current kit state.',
        ], kind='blue')[0],
        sp(16),

        H2('Kit Categories'), sp(4),
        table([
            ['Category',    'Examples',                                     'Notes'],
            ['Flash',       'Godox AD600, Profoto B10, Speedlight',         'Include mount and power range'],
            ['Continuous',  'LED panel, SL-60W, HMI',                      'Include lumen output if known'],
            ['Modifiers',   'Octa 90cm, beauty dish, strip box, umbrella',  'Include size and brand'],
            ['Accessories', 'V-flat, reflector, gobo, grid, snoot',         'Mark if available at location'],
            ['Camera',      'Body + lens focal length range',               'Affects angle-of-view guidance'],
            ['Room',        'Ceiling height, room width, power access',     'Per-location; update per shoot'],
        ], col_widths=[TW*0.20, TW*0.44, TW*0.36]),
        sp(18),

        H2('The 5 Gear Flexibility Tiers'), sp(6),
        P('When exact gear is unavailable, NGW cascades through 5 tiers, always '
          'choosing the highest-fidelity option available in your kit.'),
        sp(10),
        KeepTogether([
            Paragraph('Tier 1 — Exact Match', S['h4']),
            P('The exact gear specified in the recommendation is in your kit. No substitution. '
              'Highest output confidence.'),
        ]),
        sp(6),
        KeepTogether([
            Paragraph('Tier 2 — Close Modifier Substitute', S['h4']),
            P('Compatible modifier with similar shaping characteristics (e.g., octa 120 instead of 90). '
              'Minor adjustments noted in the step guidance.'),
        ]),
        sp(6),
        KeepTogether([
            Paragraph('Tier 3 — Alternative Light Source', S['h4']),
            P('Different light type with equivalent output (e.g., continuous LED if no flash available). '
              'Power and exposure notes are adjusted.'),
        ]),
        sp(6),
        KeepTogether([
            Paragraph('Tier 4 — Improvised / DIY', S['h4']),
            P('Uses available surfaces as reflectors, flags, or diffusion (foam core, white wall, curtain). '
              'Marked as improvised in the output; confidence drops by ~20%.'),
        ]),
        sp(6),
        KeepTogether([
            Paragraph('Tier 5 — Ambient Only', S['h4']),
            P('No controllable lighting in kit or at location. NGW recommends ambient-light strategies: '
              'window placement, time of day, reflector positioning. Always a fallback, never a first choice.'),
        ]),
        sp(16),
        callout('Gear Flexibility Score', [
            'Each Recipe shows a Gear Flexibility score (1–5). Score 5 means "any gear works." '
            'Score 1 means "specific modifier required." Use this to pre-filter recipes '
            'that will work with your current kit.',
        ], kind='green')[0],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 07 — QUICK START (single page)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_quick_start():
    s = cover(7, 'Quick Start', 'On your feet in five steps.')
    s += [
        sp(8),
        Paragraph('Get from zero to a complete on-set lighting plan in under 3 minutes.', S['body_muted']),
        sp(20),
        *[item for i, (t, b) in enumerate([
            ('Add Your Gear',          'Open My Kit → add every light, modifier, and accessory you have today.'),
            ('Confirm Your Space',     'In Settings → enter ceiling height and room dimensions. Takes 30 seconds.'),
            ('Upload a Reference',     'Tap Analyze → upload a photo with the lighting you want to replicate.'),
            ('Review the Result',      'Read the detected pattern, confidence score, and gear setup. Adjust as needed.'),
            ('Execute in Shoot Mode',  'Tap "Start Shoot Mode" → follow steps in order. Check off each as you go.'),
        ], start=1) for item in step(i, t, b)],
        sp(22),
        HRule(color=BLUE, thickness=1.5),
        sp(12),
        MetricRow([
            ('<3 min',  'From launch to setup plan',    BLUE),
            ('30+',     'Lighting patterns in library', GREEN),
            ('5 tiers', 'Gear flexibility matching',    AMBER),
            ('100%',    'Deterministic output',         BLUE),
        ]),
        sp(20),
        callout('Pro Tip', [
            'Bookmark the Recipes section to study patterns before your shoot. '
            'Knowing your target pattern by name makes analysis results immediately actionable.',
            'Use the "Evaluate Test Shot" feature in Shoot Mode to get instant feedback '
            'on how closely your first frame matches the target.',
        ], kind='green')[0],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 08 — ON-SET QUICK REFERENCE (printable)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_quick_reference():
    s = cover(8, 'On-Set Quick Reference', 'Printable field card — patterns, positions, and checks.')
    s += [
        H2('Pattern Quick Reference'), sp(6),
        table([
            ['Pattern',     'Key Height',       'Key Angle',   'Fill',         'Best For'],
            ['Loop',        'Above eye level',  '30–45°',      '–1.5 stops',   'All-purpose portraits'],
            ['Rembrandt',   'High, angled',     '45°+',        'Minimal',      'Drama, editorial'],
            ['Clamshell',   'On-axis above',    '0°',          'Below-axis',   'Beauty, fashion'],
            ['Butterfly',   'Very high',        '0°',          'Reflector',    'Glamour, beauty'],
            ['Split',       'Eye level',        '90°',         'None/minimal', 'High contrast'],
            ['Broad',       'Above eye',        '45° broad',   '–2 stops',     'Slimming'],
            ['Short',       'Above eye',        '45° short',   '–1 stop',      'Full-face width'],
            ['Hard Direct', 'On-axis, flat',    '0°',          'White card',   'Fashion, editorial'],
        ], col_widths=[TW*0.18, TW*0.18, TW*0.16, TW*0.18, TW*0.30]),
        sp(16),

        H2('Pre-Shoot Checklist'), sp(6),
        two_col([
            H4('Kit & Space'),
            B('My Kit updated for today\'s gear', 'qr_item'),
            B('Ceiling height in Settings', 'qr_item'),
            B('Room dimensions in Settings', 'qr_item'),
            B('Battery / power checked', 'qr_item'),
            sp(10),
            H4('Camera'),
            B('Reference aperture set', 'qr_item'),
            B('ISO at base (100–400)', 'qr_item'),
            B('Shutter at sync speed', 'qr_item'),
            B('Tethering connected (if used)', 'qr_item'),
        ], [
            H4('Lights'),
            B('All modifiers mounted', 'qr_item'),
            B('All stands at rough height', 'qr_item'),
            B('Power at starting values', 'qr_item'),
            B('Triggers paired', 'qr_item'),
            sp(10),
            H4('First Test Shot'),
            B('Shadow direction — correct?', 'qr_item'),
            B('Catch-light placement — correct?', 'qr_item'),
            B('Fill ratio — on target?', 'qr_item'),
            B('Background separation — correct?', 'qr_item'),
        ]),
        sp(16),

        H2('Power Ratio Reference'), sp(6),
        table([
            ['Ratio',   'Fill f-stop vs Key', 'Effect',                           'Pattern Examples'],
            ['1:1',     '0 stops',            'Flat, even fill',                  'High-key, product'],
            ['1:2',     '–1 stop',            'Subtle fill, soft shadow',         'Corporate headshot'],
            ['1:4',     '–2 stops',           'Defined shadow, natural look',     'Portrait, loop'],
            ['1:8',     '–3 stops',           'Strong shadow, dramatic fill',     'Rembrandt, low-key'],
            ['No fill', '–4 stops+',          'Hard shadow, minimum fill',        'Split, editorial'],
        ], col_widths=[TW*0.12, TW*0.22, TW*0.32, TW*0.34]),
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 09 — SYSTEM ARCHITECTURE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_architecture():
    s = cover(9, 'System Architecture', 'How NGW works — pipeline, schema, auth, and data flow.')
    s += [
        H2('Architecture Overview'), sp(6),
        P('NGW is a mobile-first web application backed by a Python/FastAPI service. '
          'The frontend is a React 18 SPA built with Tailwind CSS. The backend orchestrates '
          'a five-stage analysis pipeline that combines image processing, VLM inference, '
          'and a weighted consensus solver. All model calls flow through Vercel AI Gateway '
          'for cost tracking, failover, and OIDC-based authentication.'),
        sp(14),

        H2('Technology Stack'), sp(6),
        table([
            ['Layer',       'Technology',          'Version',  'Purpose'],
            ['Frontend',    'React',                '18',       'Mobile-first SPA'],
            ['Frontend',    'Tailwind CSS',          '3',        'Utility styling'],
            ['Frontend',    'Vite',                  '5',        'Build + HMR'],
            ['Backend',     'Python',                '3.11+',    'Runtime'],
            ['Backend',     'FastAPI',               '0.110+',   'REST API framework'],
            ['Backend',     'Uvicorn',               '0.28+',    'ASGI server'],
            ['Database',    'SQLite',                '3.x',      'Dev / embedded prod'],
            ['Database',    'PostgreSQL',            '15+',      'Prod (optional)'],
            ['AI',          'Vercel AI Gateway',     'current',  'VLM routing + auth'],
            ['AI',          'Vision LLM',            'routed',   'Image interpretation'],
            ['Deploy',      'Vercel',                'current',  'Frontend + serverless API'],
            ['Auth',        'OIDC / Bearer Token',   'JWT',      'API + Lab access control'],
        ], col_widths=[TW*0.15, TW*0.24, TW*0.13, TW*0.48]),
        sp(18),

        H2('Database Schema'), sp(6),
        P('Five primary tables. Schema lives in db/database.py and is created on first '
          'run via init_db(). Migrations are run with python3 scripts/run_migrations.py.'),
        sp(10),

        *cb('db/database.py — session_signals (core outcomes table)', [
            'CREATE TABLE session_signals (',
            '  id            TEXT PRIMARY KEY,   -- UUID v4',
            '  session_id    TEXT NOT NULL,',
            '  user_id       TEXT,',
            '  pattern       TEXT NOT NULL,      -- "loop", "rembrandt", "clamshell" …',
            '  outcome       TEXT NOT NULL,',
            '    -- CHECK IN (nailed_it, close, failed, unknown)',
            '  signal_source TEXT NOT NULL DEFAULT \'live\',',
            '    -- CHECK IN (live, seeded, internal, expert_review)',
            '  include_in_learning    BOOLEAN NOT NULL DEFAULT TRUE,',
            '  include_in_metrics     BOOLEAN NOT NULL DEFAULT TRUE,',
            '  include_in_conversion  BOOLEAN NOT NULL DEFAULT TRUE,',
            '  include_in_cohorts     BOOLEAN NOT NULL DEFAULT TRUE,',
            '  reliability_score      REAL,',
            '  region_scores          TEXT,  -- JSON {face,torso,bg,specular,shadow}',
            '  degradation_flags      TEXT,  -- JSON {bw,low_res,high_contrast,...}',
            '  gear_tier              INTEGER CHECK (gear_tier BETWEEN 1 AND 5),',
            '  environment            TEXT,  -- studio | outdoor | hybrid',
            '  created_at             DATETIME DEFAULT CURRENT_TIMESTAMP',
            ');',
        ], lang='sql'),

        *cb('db/database.py — gold_sets and candidates tables', [
            'CREATE TABLE gold_sets (',
            '  id              TEXT PRIMARY KEY,',
            '  image_path      TEXT NOT NULL,',
            '  pattern         TEXT NOT NULL,    -- curator-verified ground truth',
            '  setup_details   TEXT,             -- JSON: gear, positions, power',
            '  subject_type    TEXT,',
            '  environment     TEXT,',
            '  outcome_labels  TEXT,             -- JSON: expected engine output',
            '  status          TEXT DEFAULT \'draft\', -- draft|approved|archived',
            '  curator_email   TEXT NOT NULL,',
            '  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP',
            ');',
            '',
            'CREATE TABLE candidates (',
            '  id                        TEXT PRIMARY KEY,',
            '  title                     TEXT NOT NULL,',
            '  description               TEXT NOT NULL,',
            '  candidate_type            TEXT NOT NULL,',
            '  proposed_change           TEXT,  -- JSON',
            '  status TEXT DEFAULT \'proposed\',',
            '    -- proposed|under_review|approved|rejected|applied',
            '  estimated_success_lift    REAL,',
            '  estimated_regression_risk REAL,',
            '  source                    TEXT DEFAULT \'auto\', -- auto|manual',
            '  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP',
            ');',
        ], lang='sql'),
        sp(4),

        H2('Analysis Pipeline — 5 Stages'), sp(6),
        P('Every reference image runs through five sequential stages. Each stage is '
          'logged independently with timing and confidence. A stage may short-circuit '
          'at the early-exit threshold (confidence ≥ 0.94).'),
        sp(10),
        table([
            ['Stage',                    'Module',                          'Input',                        'Output'],
            ['1. Ingestion',             'api/routes/shoot_match.py',       'Raw image file',               'Normalized 1024px JPEG'],
            ['2. Region Extraction',     'engine/region_extractor.py',      'Normalized image',             'Bounding boxes + region scores'],
            ['3. VLM Interpretation',    'engine/vlm_adapter.py',           'Annotated regions (3 passes)', 'Pattern vocabulary dicts'],
            ['4. Consensus Solving',     'engine/solver.py',                'Three VLM output dicts',       'Resolved pattern + confidence'],
            ['5. Blueprint Generation',  'engine/blueprint_engine.py',      'Pattern + user kit',           'Gear setup + ordered steps'],
        ], col_widths=[TW*0.22, TW*0.28, TW*0.24, TW*0.26]),
        sp(18),

        *H2_NP('VLM Integration'), sp(6),
        P('The VLM adapter runs three passes per image with different prompt templates: '
          'pattern-focused, modifier-focused, and geometry-focused. This reduces '
          'single-pass bias. All three response dicts go to the consensus solver.'),
        sp(8),
        *cb('engine/vlm_adapter.py — call structure (simplified)', [
            '# All model calls route through Vercel AI Gateway automatically.',
            '# Set model via AI_MODEL_STRING env var; default: gateway-routed vision LLM.',
            'PASS_PROMPTS = [',
            '    PATTERN_SYSTEM_PROMPT,   # "What lighting pattern is this?"',
            '    MODIFIER_SYSTEM_PROMPT,  # "What modifiers and shaping tools are visible?"',
            '    GEOMETRY_SYSTEM_PROMPT,  # "Describe light positions and distances."',
            ']',
            '',
            'async def analyze(image_bytes, kit, model=AI_MODEL_STRING):',
            '    results = []',
            '    for prompt in PASS_PROMPTS:',
            '        r = await gateway.analyze_image(',
            '            image=image_bytes, system=prompt,',
            '            model=model, max_tokens=1024, temperature=0.2',
            '        )',
            '        results.append(parse_response(r))',
            '    return results  # List[Dict] — one per pass',
        ], lang='python'),

        *cb('engine/solver.py — weighted consensus (simplified)', [
            '# Pass weights: pass 0 = 1.0, pass 1 = 1.05, pass 2 = 1.10',
            '# Later passes get slight boost (more context in prompt chain).',
            'CONSENSUS_ATTRS = [',
            '    "pattern_name", "key_angle", "key_height",',
            '    "fill_type",    "modifier",  "fill_ratio",',
            ']',
            '',
            'def resolve(pass_results: List[Dict]) -> ResolvedPattern:',
            '    out = {}',
            '    for attr in CONSENSUS_ATTRS:',
            '        votes = {v[attr]: 0.0 for v in pass_results if attr in v}',
            '        for i, v in enumerate(pass_results):',
            '            if attr in v: votes[v[attr]] += PASS_WEIGHTS[i]',
            '        winner = max(votes, key=votes.get)',
            '        confidence = votes[winner] / sum(votes.values())',
            '        out[attr] = (winner, round(confidence, 3))',
            '    return ResolvedPattern(**out)',
        ], lang='python'),
        sp(4),

        H2('Blueprint Generation & Kit Matching'), sp(6),
        P('The Blueprint Engine maps a resolved pattern to the user\'s kit through '
          'a 5-tier cascade. It stops at the highest-fidelity tier that yields '
          'a viable setup, then constructs the ordered Shoot Mode step list.'),
        sp(8),
        *cb('engine/blueprint_engine.py — tier cascade', [
            '# Tiers: 1=exact  2=close_modifier  3=alt_source  4=diy  5=ambient',
            'for tier in range(1, 6):',
            '    gear = kit_matcher.match(blueprint, user_kit, tier=tier)',
            '    if gear.is_viable():',
            '        steps = step_builder.build(',
            '            gear=gear, role=role,',
            '            ceiling_m=ceiling_m, room=room_dims',
            '        )',
            '        return Blueprint(',
            '            pattern=resolved.pattern_name,',
            '            confidence=resolved.confidence,',
            '            gear=gear,   steps=steps,',
            '            gear_tier=tier,',
            '        )',
            'return Blueprint.ambient_fallback(user_kit)',
        ], lang='python'),
        sp(16),

        H2('API Authentication'), sp(6),
        table([
            ['Method',         'Header / Env Var',                      'Source',               'TTL'],
            ['OIDC Token',     'Authorization: Bearer $VERCEL_OIDC_TOKEN', 'vercel env pull',   '~24 h'],
            ['API Key',        'Authorization: Bearer $AI_GATEWAY_API_KEY', 'Vercel Dashboard',  'Manual'],
            ['Lab Email Gate', 'x-lab-email: you@org.com',             'LAB_ALLOWED_EMAILS', 'Per request'],
            ['Public Routes',  '(none)',                                  'N/A',                 'N/A'],
        ], col_widths=[TW*0.20, TW*0.40, TW*0.24, TW*0.16]),
        sp(10),
        *callout('OIDC vs API Key', [
            'On Vercel: prefer OIDC — tokens auto-refresh, no secret rotation. '
            'For local dev run: vercel link && vercel env pull .env.local',
            'Never commit VERCEL_OIDC_TOKEN or AI_GATEWAY_API_KEY to source control.',
        ], kind='amber'),

        H2('Full API Surface Reference'), sp(6),
        table([
            ['Endpoint',                           'Method',  'Auth',    'Description'],
            ['/health',                            'GET',     'Public',  'Service liveness check'],
            ['/health/db',                         'GET',     'Public',  'Database schema + table count'],
            ['/api/shoot-match',                   'POST',    'Bearer',  'Core analysis: image → recommendation'],
            ['/api/upload-reference',              'POST',    'Bearer',  'Upload reference image (10MB max)'],
            ['/api/master-modes',                  'GET',     'Bearer',  'List photographer reference modes'],
            ['/api/shoot-mode/start',              'POST',    'Bearer',  'Start Shoot Mode from recommendation'],
            ['/api/shoot-mode/evaluate-test-shot', 'POST',    'Bearer',  'Compare test shot to target pattern'],
            ['/api/user-data/kit',                 'GET/POST','Bearer',  'Load / save user equipment kit'],
            ['/api/user-data/setup',               'GET/POST','Bearer',  'Load / save named user setups'],
            ['/api/reference-library',             'CRUD',    'Bearer',  'Reference image library management'],
            ['/api/reference-library/ingest',      'POST',    'Bearer',  'Ingest reference with metadata'],
            ['/api/lab/gold-set',                  'CRUD',    'Lab',     'Gold-set test image management'],
            ['/api/lab/gold-set/evaluate',         'POST',    'Lab',     'Run engine on approved gold sets'],
            ['/api/lab/candidates',                'CRUD',    'Lab',     'Engine improvement candidates'],
            ['/api/lab/signals',                   'POST',    'Lab',     'Ingest signals with source tags'],
            ['/api/lab/signals/summary',           'GET',     'Lab',     'Signal hygiene counts by source'],
            ['/api/lab/analyze',                   'POST',    'Lab',     'Full-fidelity analysis + debug overlay'],
        ], col_widths=[TW*0.38, TW*0.10, TW*0.10, TW*0.42]),
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 10 — NGW LAB GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_lab_guide():
    s = cover(10, 'NGW Lab Guide', 'Developer tools — API reference, CLI, gold sets, candidates, and workbench.')
    s += [
        H2('What is the NGW Lab?'), sp(6),
        P('The Lab is a restricted developer environment for curating ground-truth test images, '
          'reviewing engine improvement candidates, running full-fidelity analyses with debug '
          'overlays, and managing the learning signal pipeline. Access is controlled by an '
          'email allowlist (LAB_ALLOWED_EMAILS env var).'),
        sp(10),
        *callout('Access Control', [
            'All Lab endpoints check the x-lab-email request header against LAB_ALLOWED_EMAILS. '
            'Unauthorized access returns 403 and is logged. Enable Lab UI in Settings → Developer Tools.',
        ], kind='amber'),
        sp(12),
        fig('01_workbench.png', 'NGW Lab Workbench — empty state showing tabs: Workbench, Gold Sets, Candidates, Signals'),
        sp(18),

        H2('Lab API Reference — Gold Sets'), sp(6),
        *cb('POST /api/lab/gold-set — create a new gold set', [
            '# Request body',
            '{',
            '  "image_path":    "static/uploads/portrait_001.jpg",',
            '  "pattern":       "loop",      # curator-verified ground truth',
            '  "subject_type":  "portrait",',
            '  "environment":   "studio",',
            '  "setup_details": {',
            '    "key_light":  "Godox AD600 + octa 90cm",',
            '    "key_angle":  45,',
            '    "key_height": 7.5,',
            '    "key_dist_ft": 6,',
            '    "fill":       "V-flat reflector camera-left"',
            '  },',
            '  "outcome_labels": {',
            '    "expected_pattern":    "loop",',
            '    "expected_confidence": 0.85',
            '  },',
            '  "curator_email": "you@org.com"',
            '}',
            '# Response: {"id":"gs_uuid","status":"draft"}',
        ], lang='json'),
        *cb('POST /api/lab/gold-set/evaluate — run engine on approved sets', [
            '# Request body (optional: limit to specific IDs)',
            '{',
            '  "gold_set_ids": ["gs_001","gs_002"],  # omit for all approved',
            '  "include_debug_overlay": true',
            '}',
            '',
            '# Response',
            '{',
            '  "evaluated": 12,',
            '  "passed": 10,',
            '  "failed": 2,',
            '  "scores": {',
            '    "gs_001": {"detected":"loop","expected":"loop","match":true,"conf":0.88},',
            '    "gs_002": {"detected":"broad","expected":"loop","match":false,"conf":0.72}',
            '  }',
            '}',
        ], lang='json'),
        sp(4),
        fig('02_gold_set.png', 'Gold Set listing — all test images with pattern labels, status, and evaluation scores'),
        sp(14),
        fig('03_gold_set_new.png', 'New Gold Set form — image upload, pattern selection, and setup metadata entry'),
        sp(18),

        H2('Lab API Reference — Candidates'), sp(6),
        *cb('POST /api/lab/candidates — create a candidate manually', [
            '{',
            '  "title":       "Recalibrate loop confidence threshold",',
            '  "description": "Loop pattern confidence is 20% above measured CVR.',
            '    Threshold should be lowered to reduce over-detection.",',
            '  "candidate_type": "confidence_recalibration",',
            '  "proposed_change": {',
            '    "type":    "confidence_recalibration",',
            '    "pattern": "loop",',
            '    "action":  "lower_threshold",',
            '    "delta":   -0.08',
            '  },',
            '  "estimated_success_lift":    0.12,',
            '  "estimated_regression_risk": 0.05,',
            '  "source": "manual"',
            '}',
            '# Response: {"id":"cand_uuid","status":"proposed"}',
        ], lang='json'),
        *cb('PUT /api/lab/candidates/{id} — update status (approve/reject)', [
            '{',
            '  "status": "approved",',
            '  "reviewer_email": "curator@org.com",',
            '  "review_notes": "Risk acceptable. CVR data supports the change.",',
            '  "second_reviewer_email": null',
            '  # Required if estimated_regression_risk > 0.20',
            '}',
        ], lang='json'),
        sp(6),
        fig('04_candidates.png', 'Candidates listing — proposed and reviewed engine changes with risk and lift estimates'),
        sp(14),
        fig('05_candidates_new.png', 'New Candidate form — type, description, proposed change JSON, and risk estimation'),
        sp(18),

        H2('Lab API Reference — Analysis & Signals'), sp(6),
        *cb('POST /api/lab/analyze — full-fidelity debug analysis', [
            '# Request body',
            '{',
            '  "image_path":          "static/uploads/ref_001.jpg",',
            '  "include_debug_overlay": true,',
            '  "return_pass_details":   true,',
            '  "kit":                   null  # null = use default test kit',
            '}',
            '',
            '# Response includes:',
            '# - all three VLM pass results (raw)',
            '# - consensus resolver scores per attribute',
            '# - region extraction bounding boxes',
            '# - blueprint output + gear tier',
            '# - debug_overlay_url (annotated image)',
        ], lang='json'),
        *cb('GET /api/lab/signals/summary — hygiene counts', [
            '# Response',
            '{',
            '  "live":              1482,',
            '  "seeded":             500,',
            '  "internal":            23,',
            '  "expert_review":        8,',
            '  "total":             2013,',
            '  "learning_eligible": 1482,',
            '  "metrics_eligible":  1482,',
            '  "flag_mismatches":      0',
            '}',
        ], lang='json'),
        sp(4),
        fig('09_lab_tabs_zoom.png', 'Lab — Signal Hygiene card showing live / seeded / internal / learning-eligible counts'),
        sp(16),

        *H2_NP('Reference Dataset'), sp(6),
        fig('04_ref_dataset.png', 'Reference Dataset — full grid view with filter bar'),
        sp(14),
        fig('06_ref_dataset.png', 'Reference Dataset detail — image with pattern label and approval status'),
        sp(14),
        *cb('POST /api/reference-library/ingest — ingest with metadata', [
            '{',
            '  "image_path":   "static/uploads/ref_new.jpg",',
            '  "pattern":      "rembrandt",',
            '  "modifiers":    ["beauty dish","grid"],',
            '  "subject_type": "portrait",',
            '  "environment":  "studio",',
            '  "quality_score": 0.92,',
            '  "submitted_by": "curator@org.com"',
            '}',
            '# Starts as status="pending_review".',
            '# Second curator approves → status="approved" → enters training set.',
        ], lang='json'),
        sp(4),
        fig('07b_settings_lab.png', 'Lab Settings — evaluation thresholds, access list, and confidence gates'),
        sp(16),

        *H2_NP('CLI Tools'), sp(6),
        table([
            ['Script',                         'Purpose',                                    'Key Flags'],
            ['seed_starter_dataset.py',        'Load seeded signals + gold sets',            '--reset to clear first'],
            ['verify_dataset.py',              'Check dataset integrity and counts',         '--verbose for row details'],
            ['run_benchmarks.py',              'Pattern matching accuracy benchmarks',       '--gold-sets-only, --pattern=X'],
            ['nightly_benchmark.py',           'Full benchmark suite (CI use)',              '--output=json'],
            ['validate_system_yamls.py',       'Lint pattern YAML configurations',           '--strict'],
            ['validate_catalog_and_packs.py',  'Validate gear catalog completeness',         '—'],
            ['ci_benchmark.sh',                'CI/CD benchmark wrapper with exit codes',    'EXIT 1 on regression'],
            ['capture_screenshots.py',         'Capture app screenshots for docs',           '--output-dir=docs/screenshots'],
            ['generate_ngw_docs.py',           'Build this PDF documentation suite',         '—'],
        ], col_widths=[TW*0.30, TW*0.42, TW*0.28]),
        sp(12),
        *cb('bash — common Lab CLI operations', [
            '# Seed starter data (run once after init_db)',
            '$ python3 scripts/seed_starter_dataset.py',
            '',
            '# Verify dataset integrity',
            '$ python3 scripts/verify_dataset.py --verbose',
            '',
            '# Run all benchmarks',
            '$ python3 scripts/run_benchmarks.py',
            '',
            '# Run gold-set-only evaluation',
            '$ python3 scripts/run_benchmarks.py --gold-sets-only',
            '',
            '# Validate YAML configs (run before any blueprint changes)',
            '$ python3 scripts/validate_system_yamls.py --strict',
        ]),
        sp(4),
        fig('08_workbench_ready.png', 'Workbench ready state — analysis loaded with debug overlay and region annotations'),
        sp(14),
        fig('10_workbench_detail.png', 'Workbench detail — per-region confidence scores and VLM pass breakdown'),
        sp(14),
        fig('07c_settings_devtools.png', 'Dev Tools panel — database status, migration runner, and signal count monitor'),
        sp(20),

        *H2_NP('How To: Add a Gold Set Image'), sp(6),
        P('Gold Set images are the ground-truth test set that benchmarks run against. '
          'Adding well-labeled images directly improves evaluation coverage.'),
        sp(6),
        *[item for i, (t, b) in enumerate([
            ('Open NGW Lab',         'Tap the Lab tab in the navigation bar (requires Lab access enabled).'),
            ('Go to Gold Sets',      'Tap "Gold Sets" in the Lab navigation tabs.'),
            ('Tap + Add New',        'Opens the gold set creation form.'),
            ('Upload the image',     'Choose a clean, unedited reference photo with clear lighting.'),
            ('Select pattern',       'Choose the ground-truth pattern from the dropdown (e.g. "loop").'),
            ('Set metadata',         'Fill in subject type, environment, modifier list, and quality notes.'),
            ('Submit for review',    'Status starts as "pending_review". A second curator approves it.'),
            ('After approval',       'Status changes to "approved" — the image enters the benchmark set.'),
        ], start=1) for item in step(i, t, b)],
        sp(12),
        callout('Quality Standards', [
            'Use only clean originals — no heavy color grading, compositing, or retouching.',
            'Minimum 1024 px wide. Portrait orientation preferred for face-priority patterns.',
            'Label with the ground-truth pattern, not what you think NGW will detect.',
            'Add notes for any unusual conditions (high ceiling, very large modifier, etc.).',
        ], kind='amber')[0],
        sp(20),

        *H2_NP('How To: Review and Approve a Candidate'), sp(6),
        P('Candidates are improvement proposals — manually created or auto-generated. '
          'Review each one carefully before approving. High-regression-risk candidates '
          'require a second curator.'),
        sp(6),
        fig('04_candidates.png', 'Candidate queue — proposed, approved, and rejected status columns'),
        sp(14),
        fig('05_candidates_new.png', 'New candidate form — type selection, description, and risk assessment fields'),
        sp(14),
        *[item for i, (t, b) in enumerate([
            ('Open Candidates tab', 'Tap "Candidates" in the Lab navigation. Filter by status="proposed".'),
            ('Read the description', 'Understand what change is proposed and why the failure cluster triggered it.'),
            ('Check regression risk', 'If regression_risk > 0.20, a second curator approval is required.'),
            ('Review proposed_change', 'Read the full JSON. Understand which blueprint or config key changes.'),
            ('Approve or Reject', 'Tap Approve to advance to "approved", or Reject to archive with a note.'),
            ('Validate after apply', 'Gold set benchmarks re-run automatically. Check scores in CLI output.'),
        ], start=1) for item in step(i, t, b)],
        sp(12),
        callout('Never Skip Validation', [
            'Every approved candidate triggers an automatic gold set re-evaluation. '
            'If any gold set drops below 75%, the deployment pipeline fails and the '
            'candidate reverts to "proposed". This gate cannot be bypassed in production.',
        ], kind='red')[0],
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 11 — SIGNAL SYSTEM GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_signal_system():
    s = cover(11, 'Signal System Guide', 'Schema, ingestion API, hygiene flags, queries, and reliability weights.')
    s += [
        H2('What is the Signal System?'), sp(6),
        P('Every shoot outcome a user records — "nailed it", "close", "failed", or "unknown" — '
          'is a signal. The Signal System classifies, tags, and filters these outcomes so that '
          'only the right signals reach each downstream consumer. The four inclusion flags are '
          'the key mechanism: they let you separate seeded bootstrap data from live user data '
          'without deleting any rows.'),
        sp(14),

        H2('Database Schema'), sp(6),
        *cb('session_signals — full CREATE TABLE', [
            'CREATE TABLE session_signals (',
            '  id            TEXT PRIMARY KEY,     -- UUID v4, client-generated',
            '  session_id    TEXT NOT NULL,         -- links to the shoot session',
            '  user_id       TEXT,                  -- nullable for anonymous',
            '  pattern       TEXT NOT NULL,',
            '    -- detected or target pattern name',
            '  outcome       TEXT NOT NULL',
            '    CHECK (outcome IN',
            '      (\'nailed_it\', \'close\', \'failed\', \'unknown\')),',
            '  signal_source TEXT NOT NULL DEFAULT \'live\'',
            '    CHECK (signal_source IN',
            '      (\'live\',\'seeded\',\'internal\',\'expert_review\')),',
            '  include_in_learning    BOOLEAN NOT NULL DEFAULT TRUE,',
            '  include_in_metrics     BOOLEAN NOT NULL DEFAULT TRUE,',
            '  include_in_conversion  BOOLEAN NOT NULL DEFAULT TRUE,',
            '  include_in_cohorts     BOOLEAN NOT NULL DEFAULT TRUE,',
            '  reliability_score      REAL CHECK (reliability_score BETWEEN 0 AND 1),',
            '  region_scores TEXT,  -- JSON: {"face":0.91,"torso":0.78,...}',
            '  degradation_flags TEXT, -- JSON: {"bw":false,"low_res":false,...}',
            '  gear_tier   INTEGER CHECK (gear_tier BETWEEN 1 AND 5),',
            '  environment TEXT,    -- studio | outdoor | hybrid',
            '  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP',
            ');',
        ], lang='sql'),
        sp(4),

        H2('Signal Sources — Default Flag Values'), sp(6),
        table([
            ['source',         'in_learning', 'in_metrics', 'in_conversion', 'in_cohorts', 'Who Creates It'],
            ['live',           'TRUE',        'TRUE',        'TRUE',         'TRUE',        'Real end users via app'],
            ['seeded',         'FALSE',       'FALSE',       'FALSE',        'FALSE',       'Bootstrap / seed scripts'],
            ['internal',       'FALSE',       'FALSE',       'FALSE',        'FALSE',       'Developer / QA testing'],
            ['expert_review',  'FALSE',       'FALSE',       'FALSE',        'FALSE',       'Curator-verified outcomes'],
        ], col_widths=[TW*0.18, TW*0.14, TW*0.14, TW*0.16, TW*0.13, TW*0.25]),
        sp(10),
        *callout('Override', [
            'The default flags can be overridden per-row at insert time or updated in bulk later. '
            'For example, expert_review signals can have include_in_learning = TRUE set manually '
            'to use them as high-quality learning data while still excluding them from public metrics.',
        ], kind='blue'),
        sp(4),

        H2('Signal Ingestion API'), sp(6),
        P('POST /api/lab/signals accepts a batch of signal objects. Each object must include '
          'at minimum pattern, outcome, and signal_source. All other fields are optional.'),
        sp(8),
        *cb('POST /api/lab/signals — request body (JSON)', [
            '{',
            '  "signals": [',
            '    {',
            '      "id":            "sig_uuid_here",',
            '      "session_id":    "sess_abc123",',
            '      "user_id":       "usr_xyz",',
            '      "pattern":       "loop",',
            '      "outcome":       "nailed_it",',
            '      "signal_source": "live",',
            '      "gear_tier":     1,',
            '      "environment":   "studio"',
            '    }',
            '  ]',
            '}',
        ], lang='json'),
        *cb('POST /api/lab/signals — response (JSON)', [
            '{',
            '  "inserted": 1,',
            '  "skipped":  0,',
            '  "errors":   []',
            '}',
        ], lang='json'),
        *cb('bash — ingest signals via curl', [
            '$ curl -X POST http://localhost:8000/api/lab/signals \\',
            '  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\',
            '  -H "x-lab-email: you@org.com" \\',
            '  -H "Content-Type: application/json" \\',
            '  -d @signals_batch.json',
        ]),
        sp(4),

        H2('Inclusion Flags — How Each Is Used'), sp(6),
        table([
            ['Flag',                  'Consumer',                        'Query Filter Applied'],
            ['include_in_learning',   'Learning system (auto_candidate)', 'WHERE include_in_learning = TRUE'],
            ['include_in_metrics',    'Dashboard analytics queries',      'WHERE include_in_metrics = TRUE'],
            ['include_in_conversion', 'CVR calculations',                 'WHERE include_in_conversion = TRUE'],
            ['include_in_cohorts',    'User segmentation queries',        'WHERE include_in_cohorts = TRUE'],
        ], col_widths=[TW*0.28, TW*0.32, TW*0.40]),
        sp(16),

        H2('SQL Query Reference'), sp(6),
        *cb('sql — learning-eligible signals by pattern (last 30 days)', [
            'SELECT',
            '  pattern,',
            '  outcome,',
            '  COUNT(*)                              AS n,',
            '  ROUND(AVG(reliability_score), 3)     AS avg_reliability,',
            '  ROUND(AVG(gear_tier), 2)             AS avg_gear_tier',
            'FROM session_signals',
            'WHERE include_in_learning = TRUE',
            '  AND signal_source       = \'live\'',
            '  AND created_at          >= DATE(\'now\', \'-30 days\')',
            'GROUP BY pattern, outcome',
            'ORDER BY pattern, n DESC;',
        ], lang='sql'),
        *cb('sql — metrics dashboard query (CVR per pattern)', [
            'SELECT',
            '  pattern,',
            '  COUNT(*) FILTER (WHERE outcome = \'nailed_it\') AS nailed,',
            '  COUNT(*) FILTER (WHERE outcome = \'close\')     AS close,',
            '  COUNT(*) FILTER (WHERE outcome = \'failed\')    AS failed,',
            '  COUNT(*)                                       AS total,',
            '  ROUND(',
            '    100.0 * COUNT(*) FILTER (WHERE outcome IN (\'nailed_it\',\'close\'))',
            '    / NULLIF(COUNT(*), 0), 1',
            '  ) AS cvr_pct',
            'FROM session_signals',
            'WHERE include_in_metrics = TRUE',
            'GROUP BY pattern',
            'ORDER BY cvr_pct DESC;',
        ], lang='sql'),
        *cb('sql — hygiene audit: check for mis-tagged seeded rows', [
            '-- Find seeded rows that were incorrectly flagged as live',
            'SELECT id, session_id, created_at',
            'FROM session_signals',
            'WHERE signal_source = \'seeded\'',
            '  AND (include_in_metrics = TRUE',
            '    OR include_in_learning = TRUE);',
            '',
            '-- Fix: reset all seeded flags to FALSE',
            'UPDATE session_signals',
            'SET include_in_learning   = FALSE,',
            '    include_in_metrics    = FALSE,',
            '    include_in_conversion = FALSE,',
            '    include_in_cohorts    = FALSE',
            'WHERE signal_source = \'seeded\';',
        ], lang='sql'),
        sp(4),

        H2('Signal Reliability Weights'), sp(6),
        P('Each signal is scored across eight image regions. The raw score is multiplied '
          'by degradation factors that reduce weight when analysis conditions are poor.'),
        sp(8),
        table([
            ['Region',             'Weight', 'What It Detects'],
            ['face',               '0.35',   'Primary lighting indicator — catch-lights, shadows, fill ratio'],
            ['torso',              '0.15',   'Secondary — useful for full-length and 3/4 portraits'],
            ['background',         '0.12',   'Fall-off curve, separation from subject'],
            ['specular_surfaces',  '0.14',   'Modifier signature — size and hardness of specular highlights'],
            ['shadow_regions',     '0.12',   'Shadow direction, density, and edge hardness'],
            ['highlight_regions',  '0.12',   'Specular placement confirms key position'],
        ], col_widths=[TW*0.24, TW*0.12, TW*0.64]),
        sp(12),
        table([
            ['Degradation Factor',          'Multiplier', 'Trigger Condition'],
            ['Black & white / monochrome',  '×0.75',      'Chroma saturation < 0.05'],
            ['Heavy color grade',           '×0.80',      'Hue shift > 30° or LUT detected'],
            ['No face detected',            '×0.70',      'Face region score == 0'],
            ['Low resolution',              '×0.70',      'Image width < 512 px'],
            ['Extreme contrast',            '×0.85',      'Histogram clipping > 5%'],
            ['Environmental clutter',       '×0.90',      'Background region score < 0.3'],
            ['Multiple shadow directions',  '×0.80',      'Solver finds > 1 shadow vector'],
        ], col_widths=[TW*0.36, TW*0.16, TW*0.48]),
        sp(14),

        H2('Signal Hygiene Summary API'), sp(6),
        *cb('GET /api/lab/signals/summary — response', [
            '{',
            '  "live":              1482,',
            '  "seeded":            500,',
            '  "internal":          23,',
            '  "expert_review":     8,',
            '  "total":             2013,',
            '  "learning_eligible": 1482,',
            '  "metrics_eligible":  1482,',
            '  "conversion_eligible": 1482,',
            '  "cohorts_eligible":  1482,',
            '  "flag_mismatches":   0',
            '}',
        ], lang='json'),
        sp(10),
        *callout('flag_mismatches', [
            'A non-zero flag_mismatches count means rows have signal_source="seeded" or '
            '"internal" but one or more include_* flags is TRUE. Run the hygiene audit '
            'SQL query above to identify and fix affected rows immediately.',
        ], kind='red'),
        sp(10),
        fig('09_lab_tabs_zoom.png', 'Lab Workbench — Signal Hygiene summary card (live / seeded / internal / learning eligible)'),
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 12 — LEARNING SYSTEM GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_learning_system():
    s = cover(12, 'Learning System Guide', 'Failure detection, candidate generation, approval workflow, and safety gates.')
    s += [
        H2('Overview'), sp(6),
        P('The NGW learning system monitors live user outcomes, detects patterns of failure, '
          'and automatically generates typed improvement proposals called Candidates. Every '
          'proposal begins in "proposed" status. Nothing is auto-implemented — all changes '
          'require explicit curator approval. Seeded and internal signals are excluded.'),
        sp(12),
        MetricRow([
            ('Live only',  'Signal source for learning', BLUE),
            ('5 types',    'Failure cluster categories',  GREEN),
            ('Human req.', 'All changes need approval',   AMBER),
            ('0',          'Auto-implemented changes',    RED),
        ]),
        sp(18),

        H2('Data Requirements'), sp(6),
        table([
            ['Parameter',             'Value',       'Notes'],
            ['Minimum signal count',  '≥ 30',        'Per pattern per time window'],
            ['Time window',           '30 days',     'Rolling; configurable via env'],
            ['Signal source filter',  'live only',   'include_in_learning = TRUE AND source = live'],
            ['Minimum cluster size',  '≥ 10',        'Failures in same category to form a cluster'],
            ['Severity threshold',    '≥ 0.25',      'Normalized score; below this = not surfaced'],
        ], col_widths=[TW*0.30, TW*0.18, TW*0.52]),
        sp(16),

        H2('Failure Detection Algorithm'), sp(6),
        *cb('engine/learning/auto_candidate.py — detection loop', [
            '# Runs on schedule (weekly) or triggered manually.',
            'def detect_failures(db, window_days=30, min_n=30):',
            '    signals = db.query(',
            '        "SELECT pattern, outcome, reliability_score, gear_tier"',
            '        " FROM session_signals"',
            '        " WHERE include_in_learning = TRUE"',
            '        "   AND signal_source = \'live\'"',
            '        "   AND created_at >= DATE(\'now\',\'-%d days\')" % window_days',
            '    )',
            '    by_pattern = group_by(signals, "pattern")',
            '    clusters = []',
            '    for pattern, rows in by_pattern.items():',
            '        if len(rows) < min_n:',
            '            continue',
            '        failure_rate = count(rows, outcome=\'failed\') / len(rows)',
            '        cvr = count(rows, outcome__in=[\'nailed_it\',\'close\']) / len(rows)',
            '        cluster = FailureCluster(',
            '            pattern=pattern, n=len(rows),',
            '            failure_rate=failure_rate, cvr=cvr',
            '        )',
            '        clusters.append(cluster)',
            '    return clusters',
        ], lang='python'),
        sp(4),

        H2('Severity Scoring'), sp(6),
        P('Each failure cluster is scored on a 0–1 scale. Clusters above the threshold '
          '(0.25) are promoted to Candidates automatically. The formula rewards large '
          'clusters and penalizes high-volume patterns with low failure rates.'),
        sp(8),
        *cb('engine/learning/auto_candidate.py — severity formula', [
            'def severity(cluster: FailureCluster) -> float:',
            '    # Volume component: log-scaled, capped at 500 signals',
            '    volume = min(cluster.n, 500) / 500',
            '    # Failure rate component: straight failure rate',
            '    fail_r = cluster.failure_rate',
            '    # CVR gap: how far below 0.60 baseline CVR',
            '    cvr_gap = max(0, 0.60 - cluster.cvr) / 0.60',
            '    # Weighted sum',
            '    return 0.35 * volume + 0.35 * fail_r + 0.30 * cvr_gap',
        ], lang='python'),
        sp(16),

        H2('Failure-to-Candidate Type Mapping'), sp(6),
        table([
            ['Failure Pattern',      'Candidate Type',            'Trigger Condition'],
            ['conversion_gap',       'blueprint_correction',      'CVR < 25% with n ≥ 50'],
            ['confidence_mismatch',  'confidence_recalibration',  'High confidence but failure_rate > 40%'],
            ['step_deviation',       'shoot_mode_step_fix',       'Users consistently skip or fail one step'],
            ['pattern_drift',        'dataset_promotion',         'Pattern accuracy declining over 4 weeks'],
            ['trust_gap',            'trust_safety',              'High-confidence wrong results ≥ 3 weeks'],
        ], col_widths=[TW*0.24, TW*0.28, TW*0.48]),
        sp(14),

        H2('Auto-Generated Candidate Example'), sp(6),
        *cb('Example: auto-generated blueprint_correction candidate (JSON)', [
            '{',
            '  "id": "cand_uuid_here",',
            '  "title": "[Auto] Conversion gap — \'loop\' pattern (n=150, CVR=18%)",',
            '  "description": "Loop pattern detected in 150 analyses but yielded',
            '    only 27 upgrades (18% CVR). Engine may be over-diagnosing this',
            '    pattern in low-ceiling environments.",',
            '  "candidate_type": "blueprint_correction",',
            '  "status": "proposed",',
            '  "proposed_change": {',
            '    "type":           "blueprint_correction",',
            '    "action":         "review_detection_threshold",',
            '    "review_areas":   ["threshold","blueprint_copy","confidence_gate"],',
            '    "affected_pattern": "loop"',
            '  },',
            '  "estimated_success_lift":    0.22,',
            '  "estimated_regression_risk": 0.08,',
            '  "source": "auto"',
            '}',
        ], lang='json'),
        sp(4),

        H2('Approval Workflow'), sp(4),
        *[item for i, (t, b) in enumerate([
            ('Auto-Generate',   'Learning sweep detects cluster → creates candidate with status="proposed".'),
            ('Curator Review',  'Lab curator reads description, proposed_change, lift, and regression risk.'),
            ('Risk Assessment', 'High risk (regression_risk > 0.20) requires a second curator approval.'),
            ('Approve/Reject',  'Curator sets status="approved" or status="rejected" with notes.'),
            ('Engine Update',   'Approved candidate is applied to blueprint or detection config.'),
            ('Validation',      'Gold set evaluation re-runs automatically. Any regression reverts the change.'),
        ], start=1) for item in step(i, t, b)],
        sp(14),

        H2('Engine Update & Rollback'), sp(6),
        *cb('bash — apply and rollback a candidate', [
            '# Apply an approved candidate',
            '$ python3 scripts/apply_candidate.py --id cand_uuid_here',
            '',
            '# Re-run gold set evaluation to confirm no regression',
            '$ python3 scripts/run_benchmarks.py --gold-sets-only',
            '',
            '# Rollback: revert candidate to proposed status',
            '$ sqlite3 data/ngw_users.db \\',
            '  "UPDATE candidates SET status=\'proposed\' WHERE id=\'cand_uuid_here\';"',
            '',
            '# Then manually revert the blueprint change and re-run gold sets',
        ]),
        sp(10),
        *callout('Regression Safety Gate', [
            'Gold set evaluation is mandatory after every approved candidate. If any gold set '
            'score drops below 75%, the deployment pipeline fails and the candidate is '
            'automatically reverted to "proposed" status.',
            'There is no way to bypass this gate in production. Local dev only.',
        ], kind='red'),
        sp(14),

        H2('Learning Performance Benchmarks'), sp(6),
        table([
            ['Pattern',      'Baseline CVR', 'Target Post-Update', 'Min Signals Needed', 'Notes'],
            ['Clamshell',    '85–92%',       '90–95%',            '30',                 'Incremental gains only'],
            ['Loop',         '60–80%',       '72–85%',            '30',                 'Most improvement headroom'],
            ['Rembrandt',    '40–70%',       '55–75%',            '50',                 'Complex; high variance'],
            ['Butterfly',    '70–82%',       '75–87%',            '30',                 'Ceiling height key factor'],
            ['Split',        '65–78%',       '68–82%',            '30',                 'Gear tier dominant factor'],
            ['Hard Direct',  '55–70%',       '65–78%',            '40',                 'Needs modifier data'],
        ], col_widths=[TW*0.18, TW*0.18, TW*0.22, TW*0.22, TW*0.20]),
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 13 — OPERATIONS MANUAL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_operations_manual():
    s = cover(13, 'Operations Manual', 'Installation, CLI, database, deployment, and incident response.')
    s += [
        H2('System Requirements'), sp(6),
        table([
            ['Requirement',  'Minimum',              'Recommended',          'Notes'],
            ['Python',       '3.11',                 '3.12',                 'FastAPI backend'],
            ['Node.js',      '20 LTS',               '22 LTS',               'Frontend build'],
            ['RAM',          '2 GB',                 '4 GB',                 'VLM peaks ~1.5 GB'],
            ['Storage',      '5 GB',                 '20 GB',                'Images + DB'],
            ['Network',      'Outbound HTTPS',       'Low-latency',          'VLM API calls'],
            ['Database',     'SQLite 3.x',           'PostgreSQL 15+',       'SQLite = dev only'],
        ], col_widths=[TW*0.18, TW*0.18, TW*0.22, TW*0.42]),
        sp(18),

        H2('Installation'), sp(6),
        *cb('bash — clone repository', [
            '$ git clone https://github.com/your-org/ngw-core.git',
            '$ cd ngw-core',
        ]),
        *cb('bash — Python environment setup', [
            '$ python3 -m venv .venv',
            '$ source .venv/bin/activate          # macOS / Linux',
            '$ .venv\\Scripts\\activate             # Windows',
            '$ pip install --upgrade pip',
            '$ pip install -r requirements.txt',
        ]),
        *cb('bash — Frontend setup', [
            '$ cd ui',
            '$ npm install',
            '$ cd ..',
        ]),
        sp(4),

        *H2_NP('First-Time Setup'), sp(6),
        P('Copy the environment template and fill in required values before starting the server.'),
        sp(6),
        *cb('.env.local — minimum required variables', [
            '# AI Gateway (choose one auth method)',
            'AI_GATEWAY_API_KEY=gw_xxxxxxxxxxxxxxxx',
            '# OR use OIDC (preferred on Vercel):',
            '# VERCEL_OIDC_TOKEN=<auto-provisioned by vercel env pull>',
            '',
            '# Database',
            'DATABASE_URL=sqlite:///./data/ngw_users.db',
            '',
            '# CORS',
            'ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173',
            '',
            '# Lab access (comma-separated emails)',
            'LAB_ALLOWED_EMAILS=you@org.com,teammate@org.com',
            '',
            '# Cron authentication',
            'CRON_SECRET=your-random-secret-here',
        ]),
        *cb('bash — initialize database and seed data', [
            '# Create tables',
            '$ python3 -c "from db.database import init_db; init_db()"',
            '',
            '# Load starter dataset (seeded signals + gold sets)',
            '$ python3 scripts/seed_starter_dataset.py',
            '',
            '# Verify dataset integrity',
            '$ python3 scripts/verify_dataset.py',
        ]),
        sp(4),

        *H2_NP('Development Server'), sp(6),
        P('Run backend and frontend in two separate terminal sessions.'),
        sp(6),
        *cb('terminal 1 — start backend (auto-reload on save)', [
            '$ source .venv/bin/activate',
            '$ uvicorn main:app --reload --host 0.0.0.0 --port 8000',
            '# INFO:     Uvicorn running on http://0.0.0.0:8000',
            '# INFO:     Application startup complete.',
        ]),
        *cb('terminal 2 — start frontend (Vite HMR)', [
            '$ cd ui',
            '$ npm run dev',
            '# VITE v5.x  ready in 300 ms',
            '# ➜  Local:   http://localhost:5173/',
            '# ➜  API:     http://localhost:8000/ (proxied)',
        ]),
        *callout('Quick Verify', [
            'Open http://localhost:5173 — the home screen should load.',
            'Open http://localhost:8000/health — should return {"status":"ok"}.',
            'Open http://localhost:8000/docs — FastAPI auto-generated Swagger UI.',
        ], kind='green'),
        sp(4),

        *H2_NP('Database Operations'), sp(6),
        *cb('bash — run schema migrations', [
            '$ python3 scripts/run_migrations.py',
            '# Migrations are idempotent — safe to re-run.',
            '# Always backup before migrating in production.',
        ]),
        *cb('bash — backup and restore (SQLite)', [
            '# Backup',
            '$ sqlite3 data/ngw_users.db ".backup data/backup_$(date +%Y%m%d).db"',
            '',
            '# Verify backup',
            '$ sqlite3 data/backup_$(date +%Y%m%d).db ".tables"',
            '',
            '# Restore',
            '$ cp data/backup_YYYYMMDD.db data/ngw_users.db',
        ]),
        *cb('bash — inspect schema and table sizes', [
            '$ sqlite3 data/ngw_users.db',
            'sqlite> .tables',
            'sqlite> .schema session_signals',
            'sqlite> SELECT COUNT(*) FROM session_signals;',
            'sqlite> SELECT signal_source, COUNT(*) FROM session_signals GROUP BY 1;',
            'sqlite> .quit',
        ], lang='sql'),
        sp(4),

        *H2_NP('Environment Variables — Complete Reference'), sp(6),
        table([
            ['Variable',               'Type',    'Required', 'Default',             'Description'],
            ['AI_GATEWAY_API_KEY',     'string',  'alt.',     '—',                   'Vercel AI Gateway key (or use OIDC)'],
            ['VERCEL_OIDC_TOKEN',      'string',  'alt.',     'auto on Vercel',      'Short-lived JWT; preferred in prod'],
            ['AI_MODEL_STRING',        'string',  'No',       'gateway default',     'VLM model identifier for AI Gateway'],
            ['DATABASE_URL',           'string',  'Yes',      'sqlite:///./data/…',  'SQLite path or Postgres DSN'],
            ['ALLOWED_ORIGINS',        'string',  'Yes',      'localhost:3000,5173',  'Comma-separated CORS origins'],
            ['UPLOAD_DIR',             'string',  'No',       'static/uploads',      'Directory for uploaded images'],
            ['LAB_ALLOWED_EMAILS',     'string',  'Yes',      '—',                   'Comma-separated Lab-access emails'],
            ['CRON_SECRET',            'string',  'Yes',      '—',                   'Auth header for scheduled jobs'],
            ['LOG_LEVEL',              'string',  'No',       'INFO',                'DEBUG for verbose output'],
            ['MAX_UPLOAD_MB',          'integer', 'No',       '10',                  'Max image upload size in MB'],
            ['VLM_TIMEOUT_SECONDS',    'integer', 'No',       '30',                  'Per-pass VLM call timeout'],
            ['VLM_PASS_COUNT',         'integer', 'No',       '3',                   'Analysis passes per image'],
            ['CONFIDENCE_EARLY_EXIT',  'float',   'No',       '0.94',                'Skip remaining passes if exceeded'],
        ], col_widths=[TW*0.26, TW*0.10, TW*0.11, TW*0.20, TW*0.33]),
        sp(18),

        *H2_NP('Running Tests & Benchmarks'), sp(6),
        *cb('bash — test suite', [
            '# Full test suite',
            '$ python3 -m pytest tests/ -q --tb=short',
            '',
            '# Specific test files',
            '$ python3 -m pytest tests/test_shoot_match.py -v',
            '$ python3 -m pytest tests/test_engine.py -v',
            '$ python3 -m pytest tests/test_signals.py -v',
            '',
            '# Stop on first failure',
            '$ python3 -m pytest tests/ -x --tb=long',
        ]),
        *cb('bash — benchmarks and validation', [
            '# Pattern matching benchmarks',
            '$ python3 scripts/run_benchmarks.py',
            '',
            '# CI benchmark (used in CI/CD pipeline)',
            '$ bash scripts/ci_benchmark.sh',
            '',
            '# Validate system YAML configurations',
            '$ python3 scripts/validate_system_yamls.py',
            '',
            '# Validate reference catalog and packs',
            '$ python3 scripts/validate_catalog_and_packs.py',
        ]),
        sp(4),

        H2('Production Deployment — Vercel'), sp(6),
        *cb('bash — Vercel setup and deploy', [
            '# Install Vercel CLI',
            '$ npm i -g vercel',
            '',
            '# Link to Vercel project (first time only)',
            '$ vercel link',
            '',
            '# Pull environment variables (provisions OIDC token)',
            '$ vercel env pull .env.local',
            '',
            '# Deploy to preview',
            '$ vercel deploy',
            '',
            '# Deploy to production',
            '$ vercel deploy --prod',
            '',
            '# Inspect deployment',
            '$ vercel inspect <deployment-url>',
        ]),
        *cb('vercel.json — cron jobs configuration', [
            '{',
            '  "crons": [',
            '    {',
            '      "path": "/api/cron/nightly-benchmark",',
            '      "schedule": "0 3 * * *"',
            '    },',
            '    {',
            '      "path": "/api/cron/learning-sweep",',
            '      "schedule": "0 4 * * 1"',
            '    }',
            '  ]',
            '}',
        ], lang='json'),
        sp(4),

        H2('Health Monitoring'), sp(6),
        *cb('bash — health check commands', [
            '# Service liveness',
            '$ curl http://localhost:8000/health',
            '# → {"status":"ok","version":"1.0","uptime_s":3621}',
            '',
            '# Database status',
            '$ curl http://localhost:8000/health/db',
            '# → {"tables":5,"schema_version":"2025-03","ok":true}',
            '',
            '# Signal hygiene summary (Lab auth required)',
            '$ curl -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\',
            '       -H "x-lab-email: you@org.com" \\',
            '       http://localhost:8000/api/lab/signals/summary',
            '# → {"live":1482,"seeded":500,"internal":23,"expert_review":8,',
            '#    "learning_eligible":1482,"metrics_eligible":1482}',
        ]),
        *cb('bash — log tailing and analysis', [
            '# Tail logs in development (uvicorn output)',
            '$ uvicorn main:app --reload 2>&1 | tee -a logs/dev.log',
            '',
            '# Filter for errors',
            '$ grep "ERROR\\|Exception\\|500" logs/dev.log',
            '',
            '# Count VLM timeouts in the last 24 hours',
            '$ grep "VLM_TIMEOUT" logs/dev.log | grep "$(date +%Y-%m-%d)" | wc -l',
            '',
            '# Watch for Lab access attempts',
            '$ tail -f logs/dev.log | grep "lab-access"',
        ]),
        sp(4),

        H2('Maintenance Procedures'), sp(6),
        KeepTogether([
            H4('Weekly'),
            B('Review open candidates — approve or reject items older than 7 days.'),
            B('Check gold set evaluation scores — flag any below 80%.'),
            B('Review signal hygiene summary — confirm live count is growing.'),
            B('Check VLM timeout rate — should stay below 2% of requests.'),
        ]),
        sp(8),
        KeepTogether([
            H4('Monthly'),
            B('Run full gold set re-evaluation after any engine update.'),
            B('Rotate AI Gateway API key or verify OIDC refresh is working.'),
            B('Audit LAB_ALLOWED_EMAILS — remove any leavers.'),
            B('Archive seeded signals older than 90 days (they skew storage).'),
            B('Run python3 scripts/nightly_benchmark.py manually to verify regression baseline.'),
        ]),
        sp(12),

        H2('Incident Response Playbook'), sp(4),
        *callout('API returns 500 on /api/shoot-match', [
            '1. curl http://localhost:8000/health/db → confirm DB is accessible.',
            '2. Check LOG_LEVEL=DEBUG output for exception traceback.',
            '3. Confirm AI_GATEWAY_API_KEY / OIDC token is valid and not expired.',
            '4. curl the /api/lab/analyze endpoint with the same image — compare responses.',
        ], kind='red'),
        *callout('VLM calls failing / timing out', [
            '1. Test gateway connectivity: curl https://api.vercel.ai/health',
            '2. Check VLM_TIMEOUT_SECONDS — increase to 60 if inference is slow.',
            '3. Check AI Gateway quota in the Vercel Dashboard.',
            '4. Fallback: set AI_MODEL_STRING to a lighter model temporarily.',
        ], kind='red'),
        *callout('Gold set scores dropped after engine update', [
            '1. Identify which candidate was recently applied (check candidates table).',
            '2. Review the candidate proposed_change JSON for the problematic change.',
            '3. Revert: UPDATE candidates SET status=\'proposed\' WHERE id=\'...\';',
            '4. Re-run gold set evaluation to confirm scores recover.',
            '5. File a new candidate with more conservative proposed_change values.',
        ], kind='amber'),
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 14 — TROUBLESHOOTING GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_troubleshooting():
    s = cover(14, 'Troubleshooting Guide', 'Diagnose and resolve issues with CLI commands, SQL queries, and log analysis.')
    s += [
        H2('Common Issues — Quick Reference'), sp(6),
        table([
            ['Symptom',                         'Likely Cause',                     'First Action'],
            ['Recommendation confidence < 40%',  'Image quality / heavy grading',    'Use clean unedited reference'],
            ['Wrong pattern detected',           'Mixed lighting or color grade',     'See Image Quality section below'],
            ['Shoot Mode ceiling warning',       'Ceiling height not in Settings',    'Settings → set ceiling height'],
            ['Kit gear not in suggestions',      'Gear missing from My Kit',          'My Kit → add missing item'],
            ['Lab returns 403',                  'Email not in allowlist',            'Add email to LAB_ALLOWED_EMAILS'],
            ['Analysis > 30 s',                  'VLM timeout',                       'Check API key; increase timeout'],
            ['/health returns 500',              'DB not initialized',                'python3 -c "from db.database import init_db; init_db()"'],
            ['Gold set scores dropped',          'Recent candidate applied',          'Check candidates table; revert'],
            ['Seeded data in live metrics',      'Signal flags not set correctly',    'Run hygiene audit SQL query'],
            ['VLM returns garbled JSON',         'Model output parsing error',        'Check LOG_LEVEL=DEBUG for raw output'],
            ['CORS error in browser',            'Origin not in ALLOWED_ORIGINS',     'Add origin to env var; restart'],
        ], col_widths=[TW*0.33, TW*0.31, TW*0.36]),
        sp(18),

        *H2_NP('API Diagnostic Sequence'), sp(6),
        P('Run these checks in order. Each step narrows the failure surface.'),
        sp(8),
        *cb('bash — step-by-step API diagnostics', [
            '# 1. Is the backend alive?',
            '$ curl -s http://localhost:8000/health | python3 -m json.tool',
            '# Expected: {"status":"ok","version":"1.0"}',
            '',
            '# 2. Is the database accessible?',
            '$ curl -s http://localhost:8000/health/db | python3 -m json.tool',
            '# Expected: {"tables":5,"schema_version":"...","ok":true}',
            '',
            '# 3. Can you authenticate?',
            '$ curl -s -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\',
            '       http://localhost:8000/api/master-modes',
            '# Expected: JSON list of master modes',
            '',
            '# 4. Is Lab accessible?',
            '$ curl -s -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\',
            '       -H "x-lab-email: you@org.com" \\',
            '       http://localhost:8000/api/lab/signals/summary',
            '# Expected: JSON with live/seeded/internal counts',
            '',
            '# 5. Can VLM be reached? (requires a test image)',
            '$ curl -s -X POST \\',
            '       -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\',
            '       -H "x-lab-email: you@org.com" \\',
            '       -d \'{"image_path":"static/uploads/test.jpg","include_debug_overlay":true}\' \\',
            '       http://localhost:8000/api/lab/analyze | python3 -m json.tool',
        ]),
        sp(4),

        H2('Log Analysis'), sp(6),
        P('The backend logs to stdout in structured format. Key prefixes to filter for:'),
        sp(8),
        *cb('bash — log patterns and grep commands', [
            '# Enable verbose logging',
            '$ LOG_LEVEL=DEBUG uvicorn main:app --reload',
            '',
            '# All errors in current run',
            '$ grep -E "ERROR|Exception|Traceback" /tmp/ngw-dev.log',
            '',
            '# VLM call latencies (ms)',
            '$ grep "vlm_pass_ms" /tmp/ngw-dev.log | tail -20',
            '',
            '# Failed Lab access attempts',
            '$ grep "lab_access_denied" /tmp/ngw-dev.log',
            '',
            '# VLM timeout events',
            '$ grep "VLM_TIMEOUT" /tmp/ngw-dev.log | wc -l',
            '',
            '# Signals inserted today',
            '$ grep "signal_inserted" /tmp/ngw-dev.log \\',
            '  | grep "$(date +%Y-%m-%d)" | wc -l',
        ]),
        sp(4),

        *H2_NP('Database Diagnostic Queries'), sp(6),
        *cb('sql — database integrity and health checks', [
            '-- Table row counts',
            'SELECT name,',
            '  (SELECT COUNT(*) FROM sqlite_master WHERE type=\'table\' AND name=m.name)',
            '  AS exists_flag',
            'FROM (VALUES',
            '  (\'session_signals\'),(\'gold_sets\'),(\'candidates\'),',
            '  (\'reference_library\'),(\'user_kits\')',
            ') AS m(name);',
            '',
            '-- Signal count by source',
            'SELECT signal_source, COUNT(*) AS n',
            'FROM session_signals GROUP BY signal_source;',
            '',
            '-- Open candidate queue',
            'SELECT status, COUNT(*) FROM candidates GROUP BY status;',
            '',
            '-- Gold set score summary',
            'SELECT status, COUNT(*) FROM gold_sets GROUP BY status;',
            '',
            '-- Most recent 5 signals',
            'SELECT id, pattern, outcome, signal_source, created_at',
            'FROM session_signals ORDER BY created_at DESC LIMIT 5;',
        ], lang='sql'),
        *cb('sql — find flag_mismatch rows (seeded marked as live)', [
            'SELECT id, session_id, signal_source, created_at,',
            '       include_in_metrics, include_in_learning',
            'FROM session_signals',
            'WHERE signal_source IN (\'seeded\', \'internal\')',
            '  AND (include_in_metrics   = TRUE',
            '    OR include_in_learning  = TRUE',
            '    OR include_in_conversion = TRUE',
            '    OR include_in_cohorts   = TRUE);',
        ], lang='sql'),
        sp(4),

        H2('Image Quality Diagnostics'), sp(6),
        table([
            ['Condition',                  'Confidence Impact', 'Detection',                  'Fix'],
            ['B&W / monochrome',           '–25%',             'Chroma saturation < 0.05',    'Use color original'],
            ['Heavy color grade',          '–20%',             'Hue shift or LUT signature',  'Export ungraded'],
            ['No face detected',           '–30%',             'Face region score = 0',       'Ensure face in frame'],
            ['Resolution < 512 px',        '–30%',             'Image width check at ingest', 'Use ≥ 1024 px wide'],
            ['Extreme contrast',           '–15%',             'Histogram clipping > 5%',     'Recover highlights/shadows'],
            ['Multiple subjects',          '–10%',             'Multi-face region flag',      'Crop to primary subject'],
            ['Environmental clutter',      '–10%',             'Background complexity score', 'Plain background preferred'],
        ], col_widths=[TW*0.24, TW*0.14, TW*0.30, TW*0.32]),
        sp(16),

        H2('VLM Troubleshooting'), sp(6),
        *cb('bash — test VLM connectivity independently', [
            '# Test gateway reachability',
            '$ curl -s -o /dev/null -w "%{http_code}" \\',
            '       -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\',
            '       https://api.vercel.ai/v1/models',
            '# Expected: 200',
            '',
            '# Test with a simple text prompt (no image)',
            '$ curl -s -X POST https://api.vercel.ai/v1/chat/completions \\',
            '       -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\',
            '       -H "Content-Type: application/json" \\',
            '       -d \'{"model":"anthropic/claude-haiku-4","messages":[{"role":"user","content":"Hi"}]}\'',
        ]),
        *callout('VLM Timeout Checklist', [
            'VLM_TIMEOUT_SECONDS is set (default 30). Increase to 60 for slow inference.',
            'VLM_PASS_COUNT is set (default 3). Reduce to 1 for faster debug iteration.',
            'Check AI Gateway quota in Vercel Dashboard → AI Gateway → Usage.',
            'Try a lighter model: set AI_MODEL_STRING=anthropic/claude-haiku-4 temporarily.',
        ], kind='amber'),
        sp(16),

        *H2_NP('Error Codes — Complete Reference'), sp(6),
        table([
            ['Code', 'Message',                            'Likely Cause',                  'Action'],
            ['400',  'Invalid image format',               'Unsupported file type',          'Use JPEG/PNG/HEIC ≤ 10 MB'],
            ['400',  'Missing required field: pattern',    'Bad request body',               'Check API docs at /docs'],
            ['401',  'Unauthorized',                       'Missing or expired Bearer token','Refresh token; re-run vercel env pull'],
            ['403',  'Lab access denied',                  'Email not in allowlist',         'Add to LAB_ALLOWED_EMAILS; restart'],
            ['413',  'Request entity too large',           'Image > MAX_UPLOAD_MB',          'Resize image; or raise limit'],
            ['422',  'Unprocessable entity',               'Schema validation failed',       'Check field types in body'],
            ['429',  'Too many requests',                  'Rate limit hit',                 'Back off; check gateway quota'],
            ['500',  'Internal server error',              'Unhandled exception',            'Check logs; curl /health/db'],
            ['503',  'Service unavailable',                'Backend not running',            'Start uvicorn; check process'],
            ['504',  'Gateway timeout',                    'VLM call timed out',             'Increase VLM_TIMEOUT_SECONDS'],
        ], col_widths=[TW*0.08, TW*0.26, TW*0.26, TW*0.40]),
        sp(14),

        H2('Common Fix Procedures'), sp(6),
        KeepTogether([
            H4('Reset a stuck analysis session'),
            *cb('sql — clear stuck in-flight sessions', [
                'UPDATE session_signals',
                'SET outcome = \'unknown\'',
                'WHERE outcome IS NULL AND created_at < DATE(\'now\',\'-1 hour\');',
            ], lang='sql'),
        ]),
        sp(6),
        KeepTogether([
            H4('Rebuild SQLite indexes after large import'),
            *cb('sql — rebuild indexes', [
                'REINDEX session_signals;',
                'REINDEX gold_sets;',
                'VACUUM;  -- reclaim space after bulk deletes',
            ], lang='sql'),
        ]),
        sp(6),
        *callout('Getting Help', [
            'Include: session_id (from URL after analysis), error code, LOG_LEVEL=DEBUG output snippet, '
            'and signal_source if the issue is signal-related.',
            'Open a Lab candidate with type="trust_safety" to track systemic issues for curator review.',
        ], kind='blue'),
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 15 — PAYWALL + PRICING GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_paywall_pricing():
    s = cover(15, 'Paywall + Pricing Guide', 'Plans, features, and upgrade paths.')
    s += [
        H2('Plans Overview'), sp(6),
        P('NGW offers three plans designed for different photographer profiles — from '
          'occasional use to full professional studio workflows. All plans include the '
          'core analysis engine; premium plans add Shoot Mode, advanced matching, and '
          'multi-session history.'),
        sp(16),
        table([
            ['',                        'Free',         'Pro',          'Studio'],
            ['Price',                   '$0/mo',        '$14/mo',       '$39/mo'],
            ['Analyses / month',        '5',            'Unlimited',    'Unlimited'],
            ['Shoot Mode',              '—',            '✓',            '✓'],
            ['My Kit',                  'Basic',        'Full',         'Full + Teams'],
            ['Pattern Library',         '10 patterns',  '30+ patterns', '30+ patterns'],
            ['Recipes',                 '3 recipes',    '13 recipes',   '13 recipes'],
            ['Session History',         '7 days',       '90 days',      'Unlimited'],
            ['Test Shot Evaluation',    '—',            '✓',            '✓'],
            ['NGW Lab Access',          '—',            '—',            'On request'],
            ['Priority Support',        '—',            'Email',        'Priority'],
        ], col_widths=[TW*0.36, TW*0.16, TW*0.16, TW*0.32]),
        sp(18),

        H2('Feature Gating'), sp(6),
        P('Features are gated at the component level. When a user without access triggers '
          'a premium feature, a Paywall Gate is shown inline — no redirect, no interruption '
          'to their current session.'),
        sp(10),
        KeepTogether([
            H4('Gated Features'),
            B('Shoot Mode — Requires Pro or Studio. PaywallGate shown inline on entry.'),
            B('Shoot Mode Test Shot Evaluation — Requires Pro or Studio.'),
            B('Full pattern library (30+ patterns) — Free plan sees 10 core patterns only.'),
            B('All 13 Recipes — Free plan sees 3. Pro unlocks all.'),
            B('Kit sub-groups and team sharing — Studio only.'),
            B('NGW Lab — Studio + approved email. Requires Settings → Dev Tools activation.'),
        ]),
        sp(16),

        H2('Upgrade Paths'), sp(6),
        table([
            ['From',    'To',      'Key Unlock',                          'Suggested Trigger'],
            ['Free',    'Pro',     'Shoot Mode + unlimited analyses',     'After 3rd analysis in a month'],
            ['Free',    'Pro',     'All 13 Recipes',                      'After viewing recipe 3 of 3'],
            ['Pro',     'Studio',  'Team kit sharing + Lab access',       'After first team session'],
            ['Studio',  'Studio+', 'Lab access + priority onboarding',   'After 3 months Studio'],
        ], col_widths=[TW*0.12, TW*0.12, TW*0.40, TW*0.36]),
        sp(16),

        H2('Billing & Access Notes'), sp(6),
        KeepTogether([
            callout('Billing', [
                'Subscriptions are managed through the account portal. Upgrades take effect immediately; '
                'downgrades take effect at the end of the billing period. No partial-month proration.',
                'NGW Lab access is not purchasable — it requires an approved team email. Studio plan '
                'is required as a prerequisite, but does not automatically grant Lab access.',
            ], kind='blue')[0],
        ]),
        sp(12),
        KeepTogether([
            callout('Enterprise & Team Pricing', [
                'For teams of 5+ photographers, contact us for custom pricing. Team plans include '
                'shared kit libraries, multi-user Lab access, dedicated onboarding, and SLA support.',
            ], kind='green')[0],
        ]),
    ]
    return s


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 16 — DEVELOPER GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_developer_guide():
    s = cover(16, 'Developer Guide', 'Contributing, project structure, adding patterns, and the test suite.', accent=GREEN)
    s += [
        H2('Who This Guide Is For'), sp(6),
        P('This guide is for engineers working on the NGW core engine, frontend, or CLI tooling. '
          'It assumes familiarity with Python 3.11+, FastAPI, and React 18. It covers: '
          'project layout, backend architecture, how to add or modify a lighting pattern, '
          'the test and benchmark systems, and the contribution workflow.'),
        sp(14),
        MetricRow([
            ('Python 3.11', 'Backend runtime',   BLUE),
            ('FastAPI',     'REST API layer',     GREEN),
            ('React 18',    'Frontend SPA',       AMBER),
            ('Pytest',      'Test framework',     MUTED),
        ]),
        sp(20),

        H2('Project Structure'), sp(6),
        *cb('ngw-core — top-level directory layout', [
            'ngw-core/',
            '├── engine/                 # Core analysis pipeline',
            '│   ├── orchestrator.py     # analyze_image() entry point',
            '│   ├── vision_pipeline.py  # Image processing + MediaPipe',
            '│   ├── vlm_adapter.py      # AI Gateway VLM calls',
            '│   ├── solver.py           # Weighted consensus solver',
            '│   ├── blueprints/         # Pattern YAML definitions',
            '│   ├── learning/           # Failure detection + candidates',
            '│   └── services/           # shoot_match_service.py etc.',
            '├── api/',
            '│   ├── main.py             # FastAPI app + lifespan',
            '│   └── routes/             # shoot_match.py, lab.py, signals.py …',
            '├── db/',
            '│   ├── database.py         # init_db(), engine, session',
            '│   └── models.py           # SQLAlchemy table models',
            '├── ui/',
            '│   ├── src/',
            '│   │   ├── components/     # React components',
            '│   │   ├── pages/          # Route-level pages',
            '│   │   └── hooks/          # Custom React hooks',
            '│   └── vite.config.ts',
            '├── tests/                  # pytest test suite',
            '├── scripts/                # CLI tools (see Lab Guide)',
            '├── docs/                   # Screenshots, PDFs, markdown',
            '└── data/                   # SQLite DB (dev only)',
        ], lang='shell'),
        sp(16),

        *H2_NP('Backend Architecture'), sp(6),
        P('The FastAPI backend is structured around three layers: '
          'routes (HTTP handlers), services (orchestration logic), and the engine (analysis pipeline). '
          'Routes are thin — they validate input, call services, and format responses. '
          'Services own business logic. The engine is stateless and pure.'),
        sp(8),
        table([
            ['Layer',    'File(s)',                            'Responsibility'],
            ['Routes',   'api/routes/*.py',                   'HTTP validation, auth checks, response formatting'],
            ['Services', 'engine/services/*.py',              'Orchestrate engine calls, build response models'],
            ['Engine',   'engine/orchestrator.py',            'analyze_image() — calls pipeline → solver → blueprint'],
            ['Pipeline', 'engine/vision_pipeline.py',         'Image decode, MediaPipe, region extraction'],
            ['VLM',      'engine/vlm_adapter.py',             'AI Gateway calls, multi-pass, parse responses'],
            ['Solver',   'engine/solver.py',                  'Weighted consensus across VLM passes'],
            ['Blueprints','engine/blueprints/*.yaml',         'Pattern definitions: tiers, thresholds, copy'],
            ['DB',       'db/database.py + db/models.py',     'SQLAlchemy sessions, table models'],
        ], col_widths=[TW*0.14, TW*0.30, TW*0.56]),
        sp(14),

        *H2_NP('Adding a New Lighting Pattern'), sp(6),
        P('Patterns are defined in YAML files under engine/blueprints/. The engine loads '
          'all YAML files at startup. Adding a pattern requires three steps: '
          'write the YAML definition, add gold set images, run benchmarks.'),
        sp(8),
        *cb('engine/blueprints/loop.yaml — example pattern definition', [
            'pattern_id:    loop',
            'display_name:  Loop',
            'description:   "Key 45° off-axis, slight elevation. Nose-shadow loops down."',
            '',
            'detection:',
            '  confidence_threshold: 0.72',
            '  primary_cues:',
            '    - catchlight_position: [45, 315]   # degrees off center',
            '    - shadow_direction:    loop         # named shadow type',
            '    - fill_ratio_range:    [1.5, 4.0]  # key:fill stop range',
            '',
            'blueprint:',
            '  tiers:',
            '    - tier: 1   # exact match',
            '      key:   { type: monolight, modifier: octa_90cm, angle: 45, height: 7.5 }',
            '      fill:  { type: v_flat, side: camera_left }',
            '    - tier: 2   # close substitute',
            '      key:   { type: speedlight, modifier: umbrella_60cm, angle: 45, height: 6.5 }',
            '      fill:  { type: reflector, side: camera_left }',
            '',
            'shoot_mode:',
            '  step_order: [camera, key, fill, test, evaluate]',
            '  ceiling_min_ft: 8',
        ], lang='shell'),
        sp(8),
        callout('Required Blueprint Fields', [
            'pattern_id — must be unique, lowercase, underscore-separated.',
            'confidence_threshold — set conservatively (0.65–0.80). Too high = misses; too low = false positives.',
            'At least one tier-1 blueprint entry. Tier-5 (ambient) is optional but recommended.',
            'shoot_mode.ceiling_min_ft — prevents illegal placements on low ceilings.',
        ], kind='blue')[0],
        sp(14),
        *[item for i, (t, b) in enumerate([
            ('Write the YAML',       'Create engine/blueprints/{pattern_id}.yaml following the schema above.'),
            ('Validate YAML',        'Run: python3 scripts/validate_system_yamls.py --strict'),
            ('Add Gold Set images',  'Add 3–5 labeled reference images via the Lab → Gold Sets → + Add New.'),
            ('Run benchmarks',       'Run: python3 scripts/run_benchmarks.py. New pattern shows as NOT_TESTED.'),
            ('Tune thresholds',      'Adjust confidence_threshold until PASS rate ≥ 75% on gold sets.'),
            ('Write tests',          'Add test cases to tests/test_engine.py covering detection and blueprint generation.'),
            ('Submit PR',            'Include: YAML, test results screenshot, benchmark output, gold set IDs.'),
        ], start=1) for item in step(i, t, b)],
        sp(16),

        *H2_NP('Adding a New API Endpoint'), sp(6),
        P('All API endpoints are FastAPI route functions in api/routes/. '
          'Follow the existing patterns: validate with Pydantic, call a service function, '
          'return a typed response model.'),
        sp(8),
        *cb('api/routes/example.py — minimal endpoint pattern', [
            'from fastapi import APIRouter, Depends, HTTPException',
            'from pydantic import BaseModel',
            'from db.database import get_db',
            'from sqlalchemy.orm import Session',
            '',
            'router = APIRouter(prefix="/api/example", tags=["example"])',
            '',
            'class ExampleRequest(BaseModel):',
            '    name: str',
            '    value: float',
            '',
            'class ExampleResponse(BaseModel):',
            '    result: str',
            '    processed: bool = True',
            '',
            '@router.post("/", response_model=ExampleResponse)',
            'async def create_example(',
            '    body: ExampleRequest,',
            '    db: Session = Depends(get_db)',
            ') -> ExampleResponse:',
            '    # Call service layer — never put business logic in routes',
            '    result = example_service.process(db, body.name, body.value)',
            '    return ExampleResponse(result=result)',
        ], lang='python'),
        sp(8),
        *cb('api/main.py — register the router', [
            '# In api/main.py, import and include the new router:',
            'from api.routes.example import router as example_router',
            '',
            'app.include_router(example_router)',
            '# Endpoint is now live at /api/example/',
            '# Visible in Swagger UI at http://localhost:8000/docs',
        ], lang='python'),
        sp(14),
        table([
            ['Convention',        'Rule'],
            ['Route prefix',      'All routes use /api/ prefix. Lab routes use /api/lab/.'],
            ['Auth',              'Lab routes require x-lab-email header checked against LAB_ALLOWED_EMAILS.'],
            ['Error responses',   'Raise HTTPException with status_code and detail. Never return raw strings.'],
            ['Pydantic models',   'Every request body and response is a typed Pydantic model. No bare dicts.'],
            ['DB sessions',       'Always use Depends(get_db). Never import db.engine directly in routes.'],
            ['Idempotency',       'POST endpoints that create resources must be idempotent on duplicate IDs.'],
        ], col_widths=[TW*0.26, TW*0.74]),
        sp(16),

        *H2_NP('Frontend Development'), sp(6),
        P('The frontend is a React 18 SPA built with Vite 5 and Tailwind CSS 3. '
          'The UI proxies all /api/ requests to localhost:8000. Component structure '
          'follows a pages → components → hooks hierarchy.'),
        sp(8),
        *cb('ui/src — component hierarchy', [
            'ui/src/',
            '├── pages/',
            '│   ├── HomePage.tsx          # Entry point — three mode tiles',
            '│   ├── AnalyzePage.tsx        # Upload + recommendation display',
            '│   ├── ShootModePage.tsx      # Step-by-step on-set instructions',
            '│   ├── RecipesPage.tsx        # 13 recipe cards',
            '│   ├── MyKitPage.tsx          # Equipment management',
            '│   ├── SettingsPage.tsx       # User preferences',
            '│   └── LabPage.tsx            # NGW Lab (restricted)',
            '├── components/',
            '│   ├── ui/                    # Primitive UI components',
            '│   ├── analysis/              # Recommendation display cards',
            '│   ├── shoot-mode/            # Step cards, role selector',
            '│   └── lab/                   # Gold set, candidates, signals tabs',
            '└── hooks/',
            '    ├── useAnalysis.ts         # Upload + poll analysis result',
            '    ├── useKit.ts              # My Kit CRUD state',
            '    └── useLabAuth.ts          # Lab email auth state',
        ], lang='shell'),
        sp(10),
        *cb('bash — frontend dev commands', [
            '# Start dev server with HMR',
            '$ cd ui && npm run dev',
            '',
            '# Type-check (no emit)',
            '$ cd ui && npm run typecheck',
            '',
            '# Lint',
            '$ cd ui && npm run lint',
            '',
            '# Production build (outputs to ui/dist/)',
            '$ cd ui && npm run build',
            '',
            '# Preview production build locally',
            '$ cd ui && npm run preview',
        ]),
        sp(14),

        *H2_NP('Test Suite'), sp(6),
        P('The test suite uses pytest with a shared SQLite in-memory database fixture. '
          'Tests are organized by domain and must not require a running server or live VLM calls. '
          'VLM calls are mocked via pytest-mock.'),
        sp(8),
        *cb('tests/ — directory layout', [
            'tests/',
            '├── conftest.py               # Shared fixtures: db, client, mock_vlm',
            '├── test_engine.py            # Pattern detection + blueprint generation',
            '├── test_shoot_match.py       # End-to-end shoot match service',
            '├── test_signals.py           # Signal ingestion, hygiene flags',
            '├── test_candidates.py        # Candidate CRUD and approval workflow',
            '├── test_gold_sets.py         # Gold set CRUD and evaluation',
            '├── test_reference_library.py # Reference library ingestion',
            '├── test_perception_layer.py  # Face validation, edge-case flags',
            '└── test_learning.py          # Failure detection + severity scoring',
        ], lang='shell'),
        sp(8),
        *cb('bash — running tests', [
            '# Full suite (fastest — ~30 s)',
            '$ python3 -m pytest tests/ -q --tb=short',
            '',
            '# Single file with verbose output',
            '$ python3 -m pytest tests/test_engine.py -v',
            '',
            '# One specific test by name',
            '$ python3 -m pytest tests/test_signals.py::test_hygiene_flags -v',
            '',
            '# With coverage report',
            '$ python3 -m pytest tests/ --cov=engine --cov=api --cov-report=term-missing',
            '',
            '# Stop on first failure',
            '$ python3 -m pytest tests/ -x',
        ]),
        sp(10),
        *cb('conftest.py — key fixtures', [
            '@pytest.fixture',
            'def db():',
            '    """In-memory SQLite database, created fresh per test."""',
            '    engine = create_engine("sqlite:///:memory:")',
            '    Base.metadata.create_all(engine)',
            '    with Session(engine) as session:',
            '        yield session',
            '',
            '@pytest.fixture',
            'def mock_vlm(mocker):',
            '    """Patch VLM gateway so tests never make real API calls."""',
            '    return mocker.patch(',
            '        "engine.vlm_adapter.gateway.analyze_image",',
            '        return_value=MOCK_VLM_RESPONSE',
            '    )',
        ], lang='python'),
        sp(14),

        *H2_NP('Benchmark System'), sp(6),
        P('The benchmark system runs the engine against a curated gold set and reports '
          'PASS / SOFT_PASS / FAIL per image. Results gate the CI/CD pipeline — '
          'any regression in gold set score below 75% fails the build.'),
        sp(8),
        *cb('bash — running benchmarks', [
            '# Standard benchmark run (all patterns)',
            '$ python3 scripts/run_benchmarks.py',
            '',
            '# Single pattern only',
            '$ python3 scripts/run_benchmarks.py --pattern loop',
            '',
            '# Gold sets only (skip live-data benchmarks)',
            '$ python3 scripts/run_benchmarks.py --gold-sets-only',
            '',
            '# JSON output for CI parsing',
            '$ python3 scripts/nightly_benchmark.py --output=json > bench.json',
            '',
            '# CI wrapper — exits 1 if any gold set score drops',
            '$ bash scripts/ci_benchmark.sh',
        ]),
        sp(8),
        table([
            ['Result',      'Meaning',                                      'Action Required'],
            ['PASS',        'Detected pattern matches gold label',          'None'],
            ['SOFT_PASS',   'Correct family, minor variant difference',     'Review if count increases'],
            ['FAIL',        'Wrong pattern or confidence below threshold',   'Investigate + file candidate'],
            ['NOT_TESTED',  'Pattern has no gold set images yet',           'Add gold sets via Lab'],
            ['ERROR',       'Engine raised an exception on this image',     'Fix before merging'],
        ], col_widths=[TW*0.16, TW*0.46, TW*0.38]),
        sp(14),

        *H2_NP('Contribution Workflow'), sp(6),
        P('All contributions follow a branch-per-feature workflow with mandatory tests '
          'and benchmark validation before merge. No direct commits to main.'),
        sp(6),
        *[item for i, (t, b) in enumerate([
            ('Branch',          'Create a feature branch: git checkout -b feat/your-description'),
            ('Develop',         'Make changes. Keep commits focused. Run tests frequently with pytest tests/ -q'),
            ('Test',            'All existing tests must pass. New features need new tests. Coverage should not drop.'),
            ('Benchmark',       'Run python3 scripts/run_benchmarks.py. No new FAIL results allowed.'),
            ('Validate YAMLs',  'If blueprints changed: python3 scripts/validate_system_yamls.py --strict'),
            ('Pull Request',    'Open a PR against main. Include benchmark output and test summary in description.'),
            ('Review',          'At least one curator review required. High-risk changes (solver, VLM) need two.'),
            ('Merge',           'Squash-merge after approval. CI re-runs benchmarks as a gate before merge.'),
        ], start=1) for item in step(i, t, b)],
        sp(12),
        callout('What Requires Extra Review', [
            'Changes to engine/solver.py — affects all pattern confidence scores.',
            'Changes to engine/blueprints/*.yaml — affects recommendation output.',
            'Changes to signal inclusion flags — affects learning and metrics eligibility.',
            'New VLM prompts — requires before/after benchmark comparison in PR.',
            'Any change that touches session_signals schema — requires migration script.',
        ], kind='amber')[0],
        sp(16),

        *H2_NP('Environment Setup for New Developers'), sp(6),
        P('New developers need three things: a working Python environment, '
          'a populated database, and access to the AI Gateway.'),
        sp(6),
        *cb('bash — complete new developer setup', [
            '# 1. Clone and enter the repo',
            '$ git clone https://github.com/your-org/ngw-core.git && cd ngw-core',
            '',
            '# 2. Python environment',
            '$ python3 -m venv .venv && source .venv/bin/activate',
            '$ pip install -r requirements.txt',
            '',
            '# 3. Frontend',
            '$ cd ui && npm install && cd ..',
            '',
            '# 4. Copy and fill in the env file',
            '$ cp .env.example .env.local',
            '# Edit .env.local — fill in AI_GATEWAY_API_KEY and your email',
            '',
            '# 5. Initialize and seed the database',
            '$ python3 -c "from db.database import init_db; init_db()"',
            '$ python3 scripts/seed_starter_dataset.py',
            '',
            '# 6. Verify everything works',
            '$ python3 scripts/verify_dataset.py',
            '$ python3 -m pytest tests/ -q',
            '$ python3 scripts/run_benchmarks.py',
            '',
            '# 7. Start development servers',
            '$ uvicorn main:app --reload &',
            '$ cd ui && npm run dev',
        ]),
        sp(12),
        callout('Getting Lab Access', [
            'Lab access requires your email in LAB_ALLOWED_EMAILS. '
            'Ask your team admin to add it and restart the backend.',
            'Then in the app: Settings → Developer Tools → enable, enter your email.',
            'The Lab tab appears immediately.',
        ], kind='green')[0],
    ]
    return s





# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 17 — NGW LAB MANUAL (FULL)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_lab_manual():
    s = cover(17, 'NGW Lab Manual',
              'Signal pipeline, benchmark system v2, reference dataset, VLM architecture, '
              'CLI tools, and complete API reference — for curators and engineers.',
              accent=AMBER)
    s += [
        H2('About This Manual'), sp(6),
        P('The NGW Lab is the quality-control and continuous-improvement backbone of the '
          'No Guesswork engine. Curators use it to record and analyse outcome signals from '
          'real sessions, build and maintain the benchmark test-case library, manage gold-set '
          'reference images, propose and track rule candidates, and run the full suite of '
          'validation scripts. This manual documents every surface, API endpoint, database '
          'table, and CLI tool in the Lab — drawn directly from the source.'),
        sp(10),
        MetricRow([
            ('7-Stage',  'VLM analysis pipeline', AMBER),
            ('19',       'Canonical blueprints',  GREEN),
            ('28',       'Reference patterns',    BLUE),
            ('v2',       'Benchmark system',      MUTED),
        ]),
        sp(14),
        fig('09_lab_tabs_zoom.png', 'NGW Lab — four-tab layout: Workbench, Gold Sets, Candidates, Signals'),
        sp(16),

        *callout('Access Control', [
            'Lab features are gated by NGW_DEV_EMAILS — a comma-separated allowlist in .env.',
            'All Lab API endpoints require a valid JWT whose email appears in NGW_DEV_EMAILS.',
            'Set NGW_DEV_MODE=1 to bypass auth locally. NEVER set this in production.',
            'Enable in UI: Settings → Developer Tools → toggle on → enter your email.',
        ], kind='amber'),
        sp(8),
        table([
            ['Role',            'Auth requirement',                        'Key capability'],
            ['Curator',         'JWT + NGW_DEV_EMAILS listed',             'Gold sets, candidates, benchmarks, signals'],
            ['Second reviewer', 'JWT + NGW_DEV_EMAILS listed',             'Approve high-risk rule candidates'],
            ['CI system',       'X-CI-Secret header or dev JWT',           'POST /api/lab/benchmarks/ci-run'],
            ['Unauthenticated', 'None',                                    'POST /api/lab/signals (session recording)'],
        ], col_widths=[TW*0.18, TW*0.38, TW*0.44]),
        sp(20),
    ]

    # ── SECTION 1: SIGNAL SYSTEM ──────────────────────────────────────────────
    s += [
        *H2_NP('Section 1 — Signal System'), sp(6),
        P('Every user session that produces an outcome is recorded as exactly one signal '
          'in the session_signals table. Signals are the primary data source for calibration '
          'analysis, pattern performance metrics, and automated candidate generation. '
          'The recording call is synchronous — fired at the moment the user submits feedback.'),
        sp(8),
        fig('09_lab_tabs_zoom.png', 'Lab → Signals — hygiene card with live / seeded / internal / analytics-eligible counts'),
        sp(12),

        H3('Signal Schema — session_signals'), sp(6),
        table([
            ['Column',                'Type',     'Description'],
            ['id',                    'TEXT PK',  'Auto UUID hex'],
            ['pattern_id',            'TEXT',     'Pattern attempted — required'],
            ['outcome',               'TEXT',     'nailed_it | close | failed | unknown'],
            ['confidence_score',      'REAL',     'Engine confidence 0.0–1.0'],
            ['input_method',          'TEXT',     'wizard | reference_photo | manual'],
            ['subject_type',          'TEXT',     'woman | man | child | couple | group'],
            ['environment',           'TEXT',     'studio | indoor | outdoor'],
            ['mood',                  'TEXT',     'beauty | cinematic | corporate | editorial | natural'],
            ['shoot_mode_entered',    'INT',      '1 if user opened Shoot Mode for this pattern'],
            ['steps_completed',       'INT',      'Shoot Mode steps finished before feedback'],
            ['steps_total',           'INT',      'Total steps in the assigned sequence'],
            ['deviation_count',       'INT',      'Test-vs-reference evaluation deviations'],
            ['saved_setup',           'INT',      '1 if user saved this setup to My Kit'],
            ['upgraded',              'INT',      '1 if session led to subscription upgrade'],
            ['revenue_value',         'REAL',     'Monetization attribution amount (if upgraded)'],
            ['signal_source',         'TEXT',     'live | seeded | internal | expert_review'],
            ['include_in_learning',   'INT',      'Eligible for candidate auto-generation (default 1)'],
            ['include_in_metrics',    'INT',      'Included in analytics dashboards (default 1)'],
            ['include_in_conversion', 'INT',      'Included in CVR calculations (default 1)'],
            ['include_in_cohorts',    'INT',      'Included in cohort analysis (default 1)'],
            ['session_id',            'TEXT',     'Optional — user session identifier'],
            ['user_id',               'TEXT',     'Optional — user identifier'],
            ['created_at',            'REAL',     'Unix timestamp (unixepoch() default)'],
        ], col_widths=[TW*0.30, TW*0.12, TW*0.58]),
        sp(12),

        H3('Signal Source Taxonomy'), sp(6),
        table([
            ['Source',           'Meaning',                                     'include_in_* default'],
            ['live',             'Real user session — production outcome',       'All = 1 (analytics eligible)'],
            ['seeded',           'Bootstrap data from seed_starter_dataset.py',  'All = 0 (excluded)'],
            ['internal',         'Dev / curator sessions during testing',        'All = 0 (excluded)'],
            ['expert_review',    'Curator-flagged signal with correction',       'All = 0 (manually promoted)'],
        ], col_widths=[TW*0.18, TW*0.48, TW*0.34]),
        sp(8),
        *callout('Analytics Eligibility Rule', [
            'Only signal_source=live rows are included in metrics, conversion, and cohort analysis.',
            'Seeded and internal rows occupy the same table but with all include_in_* = 0.',
            'Expert-reviewed signals can be selectively promoted by setting include_in_learning=1 with a corrected pattern_id.',
            'The hygiene endpoint shows a real-time count of analytics-eligible vs excluded rows.',
        ], kind='blue'),
        sp(12),

        H3('Signal API — Complete Reference'), sp(6),
        *cb('POST /api/lab/signals — record a session signal (public — no auth required)', [
            '{',
            '  "pattern_id":         "rembrandt",',
            '  "outcome":            "nailed_it",   # nailed_it | close | failed | unknown',
            '  "confidence_score":   0.84,',
            '  "input_method":       "reference_photo",',
            '  "subject_type":       "woman",',
            '  "environment":        "studio",',
            '  "mood":               "beauty",',
            '  "shoot_mode_entered": true,',
            '  "steps_completed":    6,',
            '  "steps_total":        6,',
            '  "deviation_count":    0,',
            '  "saved_setup":        true,',
            '  "upgraded":           false,',
            '  "signal_source":      "live"',
            '}',
            '# Response',
            '{ "success": true, "signal_id": "abc123",',
            '  "outcome": "nailed_it", "signal_source": "live" }',
        ], lang='json'),
        sp(8),
        *cb('GET /api/lab/signals/summary — headline KPIs (auth required)', [
            '# Query params: ?days=30&source=live',
            '{',
            '  "total_sessions":   842,',
            '  "success_rate":     0.74,',
            '  "top_pattern":      "loop",',
            '  "worst_pattern":    "broad",',
            '  "conversion_rate":  0.12,',
            '  "avg_confidence":   0.79,',
            '  "revenue_total":    1840.00',
            '}',
        ], lang='json'),
        sp(8),
        *cb('GET /api/lab/signals/patterns — per-pattern aggregation', [
            '# Query params: ?days=30&source=live',
            '# Returns array — one entry per pattern:',
            '{',
            '  "pattern_id":     "loop",',
            '  "success_rate":   0.81,',
            '  "avg_confidence": 0.83,',
            '  "outcomes": { "nailed_it": 48, "close": 22, "failed": 14 },',
            '  "sample_count":   84',
            '}',
        ], lang='json'),
        sp(8),
        *cb('GET /api/lab/signals/calibration — confidence vs outcome mismatch', [
            '# Query params: ?days=30&source=live',
            '# overconfident = true when gap > 0.20',
            '{',
            '  "pattern_id":       "broad",',
            '  "avg_confidence":   0.78,',
            '  "measured_success": 0.55,',
            '  "gap":              0.23,',
            '  "overconfident":    true',
            '}',
        ], lang='json'),
        sp(8),
        *cb('GET /api/lab/signals/recent — latest N signals', [
            '# Query params: ?limit=50&pattern_id=loop&source=live',
            '# Default source=live. Each item:',
            '# signal_id, pattern_id, outcome, confidence_score,',
            '# input_method, environment, created_at, session_id',
        ], lang='json'),
        sp(8),
        *cb('GET /api/lab/signals/hygiene — source breakdown (dev auth required)', [
            '{',
            '  "by_source": {',
            '    "live":          1482,',
            '    "seeded":         500,',
            '    "internal":        23,',
            '    "expert_review":    8',
            '  },',
            '  "analytics_eligible": 1482,',
            '  "flag_overconfident_patterns": ["broad", "clamshell"]',
            '}',
        ], lang='json'),
        sp(8),
        *cb('POST /api/lab/signals/seed — inject 45 bootstrap rows (dev auth)', [
            '# Query params: ?force=true  (required if seeds already exist)',
            '# Inserts 45 synthetic rows with signal_source=seeded',
            '# All include_in_* flags = 0  (excluded from all analytics)',
            '# Response: { "seeded_count": 45, "skipped": 0 }',
        ], lang='json'),
        sp(12),

        H3('How To: Read a Calibration Report'), sp(6),
        *[item for i, (t, b) in enumerate([
            ('Open Lab → Signals',       'Navigate to the Signals tab in the Lab navigation.'),
            ('Select Calibration',       'Tap the Calibration sub-tab — shows confidence vs outcome per pattern.'),
            ('Find overconfident flag',  'overconfident: true means engine confidence is 20+ pp above measured success.'),
            ('Check sample_count',       'Ignore patterns with sample_count < 20. Noise, not signal.'),
            ('Compare the gap',          'gap = avg_confidence − measured_success. Gap > 0.20 = actionable.'),
            ('Create a rule candidate',  'If gap > 0.20 with 20+ samples: document in rule_candidates (Section 3).'),
        ], start=1) for item in step(i, t, b)],
        sp(20),
    ]

    # ── SECTION 2: BENCHMARK SYSTEM v2 ────────────────────────────────────────
    s += [
        *H2_NP('Section 2 — Benchmark System v2'), sp(6),
        P('The benchmark system evaluates engine accuracy against a curated library of test cases. '
          'Each case carries ground-truth expected analysis and expected blueprint geometry. '
          'Results are scored across four weighted dimensions and compared against a pinned '
          'baseline. CI runs block deployment when any gate condition fails.'),
        sp(8),
        fig('07b_settings_lab.png', 'Lab Settings — benchmark thresholds and evaluation gate configuration'),
        sp(12),

        H3('Scoring Model'), sp(6),
        table([
            ['Dimension',         'Weight', 'What it measures',                               'Target'],
            ['pattern_accuracy',  '40%',    'Correct pattern detected vs. expected',           '>= 0.80'],
            ['blueprint_score',   '30%',    'Key/fill geometry matches expected positions',    '>= 0.75'],
            ['fix_score',         '20%',    'Correct fixes proposed for failure-mode cases',   '>= 0.70'],
            ['confidence_error',  '10%',    'abs(predicted_conf - measured_conf)',             '<= 0.15'],
        ], col_widths=[TW*0.24, TW*0.10, TW*0.48, TW*0.18]),
        sp(6),
        P('overall_score = 0.40 * pattern_accuracy + 0.30 * blueprint_score + '
          '0.20 * fix_score + 0.10 * (1.0 - confidence_error)', 'body_muted'),
        sp(12),

        H3('Database Tables'), sp(6),
        table([
            ['Table',               'Primary purpose'],
            ['benchmark_cases',     'Test case library — image_path, expected_analysis, expected_blueprint, difficulty'],
            ['benchmark_runs',      'Run records — timestamps, scores, status, regression_count'],
            ['benchmark_results',   'Per-case result per run — predicted_pattern, all four scores, regression_flag'],
            ['pattern_metrics',     'Rolled-up per-pattern scores with last_updated timestamp'],
            ['gold_set_entries',    'Curator-verified reference images — source material for benchmark cases'],
        ], col_widths=[TW*0.28, TW*0.72]),
        sp(12),

        H3('Benchmark Case Schema — benchmark_cases'), sp(6),
        table([
            ['Column',             'Type',     'Description'],
            ['id',                 'TEXT PK',  'Auto UUID hex'],
            ['pattern_id',         'TEXT',     'Pattern under test'],
            ['image_path',         'TEXT',     'Path to reference photo (required)'],
            ['difficulty',         'TEXT',     'easy | medium | hard  (default: medium)'],
            ['environment_tags',   'JSON',     'Array of environment descriptors'],
            ['expected_analysis',  'JSON',     'Ground-truth: pattern_id, environment, subject_type, skin_tone, mood'],
            ['expected_blueprint', 'JSON',     'Ground-truth: key/fill angle_deg, height, modifier family'],
            ['expected_fixes',     'JSON',     'Array of expected fix recommendations (for failure-mode cases)'],
            ['source_gold_set_id', 'TEXT',     'FK to gold_set_entries (optional — set via from-gold-set promotion)'],
            ['notes',              'TEXT',     'Curator notes'],
            ['created_by',         'TEXT',     'Curator email'],
        ], col_widths=[TW*0.26, TW*0.12, TW*0.62]),
        sp(10),
        *cb('POST /api/lab/benchmarks/cases — create a test case', [
            '{',
            '  "pattern_id":  "loop",',
            '  "image_path":  "data/reference_dataset/loop/gs_001/image.jpg",',
            '  "difficulty":  "medium",',
            '  "environment_tags": ["studio", "low_fill"],',
            '  "expected_analysis": {',
            '    "pattern_id":   "loop",',
            '    "environment":  "studio",',
            '    "subject_type": "woman",',
            '    "skin_tone":    "fair",',
            '    "mood":         "beauty"',
            '  },',
            '  "expected_blueprint": {',
            '    "key":  { "angle_deg": 45, "height": 7.5, "modifier": "octa_90cm" },',
            '    "fill": { "side": "camera_left", "type": "reflector" }',
            '  },',
            '  "expected_fixes": [],',
            '  "notes":      "Classic loop. Clean catch-light. No ceiling bounce.",',
            '  "created_by": "curator@org.com"',
            '}',
            '# Response: { "id": "case_uuid", "pattern_id": "loop", "difficulty": "medium" }',
        ], lang='json'),
        sp(8),
        *cb('POST /api/lab/benchmarks/cases/from-gold-set/{id} — promote gold set entry to case', [
            '# No request body. Fields inferred from gold_set_entries.expected_analysis.',
            '# Sets: source_gold_set_id, expected_analysis, image_path automatically.',
            '# Response: New benchmark_case record with all inferred fields populated.',
        ], lang='json'),
        sp(12),

        H3('Running Benchmarks'), sp(6),
        *cb('POST /api/lab/benchmarks/run — trigger a manual run', [
            '{',
            '  "run_type":   "manual",',
            '  "trigger":    "curator@org.com",',
            '  "case_limit":  null,',
            '  "notes":      "Pre-deploy validation after loop threshold change."',
            '}',
            '',
            '# Response (summarised):',
            '{',
            '  "run_id":              "run_uuid",',
            '  "status":              "completed",',
            '  "total_cases":         28,',
            '  "passed_cases":        25,',
            '  "overall_score":       0.871,',
            '  "pattern_accuracy":    0.893,',
            '  "avg_blueprint_score": 0.842,',
            '  "confidence_error":    0.118,',
            '  "regression_count":    0,',
            '  "blocked":             false',
            '}',
        ], lang='json'),
        sp(8),
        *cb('POST /api/lab/benchmarks/ci-run — CI/CD integration (X-CI-Secret or dev JWT)', [
            '# Automatically sets run_type=ci, trigger=ci-system',
            '# Response includes exit_code field for shell integration:',
            '{ "status": "completed", "exit_code": 0,',
            '  "overall_score": 0.871, "message": "All gates passed" }',
            '',
            '# exit_code = 1 when ANY of these conditions is true:',
            '#   overall_score < 0.70',
            '#   any single pattern passes < 75% of its cases',
            '#   regression vs baseline > 5 percentage points',
        ], lang='json'),
        sp(8),
        *cb('GET /api/lab/benchmarks/runs/{id}/results — per-case detail (sorted worst-first)', [
            '# Each result:',
            '{',
            '  "case_id":          "case_uuid",',
            '  "pattern_id":       "broad",',
            '  "difficulty":       "hard",',
            '  "predicted_pattern":"loop",',
            '  "pattern_correct":  false,',
            '  "blueprint_score":  0.62,',
            '  "fix_score":        0.50,',
            '  "confidence_error": 0.24,',
            '  "final_score":      0.577,',
            '  "regression_flag":  true,',
            '  "error_msg":        "Pattern mismatch: expected broad, got loop"',
            '}',
        ], lang='json'),
        sp(8),
        *cb('GET /api/lab/benchmarks/baseline  +  POST to promote', [
            '# GET — check current baseline',
            '{ "has_baseline": true, "baseline": {',
            '    "run_id": "run_uuid",',
            '    "overall_score": 0.871,',
            '    "pattern_accuracy": 0.893,',
            '    "set_at": 1742000000 } }',
            '',
            '# POST — promote latest completed run to active baseline',
            '# Body: {}  (no parameters)',
            '# Only promote when regression_count = 0 and overall_score >= previous baseline.',
        ], lang='json'),
        sp(8),
        *callout('CI Gate Rules (Never Bypass)', [
            'overall_score < 0.70 → exit_code 1, deploy blocked.',
            'Any pattern: pass rate < 75% → exit_code 1, deploy blocked.',
            'Regression vs baseline > 5pp → exit_code 1, deploy blocked.',
            'Never promote a baseline with regression_count > 0.',
        ], kind='red'),
        sp(12),

        H3('How To: Add a Benchmark Case'), sp(6),
        *[item for i, (t, b) in enumerate([
            ('Choose reference image',    'Clean, unedited photo with clear lighting geometry. Min 1024px wide.'),
            ('Confirm ground truth',      'Note actual setup: key angle, height, modifier, fill side, ratio.'),
            ('POST the case',             'POST /api/lab/benchmarks/cases with all expected_* fields populated.'),
            ('Set difficulty honestly',   'easy = textbook; medium = real-world; hard = ambiguous or edge-case.'),
            ('Or promote from gold set',  'POST /api/lab/benchmarks/cases/from-gold-set/{id} auto-infers fields.'),
            ('Run targeted eval',         'POST /api/lab/benchmarks/run with case_limit=1 to verify it scores correctly.'),
            ('Check pattern_correct',     'GET /api/lab/benchmarks/runs/{id}/results — confirm pattern_correct: true.'),
        ], start=1) for item in step(i, t, b)],
        sp(20),
    ]

    # ── SECTION 3: GOLD SETS & RULE CANDIDATES ────────────────────────────────
    s += [
        *H2_NP('Section 3 — Gold Sets & Rule Candidates'), sp(6),
        P('Gold set entries are curator-verified reference images with ground-truth metadata. '
          'They feed benchmark cases via the from-gold-set promotion API and supply evidence '
          'for rule candidates. Rule candidates are structured improvement proposals derived '
          'from calibration gaps, benchmark failures, or direct curator observation.'),
        sp(8),
        fig('02_gold_set.png', 'Gold Set listing — images with pattern labels, status, and linked benchmark case count'),
        sp(12),
        fig('03_gold_set_new.png', 'New Gold Set form — image path, pattern, expected_analysis JSON, and curator notes'),
        sp(12),

        H3('Gold Set Entry Schema — gold_set_entries'), sp(6),
        table([
            ['Column',             'Type',     'Description'],
            ['id',                 'TEXT PK',  'Auto UUID hex'],
            ['image_path',         'TEXT',     'Path to the verified photograph (required)'],
            ['expected_analysis',  'JSON',     'Ground-truth object (see field list below)'],
            ['notes',              'TEXT',     'Curator observation notes'],
            ['status',             'TEXT',     'draft | approved | rejected'],
            ['created_by',         'TEXT',     'Curator email'],
            ['created_at',         'REAL',     'Unix timestamp'],
            ['updated_at',         'REAL',     'Unix timestamp (updated on status change)'],
        ], col_widths=[TW*0.24, TW*0.12, TW*0.64]),
        sp(8),
        *cb('expected_analysis — all supported fields', [
            '{',
            '  "expected_pattern":  "rembrandt",',
            '  "lighting_family":   "directional",',
            '  "pattern_id":        "rembrandt",',
            '  "key_light":   { "position": "45deg", "modifier": "beauty_dish", "power": 1.0 },',
            '  "fill_light":  { "position": "camera_left", "modifier": "reflector", "power": 0.25 },',
            '  "rim_light":   { "position": "rear_right", "modifier": "strip_box", "power": 0.50 },',
            '  "environment":  "studio",',
            '  "subject_type": "woman",',
            '  "skin_tone":    "fair",',
            '  "mood":         "editorial"',
            '}',
        ], lang='json'),
        sp(12),

        H3('Rule Candidate Schema — rule_candidates'), sp(6),
        table([
            ['Column',              'Type',     'Description'],
            ['id',                  'TEXT PK',  'Auto UUID hex'],
            ['title',               'TEXT',     'Concise rule description (required)'],
            ['description',         'TEXT',     'Full rule specification (required)'],
            ['rationale',           'TEXT',     'Evidence: calibration data, benchmark case IDs, gold set IDs'],
            ['source_gold_set_id',  'TEXT',     'Optional FK to gold_set_entries'],
            ['proposed_change',     'TEXT',     'Concrete JSON delta or patch specification'],
            ['status',              'TEXT',     'proposed | under_review | approved | deployed'],
            ['created_by',          'TEXT',     'Contributor email'],
            ['created_at',          'REAL',     'Unix timestamp'],
        ], col_widths=[TW*0.26, TW*0.12, TW*0.62]),
        sp(8),
        fig('04_candidates.png', 'Candidates queue — proposed, under_review, approved, and deployed entries with status badges'),
        sp(12),
        fig('05_candidates_new.png', 'New Candidate form — title, description, rationale, proposed_change JSON, and linked gold set'),
        sp(12),

        H3('Candidate Lifecycle'), sp(6),
        table([
            ['Status',        'Meaning',                                       'Who moves it'],
            ['proposed',      'New — awaiting curator review',                 'Creator submits'],
            ['under_review',  'Active review in progress',                     'Curator sets'],
            ['approved',      'Accepted — ready for engine implementation',    'Curator approves'],
            ['deployed',      'Change live in production engine',              'Developer deploys'],
        ], col_widths=[TW*0.18, TW*0.50, TW*0.32]),
        sp(8),
        *callout('Candidate Best Practices', [
            'Every candidate must cite evidence: signal calibration data, case IDs, or gold set IDs.',
            'proposed_change should be a concrete JSON delta — not vague description.',
            'Run a full benchmark AFTER implementing an approved candidate before marking deployed.',
            'If benchmark regresses after implementation: revert candidate status to proposed and add regression note.',
        ], kind='amber'),
        sp(20),
    ]

    # ── SECTION 4: REFERENCE DATASET ─────────────────────────────────────────
    s += [
        *H2_NP('Section 4 — Reference Dataset'), sp(6),
        P('The reference dataset is the curated library of labeled exemplar images that '
          'anchors the reference_read classifier — the highest-priority of the three active '
          'pattern-resolution classifiers. The engine loads the dataset at startup and '
          'queries it during every analysis. 28 canonical patterns are covered across '
          'three quality tiers.'),
        sp(8),
        fig('04_ref_dataset.png', 'Reference Dataset — grid view with 28-pattern coverage map, tier badges, and approval status'),
        sp(12),
        fig('06_ref_dataset.png', 'Reference Dataset detail — image with metadata, trust score, and ground_truth structure'),
        sp(12),

        H3('28 Canonical Patterns'), sp(6),
        table([
            ['Family',             'Patterns'],
            ['Portrait (studio)',  'loop, rembrandt, butterfly, clamshell, split, broad, short, paramount'],
            ['Portrait (natural)', 'window_portrait, golden_hour, overcast_natural'],
            ['Fashion / high-key', 'beauty, high_key_white, glamour, editorial_dramatic'],
            ['Cinematic / moody',  'noir, chiaroscuro, low_key_dramatic'],
            ['Environmental',      'silhouette, rim_backlit, hair_light_separation'],
            ['Multi-light',        'three_point, cross_lighting, kicker_accent'],
            ['Specialty',          'catchlight_accent, ambient_fill_dominant, mixed_source'],
        ], col_widths=[TW*0.26, TW*0.74]),
        sp(10),

        H3('Dataset Entry Metadata Schema'), sp(6),
        *cb('data/reference_dataset/{pattern}/{id}/metadata.json', [
            '{',
            '  "reference_id":      "loop_gold_001",',
            '  "pattern_id":        "loop",',
            '  "photographer":      "curator@org.com",',
            '  "dataset_tier":      "gold",          # gold | community | synthetic',
            '  "entry_trust_score":  0.90,            # gold default 0.9, community 0.7',
            '  "approval_status":   "approved",       # draft | approved | rejected',
            '  "environment":       "studio",',
            '  "source_type":       "original",',
            '  "light_count":        2,',
            '  "key_direction_deg":  45,',
            '  "shadow_pattern":    "loop",',
            '  "notes":             "Clean catch-light 10 oclock. No ceiling bounce.",',
            '  "ground_truth": {',
            '    "pattern":       "loop",',
            '    "key_angle_deg":  45,',
            '    "key_height":     7.5,',
            '    "fill_ratio":     2.8,',
            '    "modifier_family":"octa"',
            '  },',
            '  "benchmark_metadata": {',
            '    "difficulty":             "medium",',
            '    "category":               "standard",',
            '    "expected_key_direction":  315',
            '  }',
            '}',
        ], lang='json'),
        sp(10),

        H3('Dataset Tier Reference'), sp(6),
        table([
            ['Tier',        'Trust score', 'Approval',              'Source'],
            ['gold',        '0.90',        'Dual curator required',  'Known ground-truth, controlled studio setup'],
            ['community',   '0.70',        'Single curator',         'User-contributed, curator-verified'],
            ['synthetic',   '0.70',        'None required',          'Generated by seed_starter_dataset.py'],
        ], col_widths=[TW*0.14, TW*0.14, TW*0.24, TW*0.48]),
        sp(8),

        H3('key_direction_deg Convention'), sp(6),
        table([
            ['Direction label',   'key_direction_deg', 'Typical pattern'],
            ['upper_left',        '315 deg',            'Rembrandt / loop (camera-right side)'],
            ['upper_right',       '45 deg',             'Loop alternate (camera-left side)'],
            ['left',              '270 deg',            'Hard split (camera right)'],
            ['right',             '90 deg',             'Hard split alternate (camera left)'],
            ['top_center',        '0 deg',              'Butterfly / paramount'],
            ['center / unknown',  'null',               'Ambiguous — omit from geo inference'],
        ], col_widths=[TW*0.24, TW*0.20, TW*0.56]),
        sp(8),
        *callout('Required Metadata Fields', [
            'REQUIRED_META_FIELDS: reference_id, pattern_id, dataset_tier, entry_trust_score.',
            'verify_dataset.py checks these fields on every entry. Missing = exit code 1.',
            'VALID_TIERS: gold | community | synthetic.',
            'VALID_APPROVAL: draft | approved | rejected. Never skip draft before approval.',
        ], kind='blue'),
        sp(20),
    ]

    # ── SECTION 5: VLM ANALYSIS PIPELINE ─────────────────────────────────────
    s += [
        *H2_NP('Section 5 — VLM Analysis Pipeline'), sp(6),
        P('Every reference photo analysis runs through a deterministic 7-stage pipeline. '
          'The VLM is never asked to name a lighting setup — it extracts observable physical '
          'signals only. Pattern determination uses three independent classifiers whose '
          'outputs are resolved by the solver chain.'),
        sp(8),
        fig('08_workbench_ready.png', 'Workbench — debug overlay showing vision pipeline region annotations'),
        sp(12),
        fig('10_workbench_detail.png', 'Workbench detail — solver chain scores and per-classifier confidence breakdown'),
        sp(12),

        H3('7-Stage Pipeline'), sp(6),
        table([
            ['Stage', 'Module',                         'What it does'],
            ['1',     'engine/vlm.py',                  'VLM call 1 — extract observable signals: shadow, catchlight, geometry, highlights'],
            ['2',     'engine/vision_pipeline.py',      '16+ CV passes — geometric, photometric, and semantic cue extraction'],
            ['3',     'engine/cue_inference.py',        '4-stage inference: geometry → source quality → environment → setup family'],
            ['4',     'engine/vlm_reconstruction.py',   'VLM call 2 — reason about signals, build reconstruction candidates'],
            ['5',     'engine/orchestrator.py',         'Solver chain: consensus → consistency → contradiction → simulator → validator'],
            ['6',     'engine/orchestrator.py',         'Pattern resolution: 3 active classifiers → ranked candidates'],
            ['7',     'engine/reference_read.py',       'Reference read: cross-validate with dataset → authoritative_pattern'],
        ], col_widths=[TW*0.06, TW*0.32, TW*0.62]),
        sp(12),

        H3('Stage 1 — VLM Signal Extraction'), sp(6),
        P('The first VLM call uses a system prompt that explicitly restricts the model to '
          'observable physical signals only: shadow edges, catchlight shape and position, '
          'highlight geometry, colour temperature context. It must never name a setup.'),
        sp(6),
        table([
            ['Output',           'Fields'],
            ['VLMDescription',   'subject_type, skin_tones, framing, pose, expression, styling, mood'],
            ['VLMSignals',       'geometry, shadows, highlights, catchlights (all physical observables)'],
        ], col_widths=[TW*0.24, TW*0.76]),
        sp(6),
        P('Provider selection: VLM_PROVIDER=auto detects openai first, then anthropic. '
          'Default models: GPT-4.1 (OpenAI) | claude-sonnet-4-20250514 (Anthropic). '
          'Set VLM_PROVIDER=none to disable VLM and fall back to rule-based only.', 'body_muted'),
        sp(12),

        H3('Stage 2 — Vision Pipeline (16+ Passes)'), sp(6),
        table([
            ['Pass group',    'Passes included'],
            ['Geometry',      'geometry_pass, pose_solver_pass, inverse_square_solver_pass'],
            ['Shadow',        'shadow_pass, shadow_penumbra_pass, occlusion_shadow_pass, multi_shadow_analysis'],
            ['Light source',  'highlight_pass, specular_surface_pass, light_direction_field_pass'],
            ['Catchlight',    'catchlight_pass (shape, topology, position — all three separate cues)'],
            ['Environment',   'background_pass, window_geometry_pass, solar_geometry_pass, environment_light_pass'],
            ['Modifier',      'modifier_shape_solver_pass, color_temperature_pass, bounce_geometry_pass'],
            ['Composite',     'light_role_support_signals, global_uncertainty_notes'],
        ], col_widths=[TW*0.22, TW*0.78]),
        sp(6),
        P('Output: VisualCueReport with 15+ structured cue objects — ShadowEdgeHardness, '
          'PrimaryShadowDirection, VerticalLightAngle, CatchlightPosition, CatchlightShape, '
          'CatchlightTopology, HighlightGeometry, ReflectionSignatures, BackgroundAnalysis, '
          'EnvironmentIndicators, ColorTemperatureContext, LightCountSignals, '
          'MultiShadowAnalysis, OcclusionPatterns, CompositeConfidence.', 'body_muted'),
        sp(12),

        H3('Stage 3 — 4-Stage Cue Inference'), sp(6),
        table([
            ['Inference stage',         'Output'],
            ['GeometryInference',        'Light direction, height, count, fill ratio, shadow pattern'],
            ['SourceQualityInference',   'Modifier family, transition character (soft / hard)'],
            ['EnvironmentInference',     'Natural vs studio, background type, special cases'],
            ['SetupFamilyInference',     'Primary hypothesis + alternate patterns + ambiguity notes'],
        ], col_widths=[TW*0.32, TW*0.68]),
        sp(12),

        H3('Stage 4 — VLM Reconstruction (12 Dimensions)'), sp(6),
        table([
            ['Reconstruction dimension',      'Description'],
            ['Dominant source direction',       'Clock-position estimate from shadow + catchlight geometry'],
            ['Dominant source height',          'Vertical elevation inference (low / eye / high)'],
            ['Source size class',               'Large-soft / medium / small-hard modifier inference'],
            ['Source distance class',           'Near / mid / far placement inference'],
            ['Modifier family candidates',      'Octa / umbrella / dish / strip / bare / window (ranked)'],
            ['Environment',                     'Studio / natural / mixed / outdoor'],
            ['Light count',                     'Single / two-light / multi-light inference'],
            ['Light roles',                     'Key / fill / rim / hair / background role assignment'],
            ['Negative fill likelihood',         'Probability that fill side uses absorption (black v-flat)'],
            ['Background lighting likelihood',  'Probability of a dedicated background light'],
            ['Bounce likelihood',               'Probability of bounce fill or ceiling bounce contamination'],
            ['Ambiguity assessment',             'Structured uncertainty notes propagated to solver chain'],
        ], col_widths=[TW*0.38, TW*0.62]),
        sp(12),

        H3('Stage 5 — Solver Chain'), sp(6),
        table([
            ['Solver',               'Role'],
            ['consensus_solver',     'Aggregate classifier outputs into weighted consensus scores'],
            ['consistency_engine',   'Verify cue combinations obey physical lighting constraints'],
            ['contradiction_engine', 'Flag and resolve contradictory cue pairs'],
            ['lighting_simulator',   'Forward-simulate candidate patterns against the full cue report'],
            ['hypothesis_validator', 'Score each hypothesis against all available evidence'],
            ['solver_trace',         'Append full reasoning chain to output — never replaces upstream data'],
        ], col_widths=[TW*0.28, TW*0.72]),
        sp(12),

        H3('Stage 6 — 3-Classifier Pattern Resolution'), sp(6),
        P('resolve_pattern_candidates() in engine/orchestrator.py runs three independent '
          'classifiers in strict priority order. Higher priority wins on ties.'),
        sp(6),
        table([
            ['Priority',  'Classifier',           'Method',                              'Evidence used'],
            ['0 (high)',   'reference_read',       'build_lighting_read()',               '3-layer shadow/highlight/gobo vs dataset'],
            ['1',          'catchlight_inference', '_infer_pattern_from_catchlights()',   'Catchlight topology, shape, and count'],
            ['2',          'shadow_inference',     '_infer_shadow_pattern()',             'Shadow direction + vertical height angle'],
            ['fallback',   'rule-based',           'classify_lighting_pattern()',         'Mood + modifier + gear (no-image paths only)'],
        ], col_widths=[TW*0.12, TW*0.22, TW*0.30, TW*0.36]),
        sp(8),

        H3('AnalysisResult Output Structure'), sp(6),
        *cb('engine/image_analysis_models.py — AnalysisResult', [
            '{',
            '  "authoritative_pattern": "loop",',
            '  "pattern_candidates":    [{"pattern":"loop","score":0.84},{"pattern":"rembrandt","score":0.11}],',
            '  "confidence_score":      0.84,',
            '  "visual_cue_report":     { /* 15+ VisualCue objects */ },',
            '  "solver_quality": {',
            '    "consistency_score":   0.91,',
            '    "contradiction_count": 0,',
            '    "ambiguity_level":     "low"',
            '  },',
            '  "reference_data": { "matched_entries": [...], "dataset_tier": "gold" },',
            '  "reconstruction": {',
            '    "primary":   { "direction": "upper_left", "height": 7.5, "modifier": "octa" },',
            '    "alternates": [...],',
            '    "uncertainty_notes": []',
            '  }',
            '}',
        ], lang='json'),
        sp(20),
    ]

    # ── SECTION 6: BLUEPRINT SYSTEM ──────────────────────────────────────────
    s += [
        *H2_NP('Section 6 — Blueprint System'), sp(6),
        P('Blueprints are the output specification layer — 19 YAML files in '
          'data/systems/canonical/ that map a resolved pattern to exact physical light '
          'placement instructions with capture settings, failure modes, and substitution '
          'guidance. Loaded at startup, validated by validate_system_yamls.py.'),
        sp(8),

        H3('Complete Blueprint YAML Schema'), sp(6),
        *cb('data/systems/canonical/{pattern}.yml  (part 1 — header + environment + camera)', [
            'pattern:      loop',
            'pattern_name: Loop',
            'category:     portrait',
            'difficulty:   medium        # easy | medium | hard',
            'setup_time_minutes: 8',
            'version: "1.0"',
            'status: "active"            # active | experimental | deprecated',
            '',
            'environment:',
            '  required: false',
            '  ceiling_height_min_ft: 9.0',
            '  background: seamless',
            '  background_distance_ft: 6.0',
            '',
            'subject:',
            '  distance_from_camera_ft: 8.0',
            '  position: center',
            '',
            'camera:',
            '  height: 5.5',
            '  lens: 85mm',
            '  angle_to_subject_deg: 0.0',
            '',
            'capture_settings:',
            '  iso:           100-400',
            '  aperture:      f/2.8-f/8',
            '  shutter:       1/125-1/250',
            '  white_balance: 5500K',
            '  notes: ["Meter off subject face"]',
        ], lang='yaml'),
        sp(6),
        *cb('data/systems/canonical/{pattern}.yml  (part 2 — lights + shadow + failure + substitutions)', [
            'lights:              # Array — at least one role:key required',
            '  - role: key',
            '    modifier: octa_90cm',
            '    angle_deg: 45     # horizontal off-axis (0=front, 90=hard side)',
            '    height: 7.5       # feet above floor',
            '    height_offset_in: 0',
            '    distance_ft: 6.0',
            '    power_ratio: 1.0  # relative to key (key always 1.0)',
            '    notes: ["Catch-light should appear at 2 oclock"]',
            '  - role: fill',
            '    modifier: v_flat_white',
            '    angle_deg: 315',
            '    height: 5.5',
            '    distance_ft: 4.0',
            '    power_ratio: 0.33',
            '',
            'shadow_signature:',
            '  expected_pattern: loop',
            '  nose_shadow:  "Loop below and to the side of nose"',
            '  cheek_shadow: "Triangle shadow fill side"',
            '  contrast: 0.65    # 0=flat, 1=maximum',
            '  softness: 0.70    # 0=hard, 1=very soft',
            '',
            'failure_modes:',
            '  - name: flat_lighting',
            '    description: "Fill too bright, loop shadow disappears"',
            '    recovery:    "Move fill back or reduce fill power by 1 stop"',
            '',
            'substitutions:',
            '  - if_missing:  octa_90cm',
            '    use:          umbrella_60cm',
            '    tradeoff:     "Slightly harder transition, shadow stays visible"',
            '',
            'use_cases: ["Portrait", "Editorial", "Headshots"]',
            'example_photographers: ["Platon", "Annie Leibovitz"]',
        ], lang='yaml'),
        sp(10),
        *callout('Clock-Position Convention', [
            'angle_deg = horizontal off-axis from camera forward. 0 = directly in front.',
            '45 deg = upper right of subject (camera right side). Catch-light at ~2 oclock.',
            '315 deg = upper left of subject (camera left side). Catch-light at ~10 oclock.',
            '90 deg = hard side-light. 270 deg = hard side-light (opposite).',
            'power_ratio is relative: key = 1.0 always. Fill at 0.33 = 1.6 stop under key.',
        ], kind='blue'),
        sp(12),

        H3('19 Active Blueprint Files'), sp(6),
        table([
            ['File',                       'Pattern',             'Difficulty', 'Light count'],
            ['loop.yml',                   'Loop',                'medium',     '2 (key + fill)'],
            ['rembrandt.yml',              'Rembrandt',           'medium',     '2 (key + reflector)'],
            ['butterfly.yml',              'Butterfly / Paramount','easy',      '1-2 (frontal key)'],
            ['clamshell.yml',              'Clamshell',           'medium',     '2 (top key + bottom fill)'],
            ['split.yml',                  'Split',               'easy',       '1 (hard 90 deg)'],
            ['broad.yml',                  'Broad',               'easy',       '2 (key shadow-side visible)'],
            ['short.yml',                  'Short',               'medium',     '2 (key lit-side hidden)'],
            ['beauty.yml',                 'Beauty',              'hard',       '3-4 (dish, fill, kicker)'],
            ['window_portrait.yml',        'Window Portrait',     'easy',       '1 (natural window)'],
            ['three_point.yml',            'Three-Point',         'medium',     '3 (key, fill, rim)'],
            ['editorial_dramatic.yml',     'Editorial Dramatic',  'hard',       '2-3 (hard key + accent)'],
            ['noir.yml',                   'Noir',                'hard',       '1-2 (hard low-key)'],
            ['high_key_white.yml',         'High Key White',      'medium',     '4+ (key + bg lights)'],
            ['rim_backlit.yml',            'Rim / Backlit',       'medium',     '2 (rim + fill)'],
            ['cross_lighting.yml',         'Cross Lighting',      'medium',     '2 (crossed 90 deg)'],
            ['chiaroscuro.yml',            'Chiaroscuro',         'hard',       '1 (dramatic shadow)'],
            ['kicker_accent.yml',          'Kicker Accent',       'medium',     '3 (key, fill, kicker)'],
            ['golden_hour.yml',            'Golden Hour',         'easy',       '1 (natural warm)'],
            ['ambient_fill_dominant.yml',  'Ambient Fill',        'easy',       '0 (natural ambient)'],
        ], col_widths=[TW*0.36, TW*0.28, TW*0.14, TW*0.22]),
        sp(20),
    ]

    # ── SECTION 7: CLI TOOLS ─────────────────────────────────────────────────
    s += [
        *H2_NP('Section 7 — CLI Tools'), sp(6),
        P('All Lab operations can be driven from scripts/. Every script exits 0 on '
          'success and 1 on failure, enabling clean CI pipelines.'),
        sp(8),
        fig('07c_settings_devtools.png', 'Dev Tools panel — database status, migration runner, and signal count monitor'),
        sp(12),

        H3('verify_dataset.py'), sp(6),
        table([
            ['Flag',     'Effect'],
            ['(none)',   'Full verification: all 28 patterns, image IO, metadata schema'],
            ['--quick',  'Metadata-only — skip image file reads (faster for CI)'],
            ['--fix',    'Auto-fix: regenerate thumbnails, rebuild manifest, reset bad fields'],
        ], col_widths=[TW*0.20, TW*0.80]),
        sp(6),
        *cb('bash — verify_dataset.py', [
            '# Full verification',
            '$ python3 scripts/verify_dataset.py',
            '',
            '# Quick metadata check (no image IO)',
            '$ python3 scripts/verify_dataset.py --quick',
            '',
            '# Auto-fix minor issues',
            '$ python3 scripts/verify_dataset.py --fix',
            '',
            '# Checks: all 28 CANONICAL_PATTERNS present; REQUIRED_META_FIELDS',
            '# present; valid dataset_tier and approval_status values;',
            '# coverage report with missing_high_priority patterns.',
            '# Exit 0 = PASS.  Exit 1 = FAIL (CI-safe).',
        ]),
        sp(12),

        H3('seed_starter_dataset.py'), sp(6),
        table([
            ['Flag',               'Effect'],
            ['(none)',             'Seed all benchmark entries into data/reference_dataset/'],
            ['--dry-run',          'Preview — no disk writes'],
            ['--force',            'Overwrite existing entries (use after schema changes)'],
            ['--filter SUBSTRING', 'Only process benchmark IDs containing SUBSTRING'],
        ], col_widths=[TW*0.28, TW*0.72]),
        sp(6),
        *cb('bash — seed_starter_dataset.py', [
            '# Normal seed (first run after init_db)',
            '$ python3 scripts/seed_starter_dataset.py',
            '',
            '# Preview without writing',
            '$ python3 scripts/seed_starter_dataset.py --dry-run',
            '',
            '# Force-overwrite (after schema change)',
            '$ python3 scripts/seed_starter_dataset.py --force',
            '',
            '# Seed only loop pattern entries',
            '$ python3 scripts/seed_starter_dataset.py --filter loop',
            '',
            '# Writes: image.jpg + metadata.json per entry,',
            '# 200x200 thumbnails, _version.json, manifest with pattern_coverage.',
            '# Seeded signals: signal_source=seeded, all include_in_*=0.',
        ]),
        sp(12),

        H3('validate_system_yamls.py'), sp(6),
        *cb('bash — validate_system_yamls.py', [
            '# Validate all 19 canonical blueprint YAMLs',
            '$ python3 scripts/validate_system_yamls.py',
            '',
            '# Strict mode — fail on warnings (use before PR merge)',
            '$ python3 scripts/validate_system_yamls.py --strict',
            '',
            '# Required fields checked:',
            '#   pattern, pattern_name, category, difficulty, version, status',
            '#   environment.ceiling_height_min_ft',
            '#   lights[] array with at least one role=key entry',
            '#   lights[].angle_deg, height, distance_ft, power_ratio',
            '#   shadow_signature.expected_pattern, contrast, softness',
            '#   failure_modes[] with at least one entry',
        ]),
        sp(12),

        H3('Full Script Reference'), sp(6),
        table([
            ['Script',                        'Purpose',                                   'Key flags'],
            ['verify_dataset.py',              'Dataset integrity check',                   '--quick, --fix'],
            ['seed_starter_dataset.py',        'Bootstrap synthetic reference data',        '--dry-run, --force, --filter'],
            ['validate_system_yamls.py',       'Lint all 19 blueprint YAML files',          '--strict'],
            ['validate_catalog_and_packs.py',  'Validate gear catalog completeness',        '--verbose'],
            ['run_benchmarks.py',              'Pattern accuracy evaluation (manual)',      '--pattern=X, --limit=N'],
            ['nightly_benchmark.py',           'Full CI benchmark suite (JSON output)',     '--output=json'],
            ['ci_benchmark.sh',                'CI wrapper — exits 1 on regression',       '--exclude-pattern=X'],
            ['capture_screenshots.py',         'Auto-capture UI screenshots for docs',     '--output-dir=PATH'],
            ['generate_ngw_docs.py',           'Build this PDF documentation suite',       '(none)'],
            ['generate_lab_manual.py',         'Build standalone Lab Manual PDF',          '(none)'],
        ], col_widths=[TW*0.32, TW*0.42, TW*0.26]),
        sp(20),
    ]

    # ── SECTION 8: ENVIRONMENT CONFIGURATION ─────────────────────────────────
    s += [
        *H2_NP('Section 8 — Environment Configuration'), sp(6),
        P('NGW uses a single .env at the project root. Copy .env.example and fill in '
          'values before starting. Never commit .env to version control.'),
        sp(8),

        H3('.env Variable Reference'), sp(6),
        table([
            ['Variable',           'Required',  'Description',                                        'Default'],
            ['NGW_JWT_SECRET',      'Yes',       'JWT signing secret for Lab API auth',                'change-me'],
            ['NGW_DEV_EMAILS',      'Yes',       'Comma-separated Lab access allowlist',               '(none)'],
            ['NGW_DEV_MODE',        'No',        'Bypass JWT auth locally. NEVER in prod.',            '0'],
            ['VLM_PROVIDER',        'No',        'auto | openai | anthropic | none',                   'auto'],
            ['VLM_MODEL',           'No',        'Override default model name',                        'gpt-4.1'],
            ['OPENAI_API_KEY',      'Cond.',     'Required if VLM_PROVIDER=openai or auto+OpenAI',     '(none)'],
            ['ANTHROPIC_API_KEY',   'Cond.',     'Required if VLM_PROVIDER=anthropic or auto+Anthropic','(none)'],
            ['ALLOWED_ORIGINS',     'No',        'CORS origins, comma-separated',                      'localhost:5173'],
            ['LOG_LEVEL',           'No',        'DEBUG | INFO | WARNING | ERROR',                     'INFO'],
            ['HOST',                'No',        'Server bind address',                                '0.0.0.0'],
            ['PORT',                'No',        'Server port',                                        '8000'],
        ], col_widths=[TW*0.26, TW*0.10, TW*0.44, TW*0.20]),
        sp(10),
        *callout('VLM_PROVIDER=auto Behaviour', [
            'auto checks OPENAI_API_KEY first, then ANTHROPIC_API_KEY.',
            'First key found determines which provider is used for the session.',
            'Set VLM_PROVIDER=none to disable VLM — analysis returns rule-based results only.',
            'VLM_MODEL override is optional. Defaults: GPT-4.1 (OpenAI) | claude-sonnet-4-20250514 (Anthropic).',
        ], kind='blue'),
        sp(12),

        H3('Server Startup Sequence'), sp(6),
        *cb('bash — full first-time startup', [
            '# 1. Copy .env and fill in required values',
            '$ cp .env.example .env',
            '',
            '# Minimum required entries in .env:',
            '#   NGW_JWT_SECRET=your-secret-here',
            '#   NGW_DEV_EMAILS=your@email.com',
            '#   OPENAI_API_KEY=sk-...  (or ANTHROPIC_API_KEY)',
            '',
            '# 2. Install Python dependencies',
            '$ pip install -r requirements.txt',
            '',
            '# 3. Initialise the database',
            '$ python3 -c "from db.database import init_db; init_db()"',
            '',
            '# 4. Seed starter data',
            '$ python3 scripts/seed_starter_dataset.py',
            '',
            '# 5. Verify dataset integrity',
            '$ python3 scripts/verify_dataset.py',
            '',
            '# 6. Validate blueprint YAMLs',
            '$ python3 scripts/validate_system_yamls.py --strict',
            '',
            '# 7. Start API server',
            '$ uvicorn api.main:app --reload --port 8000',
            '',
            '# 8. Start frontend',
            '$ cd ui && npm install && npm run dev',
            '',
            '# 9. Enable Lab in UI',
            '# Settings -> Developer Tools -> toggle on -> enter your NGW_DEV_EMAILS address',
        ]),
        sp(20),
    ]

    # ── SECTION 9: HOW-TOS ───────────────────────────────────────────────────
    s += [
        *H2_NP('Section 9 — How-To Workflows'), sp(6),

        H3('How To: Investigate a Failing Pattern'), sp(6),
        *[item for i, (t, b) in enumerate([
            ('Check calibration',       'GET /api/lab/signals/calibration?days=30 — find overconfident: true patterns.'),
            ('Check sample size',       'Ignore patterns with sample_count < 20. Calibration data needs volume.'),
            ('Run targeted benchmark',  'POST /api/lab/benchmarks/run with notes describing which pattern to watch.'),
            ('Review worst cases',      'GET /api/lab/benchmarks/runs/{id}/results — sorted worst-first by final_score.'),
            ('Inspect case history',    'GET /api/lab/benchmarks/cases/{id}/history — see if regression is new or old.'),
            ('Check blueprint YAML',    'Open data/systems/canonical/{pattern}.yml — verify angle_deg, shadow_signature.'),
            ('Validate YAML',           'python3 scripts/validate_system_yamls.py --strict'),
            ('Check dataset coverage',  'python3 scripts/verify_dataset.py — confirm pattern has approved gold entries.'),
            ('Create rule candidate',   'POST /api/lab/rule_candidates with title, description, rationale, proposed_change.'),
            ('Re-benchmark after fix',  'POST /api/lab/benchmarks/run to confirm improvement. Promote baseline if clean.'),
        ], start=1) for item in step(i, t, b)],
        sp(14),

        H3('How To: Add a Gold Set Entry'), sp(6),
        *[item for i, (t, b) in enumerate([
            ('Choose a clean original',    'Unedited JPEG with visible lighting geometry. Minimum 1024px wide.'),
            ('Confirm ground truth',        'Record actual setup: key angle, height, modifier, fill side, ratio.'),
            ('Copy to dataset path',        'data/reference_dataset/{pattern}/{id}/image.jpg'),
            ('Write metadata.json',         'Fill all REQUIRED_META_FIELDS: reference_id, pattern_id, dataset_tier, entry_trust_score.'),
            ('Set dataset_tier correctly',  'gold = 0.90 trust, dual curator. community = 0.70, single curator.'),
            ('Start as draft',              'approval_status: draft always. Never commit approved without review.'),
            ('Run verify_dataset.py',       'python3 scripts/verify_dataset.py — confirms entry passes schema check.'),
            ('Get second curator review',   'Gold tier requires two curator approvals before approval_status: approved.'),
            ('Promote to benchmark case',   'POST /api/lab/benchmarks/cases/from-gold-set/{id} to auto-infer case fields.'),
        ], start=1) for item in step(i, t, b)],
        sp(14),

        H3('How To: Set Up CI Benchmark Gate'), sp(6),
        *[item for i, (t, b) in enumerate([
            ('Seed and verify locally',   'Run seed + verify_dataset.py + validate_system_yamls.py all passing.'),
            ('Run first benchmark',       'POST /api/lab/benchmarks/run — establish initial scores.'),
            ('Promote baseline',          'POST /api/lab/benchmarks/baseline — pin the run as reference.'),
            ('Add CI step',               'Call POST /api/lab/benchmarks/ci-run with X-CI-Secret header.'),
            ('Check exit_code',           'exit_code: 0 = all gates passed. exit_code: 1 = deploy blocked.'),
            ('Configure thresholds',      'Gate: overall < 0.70 OR any pattern < 75% OR regression > 5pp = fail.'),
            ('Update baseline post-fix',  'After any approved candidate is implemented: re-run, then POST baseline.'),
        ], start=1) for item in step(i, t, b)],
        sp(20),
    ]

    # ── SECTION 10: TROUBLESHOOTING ──────────────────────────────────────────
    s += [
        *H2_NP('Section 10 — Troubleshooting'), sp(6),
        table([
            ['Symptom',                                  'Likely cause',                              'Fix'],
            ['401 on all /api/lab/* endpoints',           'Missing or expired JWT',                    'Re-auth; verify NGW_JWT_SECRET matches'],
            ['Lab tab not visible in UI',                 'Email not in NGW_DEV_EMAILS',               'Add email to .env, restart server'],
            ['POST /api/lab/signals returns 422',         'Missing required pattern_id',               'Include pattern_id in request body'],
            ['Signals all show include_in_*=0',           'signal_source=seeded or internal',          'Only live source sets include_in_*=1 by default'],
            ['Benchmark run shows 0 cases evaluated',     'No benchmark_cases rows in DB',             'POST cases or use from-gold-set promotion'],
            ['CI exit_code=1 with no regression_flag',    'overall_score below 0.70 gate',             'Review worst-scoring cases; tune blueprint'],
            ['VLM provider not called',                   'No API key found by auto-detect',           'Set OPENAI_API_KEY or ANTHROPIC_API_KEY'],
            ['validate_system_yamls fails',               'Missing required field in blueprint YAML',  'Check lights[] array and shadow_signature fields'],
            ['verify_dataset.py exits 1',                 'Pattern missing entries or bad metadata',   'Run --fix or manually correct metadata.json'],
            ['seed_starter_dataset errors',               'Entries already exist',                     'Run with --force to overwrite'],
            ['reference_read returns null pattern',       'No approved entries for that pattern',      'Add entry with approval_status: approved'],
            ['Candidate stuck in under_review',           'No curator has advanced the status',        'PUT /api/lab/rule_candidates/{id} status: approved'],
        ], col_widths=[TW*0.36, TW*0.32, TW*0.32]),
        sp(12),

        H3('Diagnostic Sequence'), sp(6),
        *[item for i, (t, b) in enumerate([
            ('Health check',         'GET /health — should return { "status": "ok" }.'),
            ('Lab auth check',       'GET /api/lab/signals/hygiene — 401 = JWT issue; 200 = Lab auth working.'),
            ('Dataset check',        'python3 scripts/verify_dataset.py --quick — fast metadata-only pass.'),
            ('Blueprint check',      'python3 scripts/validate_system_yamls.py — find any YAML schema errors.'),
            ('Signal hygiene',       'GET /api/lab/signals/hygiene — verify live vs seeded counts are expected.'),
            ('Baseline check',       'GET /api/lab/benchmarks/baseline — confirm has_baseline: true.'),
            ('Quick benchmark',      'POST /api/lab/benchmarks/run with case_limit=5 — fast pass/fail check.'),
            ('Inspect worst case',   'GET /api/lab/benchmarks/runs/{id}/results — read the error_msg field.'),
        ], start=1) for item in step(i, t, b)],
        sp(20),
    ]

    # ── APPENDIX: COMPLETE API REFERENCE ────────────────────────────────────
    s += [
        *H2_NP('Appendix — Complete API Reference'), sp(6),
        P('All /api/lab/* endpoints require Authorization: Bearer <token> with a JWT '
          'whose email is listed in NGW_DEV_EMAILS. '
          'Exception: POST /api/lab/signals is public — no auth required.'),
        sp(8),
        table([
            ['Method + Endpoint',                                    'Auth',      'Description'],
            ['POST /api/lab/signals',                                'Public',    'Record session outcome signal'],
            ['GET  /api/lab/signals/summary',                        'Dev JWT',   'Headline KPIs — days + source params'],
            ['GET  /api/lab/signals/patterns',                       'Dev JWT',   'Per-pattern aggregated metrics'],
            ['GET  /api/lab/signals/calibration',                    'Dev JWT',   'Confidence vs outcome gap per pattern'],
            ['GET  /api/lab/signals/recent',                         'Dev JWT',   'Latest N signals (default source=live)'],
            ['GET  /api/lab/signals/hygiene',                        'Dev JWT',   'Source breakdown and eligibility flags'],
            ['POST /api/lab/signals/seed',                           'Dev JWT',   'Insert 45 synthetic bootstrap rows'],
            ['POST /api/lab/benchmarks/cases',                       'Dev JWT',   'Create a benchmark test case'],
            ['GET  /api/lab/benchmarks/cases',                       'Dev JWT',   'List cases (?pattern_id=X&difficulty=hard)'],
            ['PUT  /api/lab/benchmarks/cases/{id}',                  'Dev JWT',   'Update case fields or notes'],
            ['DELETE /api/lab/benchmarks/cases/{id}',                'Dev JWT',   'Remove a benchmark case'],
            ['GET  /api/lab/benchmarks/cases/{id}/history',          'Dev JWT',   'Score history for one case across runs'],
            ['POST /api/lab/benchmarks/cases/from-gold-set/{id}',    'Dev JWT',   'Promote gold_set_entries row to case'],
            ['POST /api/lab/benchmarks/run',                         'Dev JWT',   'Trigger a manual benchmark run'],
            ['POST /api/lab/benchmarks/ci-run',                      'CI Secret', 'CI-triggered run — returns exit_code'],
            ['GET  /api/lab/benchmarks/runs',                        'Dev JWT',   'List benchmark runs (?limit=N)'],
            ['GET  /api/lab/benchmarks/runs/{id}/results',           'Dev JWT',   'Per-case results sorted worst-first'],
            ['GET  /api/lab/benchmarks/pattern-metrics',             'Dev JWT',   'Per-pattern metrics with delta vs last run'],
            ['GET  /api/lab/benchmarks/baseline',                    'Dev JWT',   'Current baseline run info'],
            ['POST /api/lab/benchmarks/baseline',                    'Dev JWT',   'Promote latest completed run to baseline'],
        ], col_widths=[TW*0.50, TW*0.12, TW*0.38]),
        sp(12),
        *callout('Data Backup', [
            'All lab data is in the SQLite DB at data/ngw.db (dev) or Postgres (prod).',
            'Reference dataset images are in data/reference_dataset/ — back up alongside DB.',
            'Before any schema migration: sqlite3 data/ngw.db .dump > backup_$(date +%Y%m%d).sql',
            '_version.json in reference_dataset/ tracks schema_version — check after updates.',
        ], kind='blue'),
    ]

    return s




# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCUMENT 18 — ANALYSIS GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def doc_analysis_guide():
    s = cover(18, 'Analysis Guide',
              'VLM analysis pipeline, shoot-match API, AnalysisResult structure, '
              'Lab Workbench, results screen, debug overlays, and full endpoint '
              'reference — for photographers and engineers.',
              accent=BLUE)
    s += [
        H2('About This Guide'), sp(8),
        P('The NGW analysis system transforms a reference photograph — or a set of '
          'natural-language inputs — into a fully structured lighting prescription. '
          'Every surface in the system traces back to a single Python call: '
          '<font face="Courier">analyze_image()</font> in '
          '<font face="Courier">engine/orchestrator.py</font>. '
          'This guide documents the seven-stage pipeline, every field in '
          '<font face="Courier">AnalysisResult</font>, the shoot-match and lab '
          'API endpoints, the results screen card inventory, debug overlay generation, '
          'and edge-case handling — drawn directly from the source.'),
        sp(10),
        MetricRow([
            ('7-Stage',  'VLM analysis pipeline', BLUE),
            ('4',        'Active classifiers',    GREEN),
            ('24',       'Visual cue signals',    AMBER),
            ('29',       'Lab API endpoints',     MUTED),
        ]),
        sp(16),

        *callout('Auth Model', [
            'POST /shoot-match — user-facing; requires a valid session JWT only.',
            'POST /lab/analyze — dev only; JWT email must appear in NGW_DEV_EMAILS.',
            'GET /lab/reference-dataset/.../debug-overlay — dev only; same auth.',
            'Set NGW_DEV_MODE=1 locally to bypass auth. Never in production.',
        ], kind='amber'),

        table([
            ['Surface',              'Who uses it',          'Auth'],
            ['POST /shoot-match',    'All users',            'Session JWT'],
            ['POST /upload-reference', 'All users',          'Session JWT'],
            ['POST /lab/analyze',    'Curators / devs',      'JWT + NGW_DEV_EMAILS'],
            ['Lab Workbench (UI)',   'Curators / devs',      'JWT + NGW_DEV_EMAILS'],
            ['Debug overlay',        'Curators / devs',      'JWT + NGW_DEV_EMAILS'],
        ], col_widths=[TW*0.32, TW*0.32, TW*0.36]),
        sp(20),
    ]

    # ── SECTION 1: WHAT IS ANALYSIS? ─────────────────────────────────────────
    s += [
        *H2_NP('Section 1 — What Is Image Analysis?'), sp(8),
        P('Image analysis is the process of reading a reference photograph and '
          'determining exactly what lighting setup was used to make it. The NGW '
          'engine reads pixel-level evidence — shadow direction and softness, '
          'catchlight shape and topology, highlight axis symmetry, background '
          'fall-off, specular behavior, and more — and maps that evidence to one '
          'of 28 canonical lighting patterns from the reference dataset.'),
        sp(8),
        P('Analysis is triggered in two ways. When a user uploads a reference '
          'image, <font face="Courier">POST /shoot-match</font> runs the full '
          'pipeline and returns a lighting prescription. When a curator uses the '
          'Lab Workbench, <font face="Courier">POST /lab/analyze</font> runs the '
          'same pipeline with every internal structure exposed for inspection.'),
        sp(8),
        P('The pipeline is not a single model call. It is a deterministic '
          'orchestration of computer-vision passes, multi-stage VLM reconstruction, '
          'four independent classifiers, and a solver chain — all producing '
          'structured evidence that feeds a single pattern-resolution function. '
          'The authoritative pattern is always the output of '
          '<font face="Courier">resolve_pattern_candidates()</font>, never a '
          'direct model response.'),
        sp(20),

        H2('Analysis vs. Shoot-Match'), sp(8),
        P('The shoot-match endpoint handles two distinct input modes. When no '
          'reference image is provided, it matches natural-language inputs '
          '(subject, mood, environment, gear) to the closest pattern using '
          'heuristic scoring. When a reference image is present, the full '
          'analysis pipeline runs and the natural-language inputs are used only '
          'to refine gear recommendations.'),
        sp(10),
        table([
            ['Mode',               'Input',                           'Pipeline depth'],
            ['Text-only match',    'subject + mood + environment',    'Heuristic only — no VLM'],
            ['Reference analysis', 'reference image (JPEG/PNG)',      'Full 7-stage pipeline'],
            ['Lab analyze',        'image upload (multipart)',        'Full pipeline + debug overlay'],
        ], col_widths=[TW*0.25, TW*0.42, TW*0.33]),
        sp(20),
    ]

    # ── SECTION 2: 7-STAGE PIPELINE ──────────────────────────────────────────
    s += [
        *H2_NP('Section 2 — The 7-Stage Analysis Pipeline'), sp(8),
        P('Every reference image passes through seven sequential stages inside '
          '<font face="Courier">analyze_image()</font> in '
          '<font face="Courier">engine/orchestrator.py</font>. '
          'Each stage reads from and writes to the shared '
          '<font face="Courier">AnalysisResult</font> object. '
          'No stage produces the final pattern — all seven contribute evidence '
          'that <font face="Courier">resolve_pattern_candidates()</font> '
          'weighs in Stage 6.'),
        sp(12),

        table([
            ['Stage', 'Name',                 'Module',                    'Writes to AnalysisResult'],
            ['1',     'Signal Extraction',    'engine/image_analysis.py',  'description, cue_report (24 cues)'],
            ['2',     'Vision Pipeline',      'engine/vision_pipeline.py', 'vision_data (face box, catchlights, regions)'],
            ['3',     'Cue Inference',        'engine/cue_inference.py',   'cue_inference_result'],
            ['4',     'VLM Reconstruction',   'engine/vlm_reconstruction.py', 'vlm_reconstruction (12 dimensions)'],
            ['5',     'Solver Chain',         'engine/solver_chain.py',    'solver_result (contradictions resolved)'],
            ['6',     'Pattern Resolution',   'engine/orchestrator.py',    'pattern_candidates, authoritative_pattern'],
            ['7',     'Reference Read',       'engine/reference_read.py',  'reference_analysis (3-layer deep read)'],
        ], col_widths=[TW*0.06, TW*0.22, TW*0.28, TW*0.44]),
        sp(16),

        H3('Stage 1 — Signal Extraction'), sp(6),
        P('<font face="Courier">describe_image()</font> runs the image through '
          'the full cue extraction pipeline and populates '
          '<font face="Courier">AnalysisResult.cue_report</font> — a '
          '<font face="Courier">VisualCueReport</font> with 24 named fields. '
          'Each field is an Optional dataclass that may be None if the signal '
          'could not be computed (e.g., face-dependent cues when no face is '
          'detected). <font face="Courier">cue_report.cues_computed</font> '
          'records how many of the 24 were successfully extracted.'),
        sp(12),

        H3('Stage 2 — Vision Pipeline'), sp(6),
        P('<font face="Courier">_run_extended_pipeline()</font> executes '
          '16+ independent signal passes against the image using computer '
          'vision (MediaPipe, OpenCV). Key outputs include: face bounding box, '
          'face detection confidence score, catchlight positions and topology, '
          'highlight axis map, shadow direction and hardness, region attribution '
          'percentages, and background illumination pattern. Results land in '
          '<font face="Courier">AnalysisResult.vision_data</font>.'),
        sp(12),

        H3('Stage 3 — Cue Inference'), sp(6),
        P('<font face="Courier">run_cue_inference_pipeline()</font> interprets '
          'the raw cues from Stage 1 using a rule-based inference engine. '
          'It synthesizes shadow direction + height + hardness into a structured '
          'lighting hypothesis and feeds '
          '<font face="Courier">AnalysisResult.cue_inference_result</font> '
          'which becomes the <font face="Courier">cue_inference</font> classifier '
          'input in Stage 6.'),
        sp(12),

        H3('Stage 4 — VLM Reconstruction'), sp(6),
        P('The VLM (Vision-Language Model) is called once and asked to reconstruct '
          'the lighting setup across 12 structured dimensions: direction, height, '
          'source size, modifier family, light count, key role, fill role, rim role, '
          'background role, bounce likelihood, mixed sources, and pattern name. '
          'The response is parsed into '
          '<font face="Courier">AnalysisResult.vlm_reconstruction</font>. '
          'The <font face="Courier">pattern_name</font> dimension feeds the '
          '<font face="Courier">lighting_inference</font> classifier in Stage 6.'),
        sp(12),

        H3('Stage 5 — Solver Chain'), sp(6),
        P('Six solvers run in sequence to detect and resolve contradictions '
          'between the four classifier inputs: '
          'consensus_solver → consistency_engine → contradiction_engine → '
          'lighting_simulator → hypothesis_validator → solver_trace. '
          'The solver result is stored in '
          '<font face="Courier">AnalysisResult.solver_result</font> and '
          'influences the confidence adjustments applied in Stage 6.'),
        sp(12),

        H3('Stage 6 — Pattern Resolution'), sp(6),
        P('<font face="Courier">resolve_pattern_candidates()</font> is the '
          'authoritative ranking function. It collects candidate patterns from '
          'all four classifiers, applies priority ordering and any contradiction '
          'demotions, and returns a '
          '<font face="Courier">PatternCandidates</font> object. The '
          '<font face="Courier">primary</font> candidate becomes '
          '<font face="Courier">authoritative_pattern</font> on '
          '<font face="Courier">AnalysisResult</font>.'),
        sp(12),

        H3('Stage 7 — Reference Read'), sp(6),
        P('<font face="Courier">build_reference_photo_analysis()</font> performs '
          'a three-layer deep read of the image: (1) technical read — hardware '
          'and modifier identification, (2) aesthetic read — mood, contrast, '
          'color temperature, (3) recreation guide — step-by-step instructions '
          'for reproducing the setup. This populates '
          '<font face="Courier">AnalysisResult.reference_analysis</font> '
          'and feeds the reference-image cards in the results screen.'),
        sp(20),
    ]

    # ── SECTION 3: ANALYSISRESULT STRUCTURE ──────────────────────────────────
    s += [
        *H2_NP('Section 3 — AnalysisResult Structure'), sp(8),
        P('<font face="Courier">AnalysisResult</font> is a Python dataclass '
          'defined in <font face="Courier">engine/orchestrator.py</font> (lines 649–688). '
          'It uses <font face="Courier">__slots__</font> for performance. '
          'All 24 fields are set to safe defaults in '
          '<font face="Courier">__init__</font> — downstream consumers should '
          'always check <font face="Courier">ok</font> before reading inference '
          'fields.'),
        sp(12),

        table([
            ['Field',                       'Type',                    'Description'],
            ['ok',                          'bool',                    'False if pipeline raised an unrecoverable error'],
            ['description',                 'Dict[str, Any]',          'Raw image description from Stage 1 cue extraction'],
            ['vision_data',                 'Dict[str, Any]',          'Extended pipeline output — face box, catchlights, regions'],
            ['classification',              'Dict[str, Any]',          'Image type classification (portrait / product / scene)'],
            ['cue_report',                  'VisualCueReport',         '24-field cue report; cues_computed tracks success count'],
            ['cue_inference_result',        'Optional[Dict]',          'Stage 3 cue inference output (shadow → pattern hypothesis)'],
            ['lighting_intel',              'LightingIntelligence',    'Light count, modifier, pattern — pre-resolution summary'],
            ['reference_analysis',          'ReferenceAnalysis',       'Three-layer deep read from Stage 7 (tech / aesthetic / guide)'],
            ['pipeline_results',            'Optional[Dict]',          'Raw per-stage outputs; for debug inspection'],
            ['vlm_description',             'Any',                     'Raw VLM image description (Stage 1 model call)'],
            ['vlm_reconstruction',          'Any',                     '12-dimension structured reconstruction from Stage 4'],
            ['solver_result',               'Any',                     'Stage 5 contradiction analysis and resolution trace'],
            ['debug_data',                  'Dict[str, Any]',          'Diagnostic data — face_box, overlay path, timing'],
            ['notes',                       'List[str]',               'Human-readable warnings from any pipeline stage'],
            ['authoritative_pattern',       'str',                     'Final resolved pattern name (e.g. "rembrandt", "loop")'],
            ['authoritative_pattern_source','str',                     'Classifier that produced it (reference_read / lighting_inference / etc.)'],
            ['pattern_candidates',          'PatternCandidates',       'Ranked candidates from all classifiers — primary + alternates'],
            ['pattern_confidence',          'float',                   'Primary candidate confidence score 0.0–1.0'],
            ['pattern_confidence_label',    'str',                     'strong (>0.75) / partial (≥0.50) / weak (<0.50)'],
            ['face_validation',             'FaceValidation',          'Face detection quality — detected, confidence, quality tier, yaw, area ratio'],
            ['signal_reliability',          'SignalReliability',       'Signal coverage — available/total, weak signals, missing signals'],
            ['perception_explanation',      'PerceptionExplanation',   'Supporting/contradicting signals, ambiguity flags, reasoning text'],
            ['edge_case_flags',             'EdgeCaseFlags',           'Boolean flags for blown highlights, mixed CT, B&W, no-face, low-key'],
        ], col_widths=[TW*0.32, TW*0.24, TW*0.44]),
        sp(20),

        H2('PatternCandidates'), sp(8),
        P('<font face="Courier">PatternCandidates</font> is the core output '
          'of Stage 6. Its '
          '<font face="Courier">to_dict()</font> method produces the '
          '<font face="Courier">patternCandidates</font> key in every API '
          'response.'),
        sp(10),
        table([
            ['Field',           'Type',                    'Description'],
            ['primary',         'PatternCandidate',        'Highest-ranked candidate — defines authoritative_pattern'],
            ['alternates',      'List[PatternCandidate]',  'Other viable candidates in confidence order'],
            ['needs_review',    'bool',                    'True when classifiers significantly disagree'],
            ['contradictions',  'List[str]',               'Human-readable contradiction descriptions'],
        ], col_widths=[TW*0.22, TW*0.30, TW*0.48]),
        sp(14),
        P('Each <font face="Courier">PatternCandidate</font> has: '
          '<font face="Courier">pattern</font> (canonical name), '
          '<font face="Courier">source</font> (classifier), '
          '<font face="Courier">confidence</font> (0–1), '
          '<font face="Courier">rank</font> (1-based within classifier output).'),
        sp(20),
    ]

    # ── SECTION 4: PATTERN RESOLUTION ────────────────────────────────────────
    s += [
        *H2_NP('Section 4 — Pattern Resolution & Classifiers'), sp(8),
        P('<font face="Courier">resolve_pattern_candidates()</font> collects '
          'candidates from four independent classifiers and applies a strict '
          'priority ordering. Only one function determines the authoritative '
          'pattern — downstream code must read '
          '<font face="Courier">pattern_candidates.authoritative_pattern</font>, '
          'never reach directly into classifier outputs.'),
        sp(12),

        H3('Classifier Priority Order'), sp(6),
        table([
            ['Priority', 'Classifier',         'Source module',                   'Basis'],
            ['0 (highest)', 'reference_read',  'engine/reference_read.py',        'Richest analysis — full three-layer deep read with VLM'],
            ['1',           'lighting_inference', 'engine/lighting_inference.py', 'Vision-based catchlight topology + shadow geometry'],
            ['2',           'cue_inference',    'engine/cue_inference.py',         'Shadow direction + height + hardness rule synthesis'],
            ['3',           'light_structure',  'engine/vision_pipeline.py',       'Nose-shadow geometry direct pattern derivation'],
            ['—',           'unknown fallback', 'orchestrator.py',                 'When no classifier produces a result'],
        ], col_widths=[TW*0.14, TW*0.22, TW*0.28, TW*0.36]),
        sp(16),

        H3('Contradiction Demotion'), sp(6),
        P('When vision signals (triangle_isolation, shadow_density, lr_asymmetry, '
          'highlight_symmetry) strongly contradict the '
          '<font face="Courier">reference_read</font> primary candidate, its '
          'effective priority is demoted from 0 to 2 and its confidence is halved. '
          'This allows competing candidates that align better with raw pixel '
          'evidence to win. The demotion reason is recorded in '
          '<font face="Courier">PatternCandidates.contradictions</font>.'),
        sp(12),

        H3('Confidence Label Tiers'), sp(6),
        table([
            ['Label',   'Confidence range', 'Meaning'],
            ['strong',  '> 0.75',           'Classifiers agree, signals clear — high trust'],
            ['partial', '0.50 – 0.75',      'Reasonable evidence — use with normal care'],
            ['weak',    '< 0.50',           'Ambiguous signals — flag for curator review'],
        ], col_widths=[TW*0.20, TW*0.25, TW*0.55]),
        sp(14),

        *callout('28 Canonical Patterns', [
            'split, rembrandt, loop, butterfly, clamshell, triangle, broad, short',
            'gobo, flat, rim_only, high_key, low_key, flat_fashion, window_portrait',
            'golden_hour, overcast_natural, ring_light, bare_bulb_editorial, strip_dramatic',
            'short_fashion_key, soft_editorial_key, editorial_rim_key',
            'tabletop_soft_product, bottle_backlight, athletic_rim_sculpt',
            'window_negative_fill, hybrid, unknown',
        ], kind='blue'),
        sp(20),
    ]

    # ── SECTION 5: SHOOT-MATCH API ────────────────────────────────────────────
    s += [
        *H2_NP('Section 5 — Shoot-Match API'), sp(8),
        P('The shoot-match endpoint is the primary user-facing analysis surface. '
          'It accepts either natural-language inputs or a base64-encoded reference '
          'image. When an image is present the full 7-stage pipeline runs; '
          'otherwise heuristic matching is used.'),
        sp(12),

        H3('POST /shoot-match'), sp(6),
        *cb('Request body (JSON)', [
            '{',
            '  "subject":        "headshot",           // woman | man | child | couple | group | headshot',
            '  "mood":           "editorial",',
            '  "environment":    "studio",              // studio | indoor | outdoor',
            '  "ceiling":        "normal",              // normal | low',
            '  "gearMode":       "anyGear",             // anyGear | myGear',
            '  "gear":           ["softbox", "rim"],    // optional gear list',
            '  "skinTone":       "medium",              // optional',
            '  "referenceImage": "<base64-string>",     // optional — triggers full pipeline',
            '  "masterMode":     null                   // optional override',
            '}',
        ], lang='json'),

        *cb('Response (condensed)', [
            '{',
            '  "status": "ok",',
            '  "requestId": "abc123",',
            '  "processingMs": 2340,',
            '  "authoritative_pattern": "rembrandt",',
            '  "patternCandidates": {',
            '    "primary_candidate": { "pattern": "rembrandt", "source": "reference_read",',
            '                           "confidence": 0.87, "confidence_label": "strong" },',
            '    "alternate_candidates": [ { "pattern": "loop", "source": "lighting_inference",',
            '                               "confidence": 0.61 } ],',
            '    "needs_review": false,',
            '    "contradictions": []',
            '  },',
            '  "faceValidation": { "face_detected": true, "face_quality": "good",',
            '                      "face_confidence": 0.94, "face_yaw": 12.3,',
            '                      "face_box_area_ratio": 0.18 },',
            '  "signalReliability": { "signals_available": 19, "signals_total": 24,',
            '                         "overall_signal_strength": 0.81,',
            '                         "weak_signals": [], "missing_signals": ["pose_induced_shadow_interference"] },',
            '  "edgeCaseFlags": { "no_face": false, "blown_highlights": false,',
            '                     "mixed_color_temperature": false, "bw_processing": false },',
            '  "lightingIntelligence": { ... },',
            '  "referenceImageAnalysis": { ... },',
            '  "cards": [ ... ]',
            '}',
        ], lang='json'),

        H3('POST /upload-reference'), sp(6),
        P('Accepts a multipart image upload. Runs the full analysis pipeline '
          'and returns the same response shape as '
          '<font face="Courier">POST /shoot-match</font> with a reference '
          'image. Use this when the reference image is too large for base64 '
          'inline encoding (max inline size ≈ 8 MB; upload limit is 10 MB).'),
        sp(20),
    ]

    # ── SECTION 6: LAB WORKBENCH ──────────────────────────────────────────────
    s += [
        *H2_NP('Section 6 — Lab Workbench'), sp(8),
        P('The Lab Workbench is the curator tool for running full-fidelity '
          'analysis with all internal structures exposed. It lives in the '
          'Workbench tab of the Lab screen '
          '(<font face="Courier">ui/src/screens/LabScreen.jsx</font>) '
          'and is backed by '
          '<font face="Courier">POST /lab/analyze</font>.'),
        sp(12),

        H3('POST /lab/analyze'), sp(6),
        *cb('Request (multipart/form-data)', [
            'image:   <file upload>      # JPEG or PNG, max 10 MB',
            'debug:   true | false       # query param — generates visual overlay',
        ], lang='bash'),

        *cb('Response fields', [
            '{',
            '  "status":         "ok",',
            '  "image_path":     "/static/uploads/abc123.jpg",',
            '  "description":    { ... },          // Stage 1 raw cue extraction',
            '  "reference_analysis": { ... },      // Stage 7 three-layer deep read',
            '  "vlm":            { ... },          // Stage 1 VLM description',
            '  "vlm_available":  true,',
            '  "vlm_reconstruction": {             // Stage 4 — 12 dimensions',
            '    "direction":    "45_camera_left",',
            '    "height":       "above_eye",',
            '    "source_size":  "large_soft",',
            '    "modifier_family": "softbox",',
            '    "light_count":  2,',
            '    "key_role":     "main_key",',
            '    "fill_role":    "fill",',
            '    "rim_role":     "none",',
            '    "background_role": "none",',
            '    "bounce_likelihood": "low",',
            '    "mixed_sources": false,',
            '    "pattern_name": "rembrandt"',
            '  },',
            '  "cv":             { ... },          // Stage 2 vision_data',
            '  "classification": { ... },          // image type classification',
            '  "lighting_inference": { ... },      // lighting_intel summary',
            '  "solver":         { ... },          // Stage 5 solver chain result',
            '  "analyzed_by":    "dev@example.com",',
            '  "analyzed_at":    "2025-11-14T09:23:11Z",',
            '  "debug_overlay_url": "/static/debug/abc123_overlay.jpg"  // only when debug=true',
            '}',
        ], lang='json'),

        *callout('Debug Overlay Flag', [
            'Pass ?debug=true to generate a visual overlay image.',
            'The overlay annotates: face bounding box (cyan), shadow direction arrows (amber),',
            'catchlight positions (white dots), highlight regions (blue), background regions (green).',
            'URL is returned in debug_overlay_url — accessible at GET /static/debug/<filename>.',
            'Overlays are stored in /static/debug/ and not automatically cleaned up.',
        ], kind='blue'),

        sp(6),
        table([
            ['Workbench tab',     'Purpose'],
            ['Workbench',         'Run POST /lab/analyze — upload image, inspect full response, view debug overlay'],
            ['Gold Sets',         'Manage gold-set reference entries for benchmark evaluation'],
            ['Candidates',        'Propose and track rule candidates through review lifecycle'],
            ['Reference Dataset', 'Browse the 28-pattern reference library; ingest new images'],
            ['Signals',           'Inspect session_signals hygiene — live/seeded/internal counts'],
            ['Learning Ops',      'Trigger candidate auto-generation from accumulated signals'],
            ['Benchmarks',        'Run benchmark suite, view pass/soft-pass/fail by pattern'],
        ], col_widths=[TW*0.28, TW*0.72]),
        sp(20),
    ]

    # ── SECTION 7: RESULTS SCREEN CARDS ──────────────────────────────────────
    s += [
        *H2_NP('Section 7 — Results Screen Cards'), sp(8),
        P('The results screen (<font face="Courier">ui/src/screens/ResultsScreen.jsx</font>) '
          'assembles the analysis output into a sequence of cards. Cards are '
          'conditionally rendered based on whether a reference image was '
          'provided and the user\'s subscription tier. '
          'Phase labels organize cards into logical groups.'),
        sp(12),

        table([
            ['Card component',          'Always shown', 'Requires ref image', 'Description'],
            ['LookSummaryCard',         'Yes',          'No',                 'Pattern name, confidence label, key modifier and light count — free tier'],
            ['BlueprintCard',           'Yes',          'No',                 'Full blueprint YAML details — modifier, positions, distances, ratios'],
            ['DiagramCard',             'Yes',          'No',                 'SVG lighting diagram with clock-position annotations'],
            ['ShootSetupCard',          'Yes',          'No',                 'Plain-English setup instructions'],
            ['SpaceCheckCard',          'Yes',          'No',                 'Minimum room dimensions and ceiling requirements'],
            ['CameraSubjectCard',       'Yes',          'No',                 'Camera position, focal length, and subject framing guidance'],
            ['HowToTestCard',           'Yes',          'No',                 'Test-shot checklist for on-set verification'],
            ['WhatToLookForCard',       'Yes',          'No',                 'Visual confirmation cues when setup is correct'],
            ['QuickFixesCard',          'Yes',          'No',                 'Common failure modes and single-sentence corrections'],
            ['RecommendedKitsCard',     'Yes',          'No',                 'Gear recommendation cards matching the blueprint modifier family'],
            ['OtherSetupsCard',         'Yes',          'No',                 'Alternate patterns with similar aesthetic — jump to different result'],
            ['SkinToneCard',            'Yes',          'No',                 'Skin-tone specific power and modifier adjustment notes'],
            ['SignalQualityCard',       'Yes',          'No',                 'Classifier agreement, confidence tier, signal availability summary'],
            ['TestShotCard',            'Yes',          'No',                 'On-set test shot evaluation entry point — links to Shoot Mode'],
            ['MySetupsCard',            'Yes',          'No',                 'Save-to-kit and previously saved setups for this pattern'],
            ['FeedbackCard',            'Yes',          'No',                 'Outcome recording — nailed_it / close / failed — writes session_signal'],
            ['ReferenceImageCard',      'No',           'Yes',                'The uploaded reference image with zoom overlay'],
            ['RefImageReadCard',        'No',           'Yes',                'Technical read — hardware and modifier identification'],
            ['RefLightingCard',         'No',           'Yes',                'Lighting analysis — direction, height, source, modifier'],
            ['RefRecreationCard',       'No',           'Yes',                'Step-by-step recreation guide from Stage 7 reference read'],
            ['RefInterpretationsCard',  'No',           'Yes',                'Alternative interpretations and confidence notes from the deep read'],
        ], col_widths=[TW*0.30, TW*0.14, TW*0.17, TW*0.39]),
        sp(20),
    ]

    # ── SECTION 8: DEBUG OVERLAYS ─────────────────────────────────────────────
    s += [
        *H2_NP('Section 8 — Debug Overlays'), sp(8),
        P('When <font face="Courier">?debug=true</font> is passed to '
          '<font face="Courier">POST /lab/analyze</font>, the engine generates '
          'a visual annotation overlay on top of the uploaded image. '
          'The overlay is saved to '
          '<font face="Courier">/static/debug/<hash>_overlay.jpg</font> '
          'and its URL is returned as '
          '<font face="Courier">debug_overlay_url</font> in the response.'),
        sp(12),

        H3('What Overlays Annotate'), sp(6),
        table([
            ['Annotation',              'Color',        'Source signal'],
            ['Face bounding box',       'Cyan',         'vision_data.face_box from MediaPipe'],
            ['Shadow direction arrow',  'Amber',        'cue_report.primary_shadow_direction'],
            ['Catchlight dots',         'White',        'vision_data.catchlights (per catchlight)'],
            ['Highlight regions',       'Blue fill',    'cue_report.highlight_axis_map'],
            ['Background region',       'Green outline','vision_data.region_attribution.background'],
            ['Light position estimate', 'Orange dot',   'Derived from shadow + catchlight intersection'],
            ['Pattern label',           'White text',   'authoritative_pattern + confidence_label'],
        ], col_widths=[TW*0.30, TW*0.18, TW*0.52]),
        sp(16),

        *cb('Accessing overlays', [
            '# Run lab analyze with debug flag',
            'curl -X POST "http://localhost:8000/lab/analyze?debug=true" \\',
            '     -H "Authorization: Bearer <dev_jwt>" \\',
            '     -F "image=@reference.jpg"',
            '',
            '# Response includes:',
            '# "debug_overlay_url": "/static/debug/abc123_overlay.jpg"',
            '',
            '# Fetch overlay:',
            'curl http://localhost:8000/static/debug/abc123_overlay.jpg -o overlay.jpg',
        ], lang='bash'),

        *callout('Overlay Storage', [
            'Overlays are NOT automatically deleted — they accumulate in /static/debug/.',
            'Periodically clean up: rm -rf /static/debug/*.jpg (dev only).',
            'In production, overlays are behind dev auth — they are not publicly accessible.',
            'Overlay filenames are derived from the upload hash, not the original filename.',
        ], kind='amber'),
        sp(20),
    ]

    # ── SECTION 9: VISUAL CUE REPORT ─────────────────────────────────────────
    s += [
        *H2_NP('Section 9 — Visual Cue Report (24 Signals)'), sp(8),
        P('<font face="Courier">VisualCueReport</font> in '
          '<font face="Courier">engine/image_analysis_models.py</font> '
          'holds every signal the pipeline extracts from a single image. '
          'Each field is Optional — None means the signal could not be computed. '
          '<font face="Courier">cue_report.cues_computed</font> tracks how '
          'many of the 24 were successfully extracted. '
          'Face-dependent signals return None when no face is detected.'),
        sp(12),

        table([
            ['Field',                           'Face-dependent', 'What it measures'],
            ['shadow_edge_hardness',             'Partial',       'Soft vs. hard shadow falloff — encodes source distance and diffusion'],
            ['primary_shadow_direction',         'Yes',           'Clock position of key light derived from facial shadow geometry'],
            ['vertical_light_angle',             'Yes',           'Height angle — high / eye-level / low — from shadow below brow/chin'],
            ['catchlight_position',              'Yes',           'Clock position of catchlight in the iris'],
            ['catchlight_shape',                 'Yes',           'Round, softbox, ring, window, strip, or absent'],
            ['catchlight_topology',              'Yes',           'Single / dual / ring / fill-only — counts and distribution'],
            ['highlight_axis_map',               'No',            'Directional histogram of highlight regions across the frame'],
            ['highlight_symmetry',               'No',            'Left/right highlight balance — encodes off-axis key strength'],
            ['continuous_source_signals',        'No',            'Whether source appears continuous (LED panel) vs. flash'],
            ['bounce_contributor',               'Partial',       'Probability and direction of a fill via bounce or reflector'],
            ['separation_light',                 'No',            'Presence and strength of rim / hair / separation light'],
            ['off_axis_key',                     'Yes',           'Degree to which key is placed off camera axis'],
            ['light_structure',                  'Yes',           'Direct pattern name derived from nose-shadow geometry'],
            ['highlight_to_shadow_transition',   'Partial',       'Gradient width encodes feathering and modifier proximity'],
            ['contrast_ratio',                   'No',            'Highlight-to-shadow luminance ratio'],
            ['subject_background_separation',    'No',            'Subject-background luminance and color separation'],
            ['background_illumination',          'No',            'Background light pattern: even / gradient / spot / dark / natural'],
            ['specular_highlight_behavior',      'No',            'Specular shape and distribution on skin/surfaces'],
            ['reflection_architecture',          'No',            'Reflector-bounce geometry analysis'],
            ['multi_shadow_detection',           'Partial',       'Multiple shadows indicating multi-light setup'],
            ['environmental_shadow_continuity',  'No',            'Outdoor vs. studio shadow cues; foliage, window, mixed CT hints'],
            ['pose_induced_shadow_interference', 'Yes',           'Body-pose shadows that could confuse direction detection'],
            ['tonal_processing_estimation',      'No',            'B&W detection; heavy contrast grading; tonal processing hints'],
            ['shadow_interruption_pattern',      'Yes',           'Gobo / grid / projected pattern detected via shadow shape'],
        ], col_widths=[TW*0.38, TW*0.15, TW*0.47]),
        sp(20),
    ]

    # ── SECTION 10: FULL API ENDPOINT REFERENCE ───────────────────────────────
    s += [
        *H2_NP('Section 10 — Complete API Endpoint Reference'), sp(8),
        P('All 29 analysis-related endpoints across four route files. '
          'Auth column: '
          '<b>Session</b> = valid user JWT; '
          '<b>Dev</b> = JWT + email in NGW_DEV_EMAILS; '
          '<b>None</b> = unauthenticated.'),
        sp(12),

        H3('Shoot-Match Routes'), sp(6),
        table([
            ['Method', 'Path',                    'Auth',    'Purpose'],
            ['POST',   '/shoot-match',             'Session', 'Full analysis or heuristic match — primary user endpoint'],
            ['POST',   '/upload-reference',        'Session', 'Multipart image upload → full pipeline analysis'],
        ], col_widths=[TW*0.10, TW*0.38, TW*0.12, TW*0.40]),
        sp(14),

        H3('Lab Analysis'), sp(6),
        table([
            ['Method', 'Path',                    'Auth', 'Purpose'],
            ['GET',    '/lab/status',              'Dev',  'Check dev access — returns email + NGW_DEV_MODE flag'],
            ['POST',   '/lab/analyze',             'Dev',  'Full pipeline analysis + optional debug overlay'],
        ], col_widths=[TW*0.10, TW*0.36, TW*0.10, TW*0.44]),
        sp(14),

        H3('Gold Set'), sp(6),
        table([
            ['Method', 'Path',                        'Auth', 'Purpose'],
            ['GET',    '/lab/gold-set',                'Dev',  'List all gold-set entries'],
            ['GET',    '/lab/gold-set/{entry_id}',     'Dev',  'Retrieve single entry by ID'],
            ['POST',   '/lab/gold-set',                'Dev',  'Create new gold-set entry from analysis'],
            ['PUT',    '/lab/gold-set/{entry_id}',     'Dev',  'Update entry (pattern, notes, flags)'],
            ['DELETE', '/lab/gold-set/{entry_id}',     'Dev',  'Remove entry from gold set'],
            ['POST',   '/lab/gold-set/evaluate',       'Dev',  'Batch evaluate all gold-set entries against current engine'],
        ], col_widths=[TW*0.10, TW*0.38, TW*0.10, TW*0.42]),
        sp(14),

        H3('Rule Candidates'), sp(6),
        table([
            ['Method', 'Path',                            'Auth', 'Purpose'],
            ['GET',    '/lab/candidates',                  'Dev',  'List all candidates'],
            ['GET',    '/lab/candidates/{id}',             'Dev',  'Retrieve single candidate'],
            ['POST',   '/lab/candidates',                  'Dev',  'Create candidate from curator observation'],
            ['PUT',    '/lab/candidates/{id}',             'Dev',  'Update status (proposed → approved → rejected)'],
            ['DELETE', '/lab/candidates/{id}',             'Dev',  'Remove candidate'],
        ], col_widths=[TW*0.10, TW*0.38, TW*0.10, TW*0.42]),
        sp(14),

        H3('Reference Library'), sp(6),
        table([
            ['Method', 'Path',                                         'Auth', 'Purpose'],
            ['POST',   '/lab/reference-library/ingest',                'Dev',  'Ingest new reference image into library'],
            ['POST',   '/lab/reference-library/rebuild-index',         'Dev',  'Rebuild search index after bulk changes'],
            ['POST',   '/lab/reference-library/generate-legacy-sidecars','Dev','Generate sidecar JSON for legacy images'],
            ['POST',   '/lab/reference-library/validate',              'Dev',  'Validate all library entries for schema compliance'],
            ['GET',    '/lab/reference-library',                       'Dev',  'List all library entries'],
            ['GET',    '/lab/reference-library/{id}',                  'Dev',  'Retrieve single entry metadata'],
            ['POST',   '/lab/reference-library',                       'Dev',  'Create entry (direct, no image processing)'],
            ['PUT',    '/lab/reference-library/{id}',                  'Dev',  'Update entry metadata'],
            ['DELETE', '/lab/reference-library/{id}',                  'Dev',  'Remove from library'],
            ['POST',   '/lab/reference-library/from-reconstruction',   'Dev',  'Create entry from VLM reconstruction output'],
        ], col_widths=[TW*0.10, TW*0.52, TW*0.08, TW*0.30]),
        sp(14),

        H3('Reference Dataset'), sp(6),
        table([
            ['Method', 'Path',                                               'Auth', 'Purpose'],
            ['POST',   '/lab/reference-dataset/ingest',                      'Dev',  'Ingest image into the 28-pattern reference dataset'],
            ['GET',    '/lab/reference-dataset',                             'Dev',  'List all dataset entries'],
            ['GET',    '/lab/reference-dataset/version',                     'Dev',  'Dataset version string'],
            ['GET',    '/lab/reference-dataset/manifest',                    'Dev',  'Full manifest with per-pattern counts'],
            ['GET',    '/lab/reference-dataset/{pattern_id}/{ref_id}',       'Dev',  'Entry metadata'],
            ['GET',    '/lab/reference-dataset/{pattern_id}/{ref_id}/image', 'Dev',  'Full-resolution image'],
            ['GET',    '/lab/reference-dataset/{pattern_id}/{ref_id}/thumbnail','Dev','Thumbnail image'],
            ['GET',    '/lab/reference-dataset/{pattern_id}/{ref_id}/debug-overlay','Dev','Debug overlay image'],
            ['POST',   '/lab/reference-dataset/{pattern_id}/{ref_id}/approve','Dev', 'Approve entry for inclusion in training'],
            ['POST',   '/lab/reference-dataset/{pattern_id}/{ref_id}/reject', 'Dev', 'Reject entry with reason'],
            ['POST',   '/lab/reference-dataset/{pattern_id}/{ref_id}/reprocess','Dev','Re-run analysis on existing entry'],
        ], col_widths=[TW*0.10, TW*0.54, TW*0.07, TW*0.29]),
        sp(20),
    ]

    # ── SECTION 11: PERFORMANCE & EDGE CASES ─────────────────────────────────
    s += [
        *H2_NP('Section 11 — Performance & Edge Cases'), sp(8),
        P('The full analysis pipeline processes a typical portrait image in '
          '2–4 seconds on a production server (VLM latency dominates). '
          'Debug overlay generation adds 200–500 ms. '
          'The pipeline is designed to degrade gracefully — if any individual '
          'stage fails, <font face="Courier">AnalysisResult.ok</font> remains '
          'True and the stage\'s output field is left at its safe default. '
          'Only a total pipeline failure sets '
          '<font face="Courier">ok = False</font>.'),
        sp(12),

        H3('Face Detection Edge Cases'), sp(6),
        P('Five of the 24 visual cues are face-dependent and return None when '
          'no face is detected: '
          '<font face="Courier">primary_shadow_direction</font>, '
          '<font face="Courier">vertical_light_angle</font>, '
          '<font face="Courier">pose_induced_shadow_interference</font>, '
          '<font face="Courier">shadow_interruption_pattern</font>, and '
          '<font face="Courier">light_structure</font>. '
          'When face detection fails, the engine falls back to non-face cues '
          '(highlight axis map, background illumination, environmental shadows) '
          'and sets '
          '<font face="Courier">edge_case_flags.no_face = True</font> '
          'and '
          '<font face="Courier">face_validation.face_quality = "none"</font>.'),
        sp(12),

        H3('FaceValidation Fields'), sp(6),
        table([
            ['Field',               'Type',     'Description'],
            ['face_detected',       'bool',     'True when MediaPipe face detection returns a bounding box'],
            ['face_confidence',     'float',    'MediaPipe detection confidence score 0.0–1.0'],
            ['face_quality',        'str',      '"good" (large area, yaw present) | "partial" | "none"'],
            ['face_yaw',            'float|None','Face yaw angle in degrees; None if yaw cannot be computed'],
            ['face_box_area_ratio', 'float',    'face_area / image_area — small ratio (<0.01) = "tiny_face" flag'],
        ], col_widths=[TW*0.28, TW*0.15, TW*0.57]),
        sp(14),

        H3('EdgeCaseFlags'), sp(6),
        table([
            ['Flag',                    'Trigger condition'],
            ['no_face',                 'face_validation.face_detected is False'],
            ['blown_highlights',        'contrast_ratio.ratio > 8.0'],
            ['mixed_color_temperature', 'Both warm_* and cool_* hints in environmental_shadow_continuity'],
            ['outdoor_foliage_shadows', '"dappled_foliage" in environmental_shadow_continuity.environment_hints'],
            ['window_light_gradient',   'background_illumination.pattern == "gradient" AND natural indicators'],
            ['extreme_low_key',         'classification.brightness == "low" AND light_structure.shadow_density > 0.5'],
            ['bw_processing',           'tonal_processing_estimation.is_bw is True'],
        ], col_widths=[TW*0.35, TW*0.65]),
        sp(14),

        H3('SignalReliability'), sp(6),
        P('Populated by the perception layer after all stages complete. '
          '<font face="Courier">signals_available</font> counts non-None '
          'cue fields on <font face="Courier">VisualCueReport</font>. '
          '<font face="Courier">weak_signals</font> lists cue names whose '
          'confidence attribute is below 0.3. '
          '<font face="Courier">overall_signal_strength</font> is computed '
          'from <font face="Courier">cue_report.overall_confidence()</font>. '
          'When <font face="Courier">signals_available < 10</font>, '
          'the <font face="Courier">"low_signal_count"</font> ambiguity flag '
          'is set in <font face="Courier">perception_explanation.ambiguity_flags</font>.'),
        sp(20),
    ]

    return s

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PDF BUILDER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DOCS = [
    (1,  'Product Overview',       'doc_01_product_overview.pdf',   doc_product_overview),
    (2,  'User Guide',             'doc_02_user_guide.pdf',         doc_user_guide),
    (3,  'Shoot Mode Guide',       'doc_03_shoot_mode.pdf',         doc_shoot_mode),
    (4,  'Recipes Guide',          'doc_04_recipes.pdf',            doc_recipes),
    (5,  'Build From Scratch',     'doc_05_build_from_scratch.pdf', doc_build_from_scratch),
    (6,  'My Kit Guide',           'doc_06_my_kit.pdf',             doc_my_kit),
    (7,  'Quick Start',            'doc_07_quick_start.pdf',        doc_quick_start),
    (8,  'On-Set Quick Reference', 'doc_08_quick_reference.pdf',    doc_quick_reference),
    (9,  'System Architecture',    'doc_09_architecture.pdf',       doc_architecture),
    (10, 'NGW Lab Guide',          'doc_10_lab_guide.pdf',          doc_lab_guide),
    (11, 'Signal System Guide',    'doc_11_signal_system.pdf',      doc_signal_system),
    (12, 'Learning System Guide',  'doc_12_learning_system.pdf',    doc_learning_system),
    (13, 'Operations Manual',      'doc_13_operations_manual.pdf',  doc_operations_manual),
    (14, 'Troubleshooting Guide',  'doc_14_troubleshooting.pdf',    doc_troubleshooting),
    (15, 'Paywall + Pricing',      'doc_15_paywall_pricing.pdf',    doc_paywall_pricing),
    (16, 'Developer Guide',        'doc_16_developer_guide.pdf',    doc_developer_guide),
    (17, 'NGW Lab Manual',         'doc_17_lab_manual.pdf',         doc_lab_manual),
    (18, 'Analysis Guide',         'doc_18_analysis_guide.pdf',     doc_analysis_guide),
]


def _make_doc(outpath, title):
    """Create a BaseDocTemplate with cover + body page templates."""
    def full_frame():
        return Frame(0, 0, PW, PH,
                     leftPadding=0, rightPadding=0,
                     topPadding=0,  bottomPadding=0,
                     id='full')

    def body_frame():
        return Frame(ML, MB, TW, PH - MT - MB,
                     leftPadding=0, rightPadding=0,
                     topPadding=0,  bottomPadding=0,
                     id='body')

    doc = BaseDocTemplate(
        outpath,
        pagesize=letter,
        leftMargin=ML, rightMargin=MR,
        topMargin=MT,  bottomMargin=MB,
    )
    doc.addPageTemplates([
        PageTemplate('cover', [full_frame()], onPage=on_cover),
        PageTemplate('body',  [body_frame()], onPage=make_on_body(title)),
    ])
    return doc


def build_single(doc_num, title, filename, content_fn):
    """Build one document PDF."""
    outpath = os.path.join(OUT_DIR, filename)
    doc     = _make_doc(outpath, title)
    story   = [NextPageTemplate('cover')] + content_fn()
    doc.build(story)
    print(f'  ✓  [{doc_num:02d}] {title}  →  {filename}')
    return outpath


def build_combined():
    """Build the combined master PDF with all 15 documents."""
    outpath = os.path.join(OUT_DIR, 'NGW_Documentation_Complete.pdf')
    doc     = _make_doc(outpath, 'NGW Documentation — Complete Suite')

    # Master cover
    master_cover = [
        NextPageTemplate('cover'),
        DocCover(0, 'NGW Documentation', 'Complete Suite — All 15 Documents', accent=BLUE),
        NextPageTemplate('body'),
        PageBreak(),
    ]

    # Table of Contents page — each title is a clickable internal link
    _link_style = ParagraphStyle(
        'toc_link', fontName=FREG, fontSize=11, textColor=BLUE,
        leading=16, spaceAfter=0,
    )
    _num_style = ParagraphStyle(
        'toc_num', fontName=FBOLD, fontSize=11, textColor=MUTED,
        leading=16, alignment=TA_CENTER,
    )
    _desc_style = ParagraphStyle(
        'toc_desc', fontName=FREG, fontSize=10, textColor=DIM,
        leading=15,
    )
    _purposes = {
        1:  'What NGW is, what it does, and who it\'s built for',
        2:  'Screen-by-screen guide to every feature',
        3:  'On-set playbook — step-by-step lighting execution',
        4:  'Thirteen master lighting setups, pre-built and ready',
        5:  'Build a lighting setup from scratch with any gear',
        6:  'Manage your equipment for gear-aware recommendations',
        7:  'Up and running in under five minutes',
        8:  'On-set card — pattern names, measurements, power hints',
        9:  'Engine pipeline, VLM, consensus solver, API surface',
        10: 'Gold sets, candidates, signals, and workbench tools',
        11: 'Signal sources, hygiene flags, and learning gates',
        12: 'Failure detection, candidates, and approval workflow',
        13: 'Installation, CLI, database, deployment, incidents',
        14: 'Diagnose and resolve issues with CLI and SQL',
        15: 'Plans, feature gating, and upgrade paths',
        16: 'Contributing, project structure, adding patterns, testing',
    }
    toc_data = [[
        Paragraph('#', S['th']),
        Paragraph('Document', S['th']),
        Paragraph('Purpose', S['th']),
    ]]
    for n, t, fn, _ in DOCS:
        key = f'doc_{n:02d}'
        toc_data.append([
            Paragraph(str(n), _num_style),
            Paragraph(f'<link href="#{key}">{t}</link>', _link_style),
            Paragraph(_purposes.get(n, ''), _desc_style),
        ])
    toc_table_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), CARD2),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [CARD, HexColor('#1A1C24')]),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LINEBELOW', (0, 0), (-1, 0), 1.2, BLUE),
        ('TOPPADDING',    (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ('LEFTPADDING',   (0, 0), (-1, -1), 10),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ])
    toc = [
        H2('Table of Contents'), sp(10),
        Table(toc_data,
              colWidths=[TW*0.07, TW*0.35, TW*0.58],
              style=toc_table_style),
        PageBreak(),
    ]

    # Concatenate all documents
    full_story = master_cover + toc
    for doc_num, title, filename, content_fn in DOCS:
        full_story += content_fn()
        full_story += [PageBreak()]

    doc.build(full_story)
    print(f'  ✓  [MASTER] NGW_Documentation_Complete.pdf')
    return outpath


def main():
    print()
    print('━' * 60)
    print('  NGW Documentation System — Building 15 PDFs')
    print(f'  Output: {OUT_DIR}')
    print('━' * 60)
    print()

    # Build individual docs
    print('  Individual documents:')
    for doc_num, title, filename, content_fn in DOCS:
        try:
            build_single(doc_num, title, filename, content_fn)
        except Exception as e:
            print(f'  ✗  [{doc_num:02d}] {title}  →  ERROR: {e}')

    print()
    print('  Combined master document:')
    try:
        build_combined()
    except Exception as e:
        print(f'  ✗  MASTER  →  ERROR: {e}')

    print()
    print('━' * 60)
    print('  Done.')
    print('━' * 60)
    print()


if __name__ == '__main__':
    main()
