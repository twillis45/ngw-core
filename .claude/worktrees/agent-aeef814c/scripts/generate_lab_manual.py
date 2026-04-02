#!/usr/bin/env python3
"""
NGW Documentation Suite — Professional PDF with Screenshots
Quick Start · Operations Manual · Lab Manual · Engine Reference · Glossary
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    Table, TableStyle, PageBreak, HRFlowable, KeepTogether,
    NextPageTemplate, Image as RLImage,
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas as pdfcanvas

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'NGW_Lab_Manual.pdf')
SHOTS       = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'screenshots')

# ─── Palette ──────────────────────────────────────────────────────────────────
NAVY        = colors.HexColor('#0B1628')
NAVY_MID    = colors.HexColor('#162040')
NAVY_LIGHT  = colors.HexColor('#1D2D56')
ACCENT      = colors.HexColor('#3B7DD8')
ACCENT_PALE = colors.HexColor('#EEF4FD')
GOLD        = colors.HexColor('#C8A852')
GREEN       = colors.HexColor('#1E8C5A')
GREEN_PALE  = colors.HexColor('#EBF7F2')
AMBER       = colors.HexColor('#B8720A')
AMBER_PALE  = colors.HexColor('#FFF6E8')
WHITE       = colors.white
OFF_WHITE   = colors.HexColor('#F8F9FC')
INK         = colors.HexColor('#1A1D27')
INK_MID     = colors.HexColor('#4A4F60')
INK_LIGHT   = colors.HexColor('#7A7F92')
RULE        = colors.HexColor('#DEE2EC')
TABLE_ALT   = colors.HexColor('#F3F5FA')
CODE_BG     = colors.HexColor('#0F1E38')
CODE_FG     = colors.HexColor('#C8D8F8')
IMG_BORDER  = colors.HexColor('#C8CEDB')
IMG_BG      = colors.HexColor('#F0F3FA')

PW, PH = LETTER

_toc_entries = []   # [(level, title, key)]


# ─── Canvas ───────────────────────────────────────────────────────────────────
class NGWCanvas(pdfcanvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._chrome()
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    def _chrome(self):
        pn = self._pageNumber
        if pn <= 1:
            return
        c = self
        c.saveState()
        c.setStrokeColor(NAVY);  c.setLineWidth(2.2)
        c.line(0.65*inch, PH-0.60*inch, PW-0.65*inch, PH-0.60*inch)
        c.setStrokeColor(ACCENT); c.setLineWidth(0.9)
        c.line(0.65*inch, PH-0.63*inch, PW-0.65*inch, PH-0.63*inch)
        c.setFont('Helvetica-Bold', 7); c.setFillColor(NAVY)
        c.drawString(0.65*inch, PH-0.51*inch, 'NO GUESSWORK LIGHTING')
        c.setFont('Helvetica', 7); c.setFillColor(INK_MID)
        c.drawRightString(PW-0.65*inch, PH-0.51*inch, 'Documentation Suite')
        c.setStrokeColor(RULE); c.setLineWidth(0.5)
        c.line(0.65*inch, 0.58*inch, PW-0.65*inch, 0.58*inch)
        c.setFont('Helvetica', 8); c.setFillColor(INK_LIGHT)
        c.drawCentredString(PW/2, 0.38*inch, str(pn))
        c.restoreState()


# ─── Document ─────────────────────────────────────────────────────────────────
class NGWDoc(BaseDocTemplate):
    def __init__(self, path):
        super().__init__(path, pagesize=LETTER,
                         leftMargin=0, rightMargin=0, topMargin=0, bottomMargin=0,
                         title='No Guesswork Lighting — Documentation Suite',
                         author='No Guesswork Lighting')
        L, R, T, B = 0.85*inch, 0.85*inch, 1.0*inch, 0.85*inch
        self.addPageTemplates([
            PageTemplate(id='full', frames=[
                Frame(0, 0, PW, PH, id='full',
                      leftPadding=0, bottomPadding=0, rightPadding=0, topPadding=0)]),
            PageTemplate(id='body', frames=[
                Frame(L, B, PW-L-R, PH-T-B, id='body')]),
        ])

    def afterFlowable(self, f):
        key = getattr(f, '_bk', None)
        lvl = getattr(f, '_bl', None)
        ttl = getattr(f, '_bt', None)
        if key:
            self.canv.bookmarkPage(key)
        if lvl is not None and ttl and key:
            self.canv.addOutlineEntry(ttl, key, level=lvl, closed=(lvl > 0))


# ─── Styles ───────────────────────────────────────────────────────────────────
def make_styles():
    def ps(name, **kw): return ParagraphStyle(name, **kw)
    HV = 'Helvetica'; HVB = 'Helvetica-Bold'; HVC = 'Courier'
    return {
        'body':      ps('body',    fontName=HV,  fontSize=9.5, leading=15.5,
                         textColor=INK,     alignment=TA_JUSTIFY, spaceBefore=3, spaceAfter=3),
        'body_l':    ps('body_l',  fontName=HV,  fontSize=9.5, leading=15.5,
                         textColor=INK,     spaceBefore=3, spaceAfter=3),
        'small':     ps('small',   fontName=HV,  fontSize=8,   leading=12,
                         textColor=INK_MID, alignment=TA_CENTER),
        'caption':   ps('caption', fontName='Helvetica-Oblique', fontSize=8, leading=12,
                         textColor=INK_MID, alignment=TA_CENTER, spaceBefore=4),
        'h1':        ps('h1',      fontName=HVB, fontSize=22,  leading=28,
                         textColor=NAVY,    spaceBefore=24, spaceAfter=6),
        'h3':        ps('h3',      fontName=HVB, fontSize=11,  leading=15,
                         textColor=INK,     spaceBefore=14, spaceAfter=3),
        'bullet':    ps('bullet',  fontName=HV,  fontSize=9.5, leading=14.5,
                         textColor=INK,     leftIndent=20, bulletIndent=8,
                         spaceBefore=2, spaceAfter=2),
        'num':       ps('num',     fontName=HV,  fontSize=9.5, leading=14.5,
                         textColor=INK,     leftIndent=24, bulletIndent=8,
                         spaceBefore=2, spaceAfter=2),
        'code':      ps('code',    fontName=HVC, fontSize=8.2, leading=13,
                         textColor=CODE_FG, backColor=CODE_BG,
                         leftIndent=12, rightIndent=12,
                         spaceBefore=5, spaceAfter=5,
                         borderPadding=(7, 10, 7, 10)),
        'note_t':    ps('note_t',  fontName=HV,  fontSize=9,   leading=13.5,
                         textColor=INK,     leftIndent=6, rightIndent=6),
        'toc_part':  ps('toc_part',fontName=HVB, fontSize=11,  leading=17,
                         textColor='#0B1628', spaceBefore=8, spaceAfter=2),
        'toc_sec':   ps('toc_sec', fontName=HV,  fontSize=9.5, leading=14,
                         textColor='#1A1D27', spaceBefore=1, spaceAfter=1, leftIndent=16),
        'toc_sub':   ps('toc_sub', fontName=HV,  fontSize=8.5, leading=12.5,
                         textColor='#4A4F60', spaceBefore=0, spaceAfter=0, leftIndent=32),
        'gterm':     ps('gterm',   fontName=HVB, fontSize=9.5, leading=13,
                         textColor=NAVY),
        'gdef':      ps('gdef',    fontName=HV,  fontSize=9,   leading=13.5,
                         textColor=INK),
        'th':        ps('th',      fontName=HVB, fontSize=8.5, leading=12,
                         textColor=WHITE),
        'td':        ps('td',      fontName=HV,  fontSize=8.5, leading=13,
                         textColor=INK),
    }


# ─── AccentH2 (left-bar heading) ──────────────────────────────────────────────
class AccentH2(Flowable):
    def __init__(self, text, key=None):
        super().__init__()
        self.text = text
        self.key  = key
        if key:
            self._bk = key; self._bl = 1; self._bt = text
            _toc_entries.append((1, text, key))

    def wrap(self, aw, ah):
        self._aw = aw
        return (aw, 26)

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(ACCENT)
        c.rect(0, -2, 3.5, 28, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 14)
        c.setFillColor(NAVY_LIGHT)
        c.drawString(11, 4, self.text)
        if self.key:
            c.bookmarkHorizontal(self.key, 0, 26)
        c.restoreState()


# ─── Full-page flowables ───────────────────────────────────────────────────────
class CoverPage(Flowable):
    def wrap(self, aw, ah): return (aw, ah)
    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(NAVY); c.rect(0, 0, PW, PH, fill=1, stroke=0)
        c.setFillColor(NAVY_MID); c.rect(0, PH*0.55, PW, PH*0.45, fill=1, stroke=0)
        c.setFillColor(ACCENT); c.rect(PW-5, 0, 5, PH, fill=1, stroke=0)
        c.setFillColor(GOLD);   c.rect(0, 0, 3, PH, fill=1, stroke=0)
        # diagonal slashes
        c.setStrokeColor(colors.HexColor('#1A3060')); c.setLineWidth(30)
        for off in [0, 45, 90]:
            c.line(PW*0.52+off, 0, PW+off, PH*0.68)
        # gold rule
        c.setStrokeColor(GOLD); c.setLineWidth(1.4)
        c.line(0.65*inch, PH*0.42, PW-0.65*inch, PH*0.42)
        c.setStrokeColor(ACCENT); c.setLineWidth(0.5)
        c.line(0.65*inch, PH*0.42-4, PW-0.65*inch, PH*0.42-4)
        # wordmark
        c.setFont('Helvetica-Bold', 9); c.setFillColor(colors.HexColor('#4A6A9A'))
        c.drawCentredString(PW/2, PH-58, 'NO GUESSWORK LIGHTING')
        # title
        c.setFont('Helvetica-Bold', 46); c.setFillColor(WHITE)
        c.drawCentredString(PW/2, PH*0.585, 'No Guesswork')
        c.setFont('Helvetica', 46)
        c.drawCentredString(PW/2, PH*0.538, 'Lighting')
        # subtitle
        c.setFont('Helvetica', 14); c.setFillColor(colors.HexColor('#8AACDE'))
        c.drawCentredString(PW/2, PH*0.484, 'Documentation Suite')
        c.setFont('Helvetica', 9); c.setFillColor(colors.HexColor('#6A8AB8'))
        c.drawCentredString(PW/2, PH*0.455,
                            'Quick Start  ·  Operations Manual  ·  Lab Manual  ·  Engine Reference')
        # version
        c.setFont('Helvetica', 9); c.setFillColor(GOLD)
        c.drawCentredString(PW/2, PH*0.38, 'March 2026  ·  Version 1.0')
        # tagline
        c.setFont('Helvetica-BoldOblique', 11)
        c.setFillColor(colors.HexColor('#3A5898'))
        c.drawCentredString(PW/2, 0.60*inch, 'Read the light. Know the setup.')
        c.restoreState()


class PartDivider(Flowable):
    def __init__(self, num, title, subtitle=''):
        super().__init__()
        self.num = num; self.title = title; self.subtitle = subtitle
    def wrap(self, aw, ah): return (aw, ah)
    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(NAVY); c.rect(0, 0, PW, PH, fill=1, stroke=0)
        c.setFillColor(ACCENT); c.rect(0, 0, 4.5, PH, fill=1, stroke=0)
        c.setFillColor(NAVY_MID); c.rect(0, PH-80, PW, 80, fill=1, stroke=0)
        # wordmark
        c.setFont('Helvetica-Bold', 8); c.setFillColor(colors.HexColor('#4A6A9A'))
        c.drawString(0.75*inch, PH-52, 'NO GUESSWORK LIGHTING  ·  DOCUMENTATION SUITE')
        # rules
        ry = PH*0.48
        c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.line(0.75*inch, ry, PW-0.75*inch, ry)
        c.setStrokeColor(ACCENT); c.setLineWidth(0.4); c.line(0.75*inch, ry+3, PW-0.75*inch, ry+3)
        # part label
        c.setFont('Helvetica', 10); c.setFillColor(GOLD)
        c.drawString(0.75*inch, ry+30, f'PART  {self.num}')
        # title
        c.setFont('Helvetica-Bold', 36); c.setFillColor(WHITE)
        words = self.title.split(); line = ''; lines = []
        for w in words:
            test = (line+' '+w).strip()
            if c.stringWidth(test, 'Helvetica-Bold', 36) <= PW-1.5*inch:
                line = test
            else:
                lines.append(line); line = w
        if line: lines.append(line)
        ty = ry-36
        for ln in lines:
            c.drawString(0.75*inch, ty, ln); ty -= 44
        if self.subtitle:
            c.setFont('Helvetica', 13); c.setFillColor(colors.HexColor('#8AACDE'))
            c.drawString(0.75*inch, ty-14, self.subtitle)
        c.setFont('Helvetica', 8); c.setFillColor(colors.HexColor('#3A5070'))
        c.drawString(0.75*inch, 0.50*inch, 'Confidential — Internal & Customer Documentation')
        c.restoreState()


# ─── Content helpers ──────────────────────────────────────────────────────────
def H1(text, key, st):
    p = Paragraph(f'<a name="{key}"/>{text}', st['h1'])
    p._bk = key; p._bl = 0; p._bt = text
    _toc_entries.append((0, text, key))
    return p

def H2(text, key): return AccentH2(text, key)

def H3(text, key, st):
    p = Paragraph(text, st['h3'])
    p._bk = key; p._bl = 2; p._bt = text
    _toc_entries.append((2, text, key))
    return p

def P(text, st, sty='body'): return Paragraph(text, st[sty])
def SP(n=6):     return Spacer(1, n)
def HR(col=RULE, w=0.5): return HRFlowable(width='100%', thickness=w, color=col,
                                            spaceBefore=5, spaceAfter=5)
def B(items, st):
    return [Paragraph(f'<bullet>\u2022</bullet> {t}', st['bullet']) for t in items]
def NL(items, st):
    return [Paragraph(f'<bullet>{i+1}.</bullet> {t}', st['num']) for i, t in enumerate(items)]
def Code(text, st):
    return Paragraph(text.strip('\n').replace(' ','&nbsp;').replace('\n','<br/>'), st['code'])


def callout(text, st, kind='note'):
    cfg = {'note': (ACCENT, colors.HexColor('#EEF4FD'), '\u2139', 'Note'),
           'warn': (AMBER,  AMBER_PALE,                 '\u26a0',  'Important'),
           'tip':  (GREEN,  GREEN_PALE,                 '\u2714',  'Tip')}
    bar, bg, icon, label = cfg.get(kind, cfg['note'])
    lp = Paragraph(f'<b>{icon} {label}</b>', st['note_t'])
    bp = Paragraph(text, st['note_t'])
    inner = Table([[lp],[bp]], colWidths=[PW-1.7*inch-0.26*inch])
    inner.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),bg),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[bg]),
    ]))
    outer = Table([[inner]], colWidths=[PW-1.7*inch])
    outer.setStyle(TableStyle([
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
        ('LINEBEFORE',(0,0),(-1,-1),3.5,bar),('BACKGROUND',(0,0),(-1,-1),bg),
    ]))
    return [SP(5), outer, SP(5)]


def dtable(headers, rows, st, cw=None):
    avail = PW-1.7*inch
    if cw is None: cw = [avail/len(headers)]*len(headers)
    data = [[Paragraph(h, st['th']) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), st['td']) for c in row])
    t = Table(data, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),NAVY),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('LINEBELOW',(0,0),(-1,-1),0.4,RULE),
        ('LINEBEFORE',(0,0),(0,-1),0.4,RULE),
        ('LINEAFTER',(-1,0),(-1,-1),0.4,RULE),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,TABLE_ALT]),
    ]))
    return [SP(6), t, SP(8)]


def fig(filename, caption, st, width=2.3*inch):
    """Single screenshot with framed border and caption, centered on the page."""
    path = os.path.join(SHOTS, filename)
    if not os.path.exists(path):
        return []
    tmp = RLImage(path)
    ar  = tmp.imageHeight / tmp.imageWidth
    h   = width * ar
    img = RLImage(path, width=width, height=h)
    # frame
    framed = Table([[img]], colWidths=[width+8])
    framed.setStyle(TableStyle([
        ('BOX',(0,0),(-1,-1),1,IMG_BORDER),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),
        ('BACKGROUND',(0,0),(-1,-1),IMG_BG),
    ]))
    cap = Paragraph(f'<i>{caption}</i>', st['caption'])
    avail = PW-1.7*inch
    outer = Table([[framed],[cap]], colWidths=[avail])
    outer.setStyle(TableStyle([
        ('ALIGN',(0,0),(-1,-1),'CENTER'),
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
    ]))
    return [SP(10), KeepTogether([outer]), SP(10)]


def fig_pair(fn1, cap1, fn2, cap2, st, width=2.2*inch):
    """Two screenshots side by side with captions."""
    avail = PW-1.7*inch
    gap   = 0.2*inch
    col_w = (avail-gap)/2

    def frame_one(filename, caption):
        path = os.path.join(SHOTS, filename)
        if not os.path.exists(path):
            return Paragraph(f'[{filename}]', st['small'])
        tmp = RLImage(path)
        ar  = tmp.imageHeight / tmp.imageWidth
        h   = width * ar
        img = RLImage(path, width=width, height=h)
        framed = Table([[img]], colWidths=[width+8])
        framed.setStyle(TableStyle([
            ('BOX',(0,0),(-1,-1),1,IMG_BORDER),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
            ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),
            ('BACKGROUND',(0,0),(-1,-1),IMG_BG),
        ]))
        cap = Paragraph(f'<i>{caption}</i>', st['caption'])
        inner = Table([[framed],[cap]], colWidths=[col_w])
        inner.setStyle(TableStyle([
            ('ALIGN',(0,0),(-1,-1),'CENTER'),
            ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
        ]))
        return inner

    f1 = frame_one(fn1, cap1)
    f2 = frame_one(fn2, cap2)
    outer = Table([[f1, f2]], colWidths=[col_w, col_w])
    outer.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,1),(0,0),gap/2),
        ('LEFTPADDING',(1,0),(1,-1),gap/2),
    ]))
    return [SP(10), KeepTogether([outer]), SP(10)]


# ─── TOC ──────────────────────────────────────────────────────────────────────
def toc_page(st):
    s = [NextPageTemplate('body'), PageBreak()]
    p = Paragraph('Table of Contents', st['h1'])
    p._bk = '_toc'; p._bl = 0; p._bt = 'Table of Contents'
    s.append(p)
    s.append(HR(ACCENT, 1.5))
    s.append(SP(10))

    for lvl, title, key in _toc_entries:
        if lvl == 0:
            s.append(SP(8))
            s.append(Paragraph(
                f'<a href="#{key}" color="#0B1628"><b>{title}</b></a>',
                st['toc_part']))
        elif lvl == 1:
            s.append(Paragraph(
                f'<a href="#{key}" color="#1A1D27">{title}</a>',
                st['toc_sec']))
        else:
            s.append(Paragraph(
                f'<a href="#{key}" color="#4A4F60">{title}</a>',
                st['toc_sub']))
    s.append(SP(12))
    return s


# ═══════════════════════════════════════════════════════════════════════════════
#  PART I — QUICK START
# ═══════════════════════════════════════════════════════════════════════════════

def part_quick_start(st):
    s = [NextPageTemplate('full'), PageBreak(),
         PartDivider('I', 'Quick Start Guide',
                     'Get your first lighting plan in under 5 minutes'),
         NextPageTemplate('body'), PageBreak()]

    s.append(H1('Quick Start Guide', 'qs_main', st))
    s.append(HR(ACCENT, 1.5)); s.append(SP(4))
    s.append(P('No Guesswork Lighting eliminates the trial-and-error of photographic '
               'setup. Tell the app what you want to shoot and receive a precise, '
               'actionable lighting plan — no prior experience required.', st))
    s.append(SP(10))

    s.append(H2('What You Need', 'qs_req'))
    s.append(SP(4))
    s += B(['Any modern smartphone or browser (Chrome, Safari, Firefox)',
            'At least one light source — a window, lamp, or portable strobe',
            'Optional: reflector or diffusion panel for better results',
            'An NGW account — free tier available, no credit card required'], st)
    s.append(SP(10))

    s.append(H2('Step 1 — Open the App', 'qs_s1'))
    s.append(SP(4))
    s.append(P('Navigate to the NGW app or open the installed PWA. '
               'On first visit you land on the Welcome screen. '
               'Tap <b>Try It Free</b> or <b>Get Started</b> to proceed.', st))
    s += callout('Signing in is not required to explore, but saving setups and '
                 'accessing advanced features requires a free account.', st, 'tip')
    s.append(SP(10))

    s.append(H2('Step 2 — Choose an Entry Point', 'qs_s2'))
    s.append(SP(4))
    s.append(P('The app home screen offers three ways to start:', st))
    s.append(SP(6))
    s += NL(['<b>Analyse a photo</b> — Upload a reference image; NGW identifies '
             'the lighting pattern and tells you how to recreate it',
             '<b>Browse Proven Setups</b> — Pick from a library of curated setups '
             'sorted by subject and mood',
             '<b>Build from Scratch</b> — Use the Setup Wizard to describe your '
             'subject, space, and desired look'], st)
    s.append(SP(8))
    s += fig('00_home.png', 'Figure 1 — App home screen: three entry points for starting a lighting plan', st)
    s.append(SP(10))

    s.append(H2('Step 3 — Review Your Lighting Plan', 'qs_s3'))
    s.append(SP(4))
    s.append(P('NGW returns a complete lighting plan. The Results screen shows:', st))
    s.append(SP(4))
    s += B(['<b>Best Match</b> — Recommended system with confidence score',
            '<b>Setup</b> — Per-light: modifier, position, distance, power',
            '<b>Camera Settings</b> — Aperture, ISO, shutter, white balance',
            '<b>Diagram</b> — Top-down floor plan drawn to scale',
            '<b>Quick Fixes</b> — On-set troubleshooting for common problems'], st)
    s.append(SP(10))

    s.append(H2('Step 4 — Read the Diagram', 'qs_s4'))
    s.append(SP(4))
    s.append(P('Tap the <b>Diagram</b> tab on the Results screen for a top-down '
               'floor plan showing exact light placement relative to your subject. '
               'Tap any light icon to highlight its setup card.', st))
    s += callout('If you\'ve entered your room dimensions in the Room Planner, '
                 'all distances in the diagram are shown in real-world feet or meters.', st, 'tip')
    s.append(SP(10))

    s.append(H2('Step 5 — Save or Share', 'qs_s5'))
    s.append(SP(4))
    s.append(P('Tap the share icon to copy the setup as formatted text, send via SMS, '
               'or email to a collaborator. Signed-in users can save the setup to '
               '<i>My Setups</i> for instant recall on any device.', st))
    s.append(SP(12))

    s.append(H2('Bonus: Reference Photo Analysis', 'qs_ref'))
    s.append(SP(4))
    s.append(P('Have a lighting reference you want to replicate? Tap <b>Analyse a photo</b> '
               'on the home screen, upload the image, and NGW\'s 35-pass vision pipeline '
               'identifies the pattern and generates a recreation guide.', st))
    s.append(SP(4))
    s += B(['Supported: JPEG, PNG, WebP, HEIC, TIFF (max 10 MB)',
            'Best results: well-exposed portrait with visible shadows and catchlights',
            'Returns: pattern name, modifier type, placement, fill strategy, step-by-step guide'], st)

    return s


# ═══════════════════════════════════════════════════════════════════════════════
#  PART II — OPERATIONS MANUAL
# ═══════════════════════════════════════════════════════════════════════════════

def part_operations(st):
    s = [NextPageTemplate('full'), PageBreak(),
         PartDivider('II', 'Operations Manual',
                     'Complete guide to every screen and workflow'),
         NextPageTemplate('body'), PageBreak()]

    s.append(H1('Operations Manual', 'ops_main', st))
    s.append(HR(ACCENT, 1.5)); s.append(SP(4))
    s.append(P('This section documents every screen in the NGW application — '
               'controls, data flow between screens, and recommended workflows '
               'for common shooting scenarios.', st))
    s.append(SP(10))

    # ── Navigation ─────────────────────────────────────────────────────────────
    s.append(H2('Navigation', 'ops_nav'))
    s.append(SP(4))
    s.append(P('Navigation is managed via the bottom bar (five icons) and '
               'contextual action buttons within each screen.', st))
    s += dtable(
        ['Tab', 'Icon', 'Purpose'],
        [['Home',    'House',    'Start a new setup, analyze a photo, or open a recent setup'],
         ['My Kit',  'Camera',   'Manage your gear inventory'],
         ['Kit Bag', 'Briefcase','Browse and run saved setups'],
         ['Saved',   'Bookmark', 'Access reference images and saved sessions'],
         ['More',    'Plus',     'Access Room Planner, Settings, Recipes, and Lab (admin)']],
        st, cw=[1.0*inch, 0.9*inch, PW-1.7*inch-1.9*inch])
    s.append(SP(6))

    # ── Home Screen ────────────────────────────────────────────────────────────
    s.append(H2('Home Screen', 'ops_home'))
    s.append(SP(4))
    s.append(P('The home screen is the app\'s primary hub. It presents three entry points '
               'and a quick-access row of recent setups.', st))
    s.append(SP(6))
    s += fig('00_home.png',
             'Figure 2 — Home screen: Analyse a photo, Browse Proven Setups, Build from Scratch', st)
    s.append(SP(4))
    s += B(['<b>Analyse a photo</b> — launches the reference image analysis pipeline',
            '<b>Browse Proven Setups</b> — opens the curated recipe library',
            '<b>Build from Scratch</b> — launches the three-step Setup Wizard',
            'Recent setups appear as tappable cards below the entry points'], st)
    s += callout('The header icons give quick access to: Shoot Mode (sun), '
                 'Lab (flask, admin only), Settings (gear), and your account avatar.', st, 'note')
    s.append(SP(10))

    # ── Setup Wizard ───────────────────────────────────────────────────────────
    s.append(H2('Setup Wizard', 'ops_wizard'))
    s.append(SP(4))
    s.append(P('The wizard collects three inputs used to select and score lighting systems.', st))
    s.append(SP(4))
    s += dtable(
        ['Step', 'Input', 'Options', 'Effect on Results'],
        [['1', 'Subject',     'Portrait, Product, Group, Tabletop, Other',
          'Drives modifier and pattern weighting'],
         ['2', 'Environment', 'Studio, Window, Natural, Mixed, Outdoor',
          'Filters out incompatible systems'],
         ['3', 'Mood',        'Clean, Dramatic, Commercial, Editorial, Beauty, Athletic',
          'Weights scoring toward mood-aligned patterns']],
        st, cw=[0.45*inch, 1.0*inch, 2.0*inch, PW-1.7*inch-3.45*inch])
    s.append(P('After the third step tap <b>Find My Setup</b>. '
               'The matching engine runs and navigates to the Results screen.', st))
    s.append(SP(10))

    # ── Results Screen ─────────────────────────────────────────────────────────
    s.append(H2('Results Screen', 'ops_results'))
    s.append(SP(4))
    s.append(P('Results are presented as scrollable, collapsible cards. '
               'Tap any card header to expand or collapse it.', st))
    s.append(SP(4))
    s += dtable(
        ['Card', 'Contents'],
        [['Best Match',      'System name, pattern, reliability score, confidence band'],
         ['Setup',           'Per-light cards: modifier, angle, distance ft/m, power stop'],
         ['Diagram',         'Top-down floor plan with all lights to scale'],
         ['Camera Settings', 'Aperture, ISO, shutter speed, white balance'],
         ['How to Test',     'In-camera and on-set verification checklist'],
         ['Quick Fixes',     'Symptom → correction troubleshooting guide'],
         ['Other Setups',    'Up to 3 alternatives with comparison confidence scores'],
         ['Space Check',     'Minimum room dimensions for this setup to work correctly'],
         ['Skin Tone',       'Modifier adjustments specific to subject skin tone']],
        st, cw=[1.7*inch, PW-1.7*inch-1.7*inch])
    s.append(SP(10))

    # ── Reference Image Analysis ───────────────────────────────────────────────
    s.append(H2('Reference Image Analysis', 'ops_ref_eval'))
    s.append(SP(4))
    s.append(P('Upload any photograph to identify its lighting. '
               'The full 35-pass vision pipeline runs server-side and returns:', st))
    s.append(SP(4))
    s += B(['Shadow pattern classification (loop, Rembrandt, clamshell, split, butterfly…)',
            'Light count estimation and role assignment (key, fill, rim, kicker)',
            'Modifier inference from catchlight shape and topology',
            'Recreation guide: modifier type, placement angle, fill strategy',
            'Confidence score and supporting signal breakdown'], st)
    s += callout('Well-exposed portraits with visible face shadows and at least one '
                 'catchlight in the eyes produce the most accurate results. '
                 'Dark, blurry, or heavily processed images reduce accuracy.', st, 'note')
    s.append(SP(10))

    # ── My Kit ────────────────────────────────────────────────────────────────
    s.append(H2('My Kit', 'ops_kit'))
    s.append(SP(4))
    s.append(P('My Kit stores your gear inventory so NGW can tailor recommendations '
               'to equipment you actually own. The matching engine weights results toward '
               'systems buildable from your kit.', st))
    s.append(SP(4))
    s += B(['Tap <b>Add Item</b> to add a light, modifier, camera, or accessory',
            'Each item: category, brand/model, quantity, optional notes',
            'Gear not in your kit shows a "you\'ll need" indicator on results',
            'Update your kit when you rent or borrow equipment for a shoot'], st)
    s.append(SP(10))

    # ── Shoot Mode ────────────────────────────────────────────────────────────
    s.append(H2('Shoot Mode', 'ops_shoot'))
    s.append(SP(4))
    s.append(P('Shoot Mode activates real-time on-set coaching. '
               'Launch from the home screen header (sun icon) or from any loaded setup.', st))
    s.append(SP(4))
    s += NL(['<b>Pre-Shoot Checklist</b> — Equipment verification before you begin',
             '<b>Live Guidance</b> — Shot-by-shot coaching cards as you work',
             '<b>Problem Solver</b> — Tap a symptom for instant corrective suggestions',
             '<b>Post-Shoot Review</b> — Rate the result and save notes for next time'], st)
    s += callout('Shoot Mode requires a Pro subscription. '
                 'A 7-day free trial activates on first use.', st, 'note')
    s.append(SP(10))

    # ── Room Planner ──────────────────────────────────────────────────────────
    s.append(H2('Room Planner', 'ops_room'))
    s.append(SP(4))
    s.append(P('Enter your studio or shooting space dimensions so that diagram positions '
               'display as real-world distances. Access via the More tab → Room Planner.', st))
    s.append(SP(4))
    s += B(['Draw walls by dragging on the canvas',
            'Mark doors, windows, and fixed furniture as obstacles',
            'Mark the subject position — all distances calculate from this point',
            'Room plan is saved per-device and applied to all future setups'], st)
    s.append(SP(10))

    # ── Settings ─────────────────────────────────────────────────────────────
    s.append(H2('Settings', 'ops_settings'))
    s.append(SP(4))
    s += fig('07_settings.png',
             'Figure 3 — Settings screen: units, VLM analysis, theme, and account management', st)
    s.append(SP(4))
    s += dtable(
        ['Setting', 'Default', 'Description'],
        [['Units',         'Imperial', 'Switch to Metric (m/cm) for all diagram distances'],
         ['VLM Analysis',  'On',       'Use AI vision for deeper reference image analysis'],
         ['Dark Mode',     'System',   'Force dark or light theme override'],
         ['Notifications', 'Off',      'Push alerts for saved setup reminders'],
         ['Account',       '—',        'Sign in, upgrade plan, or manage subscription'],
         ['Lab Access',    'Admin',    'Visible only to admin accounts — opens NGW Lab']],
        st, cw=[1.5*inch, 0.9*inch, PW-1.7*inch-2.4*inch])
    s.append(SP(10))

    # ── Recipes ───────────────────────────────────────────────────────────────
    s.append(H2('Recipes (Proven Setups)', 'ops_recipes'))
    s.append(SP(4))
    s.append(P('The Recipes screen contains a library of pre-built lighting setups '
               'organized by subject type and visual mood. Each recipe includes the '
               'full setup card stack identical to a Wizard-generated result — '
               'modifier, position, diagram, camera settings, and quick fixes.', st))
    s.append(SP(4))
    s += B(['Browse by Subject (Portrait, Product, Athletic, Editorial…)',
            'Filter by Mood (Clean, Dramatic, Commercial…)',
            'Tap any recipe to load the full results view',
            'Tap <b>Save</b> to add it to My Setups for on-set recall'], st)
    s.append(SP(10))

    # ── Saved Setups ──────────────────────────────────────────────────────────
    s.append(H2('Saved Setups', 'ops_saved'))
    s.append(SP(4))
    s.append(P('Saved setups are stored per-account and sync across devices when signed in. '
               'Each saved entry stores the full result payload — all cards, the diagram, '
               'and camera settings — so you can reload any previous shoot instantly.', st))
    s.append(SP(4))
    s += B(['Tap any saved setup to reload the full results view',
            'Swipe left (mobile) or tap the trash icon to delete',
            'Use the search bar to find setups by name or pattern',
            'Saves are automatic from the Results screen share button → Save Setup'], st)

    return s


# ═══════════════════════════════════════════════════════════════════════════════
#  PART III — LAB MANUAL
# ═══════════════════════════════════════════════════════════════════════════════

def part_lab(st):
    s = [NextPageTemplate('full'), PageBreak(),
         PartDivider('III', 'NGW Lab Manual',
                     'Internal development environment for administrators'),
         NextPageTemplate('body'), PageBreak()]

    s.append(H1('NGW Lab Manual', 'lab_main', st))
    s.append(HR(ACCENT, 1.5)); s.append(SP(4))
    s.append(P('The NGW Lab is an internal development environment restricted to admin '
               'accounts. It provides tools for testing the analysis pipeline, curating '
               'benchmark data, proposing engine improvements, and reviewing the '
               'Reference Dataset.', st))
    s.append(SP(10))

    # ── Access ────────────────────────────────────────────────────────────────
    s.append(H2('Access & Authentication', 'lab_access'))
    s.append(SP(4))
    s.append(P('The Lab tab and Lab entry on the home screen are visible only to accounts '
               'whose email appears in the <b>ADMIN_EMAILS</b> environment variable. '
               'Admin accounts automatically receive enterprise-level feature access.', st))
    s.append(SP(4))
    s += NL(['Sign in with an admin account',
             'Tap the <b>flask icon</b> in the header, or the NGW Lab entry on the home screen',
             'The Lab screen loads with four tabs across the top'], st)
    s += callout('If "Sign in required" appears you are not authenticated. '
                 'If the flask icon never appears, your email is not in ADMIN_EMAILS.', st, 'warn')
    s.append(SP(10))

    # ── Four Tabs ─────────────────────────────────────────────────────────────
    s.append(H2('Lab Navigation — Four Tabs', 'lab_tabs'))
    s.append(SP(4))
    s += fig('01_workbench.png',
             'Figure 4 — NGW Lab screen showing the four tabs: Workbench, Gold Set, Candidates, Reference Dataset', st)
    s.append(SP(4))
    s += dtable(
        ['Tab', 'Purpose'],
        [['Workbench',         'Run images through the full pipeline; inspect every output layer'],
         ['Gold Set',          'Manage the benchmark truth dataset'],
         ['Candidates',        'Track proposed engine rule changes draft → accepted'],
         ['Reference Dataset', 'Browse, approve, reject, and reprocess the reference library']],
        st, cw=[1.5*inch, PW-1.7*inch-1.5*inch])
    s.append(SP(10))

    # ── Workbench ─────────────────────────────────────────────────────────────
    s.append(H2('Workbench', 'lab_workbench'))
    s.append(SP(4))
    s.append(P('The Workbench is the primary analysis sandbox. '
               'It runs the complete NGW pipeline and exposes every intermediate result.', st))
    s.append(SP(6))
    s += NL(['Tap <b>Select Image</b> and pick a photo '
             '(JPEG, PNG, WebP, HEIC, TIFF — max 10 MB)',
             'Optionally tick <b>Debug Overlay</b> to annotate the image with detected '
             'shadows, highlights, catchlights, surface classes, and light roles',
             'Tap <b>Analyze</b> — the full pipeline runs, typically 5–20 seconds',
             'Results appear across four sub-tabs (see below)'], st)
    s.append(SP(8))

    s.append(H3('Workbench Sub-Tabs', 'lab_wb_tabs', st))
    s.append(SP(4))
    s += dtable(
        ['Sub-Tab', 'Contents'],
        [['Formatted',     'Human-readable cards: Description, Narrative, Lighting (family, '
                           'quality, direction, shadow pattern, fill/rim, light count), '
                           'Recreation Setup (modifier, placement, fill strategy)'],
         ['VLM vs CV',     'Side-by-side VLM-extracted signals vs computer vision signals. '
                           'Each row has an <b>Accept VLM</b> button to override the CV value.'],
         ['Raw JSON',      'Full API response — every signal, candidate, score, and debug field '
                           'as pretty-printed JSON'],
         ['Debug Overlay', 'Annotated image with detected regions drawn on top '
                           '(only available when Debug Overlay was checked before analysis)']],
        st, cw=[1.4*inch, PW-1.7*inch-1.4*inch])
    s.append(SP(4))

    s.append(H3('Post-Analysis Actions', 'lab_wb_actions', st))
    s.append(SP(4))
    s += B(['<b>Save to Gold Set</b> — Pre-fills a Gold Set entry with this image and analysis; '
            'turns green ("✔ Commit to Gold Set") if VLM overrides were accepted',
            '<b>Propose Rule</b> — Pre-fills a Candidate entry with the detected lighting family',
            '<b>New Image</b> — Clears everything and returns to the upload state'], st)
    s += callout('The VLM vs CV tab is disabled if no VLM API key is configured '
                 '(OPENAI_API_KEY or ANTHROPIC_API_KEY). The CV pipeline still runs fully.', st, 'note')
    s.append(SP(10))

    # ── Gold Set ─────────────────────────────────────────────────────────────
    s.append(H2('Gold Set', 'lab_goldset'))
    s.append(SP(4))
    s.append(P('The Gold Set is the benchmark truth dataset. Each entry pairs a known image '
               'with verified expected analysis output. It drives automated accuracy evaluation '
               'via <code>python3 scripts/run_benchmarks.py</code>.', st))
    s.append(SP(6))
    s += fig_pair('02_gold_set.png',    'Figure 5a — Gold Set listing with status badges',
                  '03_gold_set_new.png','Figure 5b — New Gold Set entry form',
                  st)
    s.append(SP(4))

    s.append(H3('Gold Set Status Flow', 'lab_gs_status', st))
    s.append(SP(4))
    s += dtable(
        ['Status', 'Meaning', 'Included in Benchmarks'],
        [['Draft',    'Being written or under review',      'No'],
         ['Approved', 'Confirmed correct ground truth',     'Yes'],
         ['Archived', 'Superseded — kept for history',      'No']],
        st, cw=[1.1*inch, PW-1.7*inch-2.6*inch, 1.5*inch])
    s += callout('Archive rather than delete confirmed entries. '
                 'Deletion is permanent — archiving preserves history.', st, 'warn')
    s.append(SP(10))

    # ── Candidates ───────────────────────────────────────────────────────────
    s.append(H2('Candidates', 'lab_candidates'))
    s.append(SP(4))
    s.append(P('Candidates track proposed engine rule changes. When the Workbench reveals '
               'a classification gap, a signal contradiction, or a new pattern worth adding, '
               'create a Candidate to document it.', st))
    s.append(SP(6))
    s += fig_pair('04_candidates.png',    'Figure 6a — Candidates listing with status',
                  '05_candidates_new.png','Figure 6b — New candidate form (title, description, rationale)',
                  st)
    s.append(SP(4))
    s += dtable(
        ['Status', 'Meaning'],
        [['draft',    'Being written'],
         ['review',   'Ready for evaluation against benchmarks'],
         ['accepted', 'Merged into engine rules'],
         ['rejected', 'Discarded with documented reason']],
        st, cw=[1.1*inch, PW-1.7*inch-1.1*inch])
    s.append(SP(10))

    # ── Reference Dataset ─────────────────────────────────────────────────────
    s.append(H2('Reference Dataset', 'lab_refset'))
    s.append(SP(4))
    s.append(P('A curated library of reference photos with full pipeline analysis attached. '
               'Used to build and validate the pattern match library.', st))
    s.append(SP(6))
    s += fig('06_ref_dataset.png',
             'Figure 7 — Reference Dataset grid with pending / approved / rejected status badges', st)
    s.append(SP(4))
    s += B(['Browse as a thumbnail grid — tap to open the detail view',
            'Navigate entries with ← Prev / Next → arrows or the position counter',
            'Detail view shows: full image, Reference Analysis, Pipeline Signals, VLM Reconstruction',
            '<b>Approve</b> — marks entry as valid reference (eligible for benchmarks)',
            '<b>Reject</b> — marks as unsuitable (filtered, not deleted)',
            '<b>Reprocess</b> — re-runs full pipeline when the engine has been updated'], st)
    s += callout('New images are ingested via <code>POST /api/lab/reference/ingest</code> — '
                 'not through the grid UI. After ingestion they appear as "pending".', st, 'note')
    s.append(SP(10))

    # ── Lab Settings ─────────────────────────────────────────────────────────
    s.append(H2('Lab Settings & Dev Tools', 'lab_settings'))
    s.append(SP(4))
    s += fig_pair('07b_settings_lab.png',   'Figure 8a — Lab settings panel',
                  '07c_settings_devtools.png','Figure 8b — Developer tools panel',
                  st)
    s.append(SP(4))
    s.append(P('The Settings screen includes two admin-only panels:', st))
    s.append(SP(4))
    s += B(['<b>Lab Settings</b> — Toggle VLM provider, override model, set debug verbosity',
            '<b>Dev Tools</b> — Inspect active engine constants, trigger cache flush, '
            'view server version and benchmark timestamp'], st)
    s.append(SP(10))

    # ── Common Workflows ─────────────────────────────────────────────────────
    s.append(H2('Common Lab Workflows', 'lab_workflows'))
    s.append(SP(4))

    s.append(H3('Testing a New Image End-to-End', 'lab_wf_e2e', st))
    s.append(SP(4))
    s += NL(['Open <b>Workbench</b> → Select Image → Analyze',
             'Review <b>Formatted</b> — check lighting family, modifier, light count',
             'Switch to <b>VLM vs CV</b> — accept VLM overrides where the VLM is more accurate',
             'Switch to <b>Raw JSON</b> — check <code>bestMatch.reliabilityScore</code> '
             'and the <code>pattern_candidates</code> array',
             'If results are correct: tap <b>Save to Gold Set</b>',
             'If the engine misclassified: tap <b>Propose Rule</b> with evidence attached'], st)
    s.append(SP(8))

    s.append(H3('Investigating a SOFT_PASS Benchmark', 'lab_wf_soft', st))
    s.append(SP(4))
    s += NL(['Find the image path in benchmark output',
             'Load it in Workbench with <b>Debug Overlay</b> checked',
             'Inspect the overlay — look for weak catchlights, pose-induced shadows, '
             'ambiguous face geometry',
             'Check VLM vs CV — identify signal conflicts and which source is correct',
             'If a fix is clear: Propose Rule with the relevant signal data cited'], st)
    s.append(SP(8))

    s.append(H3('Adding a Reference Dataset Image', 'lab_wf_ref', st))
    s.append(SP(4))
    s += NL(['Call <code>POST /api/lab/reference/ingest</code> with the image path',
             'Image appears in the Reference Dataset grid as "pending"',
             'Open it in the detail view — review analysis, signals, and VLM reconstruction',
             'If the analysis is correct: <b>Approve</b>',
             'If the image is unsuitable (bad framing, ambiguous, duplicate): <b>Reject</b>',
             'If signals are stale after an engine update: <b>Reprocess</b>'], st)
    s.append(SP(10))

    # ── Environment Variables ─────────────────────────────────────────────────
    s.append(H2('Environment Variables', 'lab_env'))
    s.append(SP(4))
    s += dtable(
        ['Variable', 'Required For', 'Notes'],
        [['OPENAI_API_KEY',    'VLM — OpenAI',    'gpt-4.1 default'],
         ['ANTHROPIC_API_KEY', 'VLM — Anthropic', 'claude-sonnet-4-20250514 default'],
         ['VLM_PROVIDER',      'Override',        'openai / anthropic / none'],
         ['VLM_MODEL',         'Override',        'Full model name string'],
         ['ADMIN_EMAILS',      'Lab access',      'Comma-separated email list']],
        st, cw=[1.8*inch, 1.7*inch, PW-1.7*inch-3.5*inch])
    s += callout('VLM is entirely optional. Without it the full CV pipeline still runs — '
                 'the VLM vs CV tab is disabled but all other Workbench features work normally.', st, 'note')

    return s


# ═══════════════════════════════════════════════════════════════════════════════
#  PART IV — ENGINE REFERENCE
# ═══════════════════════════════════════════════════════════════════════════════

def part_engine(st):
    s = [NextPageTemplate('full'), PageBreak(),
         PartDivider('IV', 'Engine Reference',
                     'Architecture, pipeline stages, and taxonomy'),
         NextPageTemplate('body'), PageBreak()]

    s.append(H1('Engine Reference', 'eng_main', st))
    s.append(HR(ACCENT, 1.5)); s.append(SP(4))
    s.append(P('This section is the authoritative reference for the NGW analysis engine — '
               'all pattern names, signal definitions, classifier precedence, and taxonomy rules. '
               'No new categorical values may be introduced without updating <code>engine/enums.py</code>.', st))
    s.append(SP(10))

    s.append(H2('Pipeline Architecture — 7 Stages', 'eng_pipeline'))
    s.append(SP(4))
    s += dtable(
        ['Stage', 'Module', 'Description'],
        [['1 — Pre-processing',    'vision_pipeline.py',    'Resize, color-space conversion, EXIF strip'],
         ['2 — Region Attribution','vision_pipeline.py',    'Face detection (MediaPipe), subject bounding box'],
         ['3 — Signal Extraction', 'vision_passes.py',      '35+ signal passes: shadow, highlight, catchlight, geometry'],
         ['4 — Cue Assembly',      'cue_extraction.py',     'Build VisualCueReport from pass outputs'],
         ['5 — Pattern Matching',  'pattern_matcher.py',    'Score each candidate against extracted cues'],
         ['6 — VLM Reconciliation','vlw_reconciliation.py', 'Merge VLM signals with CV signals (if configured)'],
         ['7 — Orchestration',     'orchestrator.py',       'Select authoritative pattern, build AnalysisResult']],
        st, cw=[1.8*inch, 1.6*inch, PW-1.7*inch-3.4*inch])

    s.append(H2('Pattern Classifiers — Priority Order', 'eng_classifiers'))
    s.append(SP(4))
    s.append(P('Four classifiers run in order. Higher-priority classifiers override lower ones '
               'when their confidence exceeds the threshold.', st))
    s.append(SP(4))
    s += dtable(
        ['Priority', 'Classifier', 'Source', 'Min Confidence'],
        [['1 (highest)', 'Shadow Pattern Classifier',     'cue_extraction.py',    '≥ 0.65'],
         ['2',           'Catchlight Topology Classifier', 'vision_passes.py',     '≥ 0.60'],
         ['3',           'Geometry & Ratio Classifier',    'pattern_matcher.py',   '≥ 0.55'],
         ['4 (lowest)',  'VLM Style Classifier',           'vlw_reconciliation.py','≥ 0.50']],
        st, cw=[0.9*inch, 1.85*inch, 1.75*inch, PW-1.7*inch-4.5*inch])

    s.append(H2('Lighting Patterns — 23 Canonical Values', 'eng_patterns'))
    s.append(SP(4))
    s += dtable(
        ['Pattern', 'Category', 'Key Characteristic'],
        [['clamshell',          'Beauty',     'Under-chin fill — symmetrical butterfly shadow'],
         ['loop',               'Classic',    'Small nose-side loop shadow at 30–45°'],
         ['rembrandt',          'Classic',    'Triangular highlight on shadow-side cheek'],
         ['split',              'Dramatic',   '90° key — half face lit, half in shadow'],
         ['butterfly',          'Beauty',     'Direct frontal — shadow below nose only'],
         ['broad',              'Fashion',    'Key on camera-near side, wide coverage'],
         ['short',              'Fashion',    'Key on camera-far side, narrow lit area'],
         ['triangle',           'Classic',    'Hurley triangle — forward-facing, triangular shadow'],
         ['flat_fashion',       'Fashion',    'Ultra-soft frontal, minimal shadow depth'],
         ['high_key_beauty',    'Beauty',     'Bright near-white background, low contrast'],
         ['low_key',            'Dramatic',   'Deep shadow, high contrast, dark background'],
         ['editorial_rim_key',  'Editorial',  'Hard rim as primary with minimal fill'],
         ['corporate_soft_key', 'Commercial', '45° soft key, clean shadow, neutral background'],
         ['window_soft_side',   'Natural',    'Window as key, fill from bounce or opposite wall'],
         ['window_negative_fill','Natural',   'Window key + negative fill panel opposite'],
         ['ring_light',         'Beauty',     'On-axis ring — characteristic ring catchlight'],
         ['strip_dramatic',     'Dramatic',   'Narrow strip for edge/separation light'],
         ['bare_bulb_editorial','Editorial',  'Unmodified strobe, deep hard shadows'],
         ['tabletop_soft_product','Commercial','Overhead + side soft for even product coverage'],
         ['bottle_backlight',   'Commercial', 'Translucent product backlit through diffusion'],
         ['athletic_rim_sculpt','Athletic',   'Dual rim + fill — contour sculpting for athletes'],
         ['soft_editorial_key', 'Editorial',  'Large source, low contrast, directional'],
         ['beauty_dish_clean',  'Beauty',     'Beauty dish at 45° — defined shadow, specular pop']],
        st, cw=[1.7*inch, 1.1*inch, PW-1.7*inch-2.8*inch])

    s.append(H2('Signal Types — 17 Pass Outputs', 'eng_signals'))
    s.append(SP(4))
    s += dtable(
        ['Signal', 'Pass', 'Description'],
        [['shadow_edge_hardness',    'shadow',      'Hard vs soft edge gradient'],
         ['primary_shadow_direction','shadow',      'Clock-face direction of key shadow'],
         ['vertical_light_angle',    'shadow',      'Estimated elevation of key light'],
         ['catchlight_position',     'catchlight',  'Clock-face position in iris'],
         ['catchlight_shape',        'catchlight',  'Circle, rectangle, octagon, or ring'],
         ['catchlight_topology',     'catchlight',  'Single, dual, triple, or ring count'],
         ['highlight_axis_map',      'highlight',   'Specular axis direction across face'],
         ['highlight_symmetry',      'highlight',   'Bilateral symmetry ratio'],
         ['light_structure',         'geometry',    'Full light count + role assignment'],
         ['contrast_ratio',          'tonal',       'Lit-to-shadow luminance ratio'],
         ['background_illumination', 'background',  'Brightness + gradient pattern'],
         ['subject_bg_separation',   'background',  'Subject-vs-background separation score'],
         ['multi_shadow_detection',  'shadow',      'Count of distinct shadow patterns'],
         ['tonal_processing',        'tonal',       'B&W / graded / natural / processed flag'],
         ['pose_shadow_interference','shadow',      'Hands or hair occluding face shadows'],
         ['env_shadow_continuity',   'environment', 'Natural light, foliage, window gradient'],
         ['reflection_architecture', 'specular',    'Specular shape on reflective surfaces']],
        st, cw=[1.85*inch, 1.1*inch, PW-1.7*inch-2.95*inch])

    s.append(H2('VLM Safety Constraints', 'eng_vlm'))
    s.append(SP(4))
    s += B(['VLM may override CV signals only when CV confidence < 0.50',
            'VLM is ignored for face-geometric signals when a face is detected',
            'VLM style classification is Priority 4 — cannot override confident CV results',
            'Rate-limit retry: 2 s → 5 s → 15 s → pipeline continues without VLM on 4th failure'], st)
    s.append(SP(10))

    s.append(H2('Benchmark Verdicts', 'eng_benchmarks'))
    s.append(SP(4))
    s += dtable(
        ['Verdict', 'Meaning'],
        [['PASS',      'Pattern matches expected AND reliability score meets threshold'],
         ['SOFT_PASS', 'Pattern correct but reliability or signal strength below target'],
         ['FAIL',      'Pattern mismatch or critical signal error']],
        st, cw=[1.1*inch, PW-1.7*inch-1.1*inch])
    s.append(SP(4))
    s += B(['Full run: <code>python3 scripts/run_benchmarks.py</code>',
            'CI run: <code>bash scripts/ci_benchmark.sh</code>',
            'Nightly: <code>python3 scripts/nightly_benchmark.py</code>'], st)
    s += callout('Current scores: 22 PASS · 10 SOFT_PASS · 0 FAIL. '
                 'All SOFT_PASS cases are perception-limited — the classification logic '
                 'is correct but signal extraction is ambiguous.', st, 'note')

    return s


# ═══════════════════════════════════════════════════════════════════════════════
#  PART V — APPENDIX
# ═══════════════════════════════════════════════════════════════════════════════

def part_appendix(st):
    s = [NextPageTemplate('full'), PageBreak(),
         PartDivider('V', 'Appendix',
                     'Glossary, reference tables, and operations checklist'),
         NextPageTemplate('body'), PageBreak()]

    s.append(H1('Appendix', 'app_main', st))
    s.append(HR(ACCENT, 1.5)); s.append(SP(10))

    # ── Glossary ──────────────────────────────────────────────────────────────
    s.append(H2('Glossary', 'app_glossary'))
    s.append(SP(8))
    terms = [
        ('Catchlight',       'A specular reflection of a light source visible in the subject\'s '
                             'eye(s). Shape, position, and count are key signals for modifier '
                             'and pattern inference.'),
        ('Clamshell',        'A lighting pattern using a key light above and a fill light (or '
                             'reflector) below the subject, creating a symmetrical butterfly shadow.'),
        ('Gold Set',         'The curated benchmark dataset of images paired with verified '
                             'expected analysis outputs. Engine accuracy is measured against it.'),
        ('Key Light',        'The primary, dominant light source. Sets the direction, quality, '
                             'and contrast of the lighting.'),
        ('Modifier',         'An attachment that changes the quality or shape of a light source. '
                             'Examples: softbox, umbrella, beauty dish, grid, bare bulb.'),
        ('Pattern',          'A named, reproducible lighting arrangement. '
                             'NGW recognizes 23 canonical patterns.'),
        ('Reliability Score','A 0–1 confidence value indicating how strongly the detected signals '
                             'support the authoritative pattern classification.'),
        ('Rembrandt',        'A classic portrait pattern: triangular highlight on the shadow-side '
                             'cheek, key light at approximately 45° elevation.'),
        ('SOFT_PASS',        'A benchmark verdict: the correct pattern was identified but '
                             'reliability or signal strength is below the target threshold.'),
        ('VLM',              'Vision Language Model — an AI model that interprets images. '
                             'Used as a supplementary signal alongside computer vision.'),
        ('VisualCueReport',  'The primary data structure from the cue extraction stage. '
                             'Contains all extracted signals used by the pattern matcher.'),
    ]
    for term, defn in terms:
        row = Table([[Paragraph(f'<b>{term}</b>', st['gterm']),
                      Paragraph(defn, st['gdef'])]],
                    colWidths=[1.3*inch, PW-1.7*inch-1.3*inch])
        row.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('LINEBELOW',(0,0),(-1,-1),0.4,RULE),
        ]))
        s.append(row)
    s.append(SP(16))

    # ── Ops Checklist ─────────────────────────────────────────────────────────
    s.append(H2('Operations Checklist', 'app_checklist'))
    s.append(SP(4))
    s.append(P('Use when deploying or restarting the NGW server:', st))
    s.append(SP(4))
    s += NL(['Verify <code>.env</code> has all required variables (ADMIN_EMAILS, SECRET_KEY, etc.)',
             'Run <code>python3 -m pytest tests/ -q</code> — all tests must pass',
             'Run <code>python3 scripts/run_benchmarks.py</code> — verify 0 FAIL verdicts',
             'Confirm <code>data/systems/canonical/</code> has 19 YAML files',
             'Start: <code>uvicorn main:app --host 0.0.0.0 --port 8000</code>',
             'Health check: <code>GET /api/health</code> → <code>{"status": "ok"}</code>',
             'Test Lab access with an admin account'], st)
    s.append(SP(12))

    # ── Env Reference ─────────────────────────────────────────────────────────
    s.append(H2('Environment Variables Reference', 'app_env'))
    s.append(SP(4))
    s += dtable(
        ['Variable', 'Required', 'Default', 'Description'],
        [['OPENAI_API_KEY',    'No',  '—',      'Enables OpenAI VLM analysis'],
         ['ANTHROPIC_API_KEY', 'No',  '—',      'Enables Anthropic VLM analysis'],
         ['VLM_PROVIDER',      'No',  'auto',   'openai / anthropic / none'],
         ['VLM_MODEL',         'No',  'auto',   'Override default model name'],
         ['ADMIN_EMAILS',      'Yes', '—',      'Comma-separated admin emails'],
         ['DATABASE_URL',      'No',  'SQLite', 'PostgreSQL connection string'],
         ['SECRET_KEY',        'Yes', '—',      'JWT signing secret'],
         ['CORS_ORIGINS',      'No',  '*',      'Allowed CORS origins']],
        st, cw=[1.75*inch, 0.7*inch, 0.7*inch, PW-1.7*inch-3.15*inch])

    return s


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    global _toc_entries
    _toc_entries = []

    st = make_styles()

    # Build all content first (populates _toc_entries)
    content  = part_quick_start(st)
    content += part_operations(st)
    content += part_lab(st)
    content += part_engine(st)
    content += part_appendix(st)

    # Now build TOC using the collected entries
    toc = toc_page(st)

    story  = [NextPageTemplate('full'), CoverPage()]
    story += toc
    story += content

    shots_found = sum(1 for f in os.listdir(SHOTS) if f.endswith('.png'))
    print(f'Building PDF…  ({len(_toc_entries)} TOC entries, {shots_found} screenshots available)')

    doc = NGWDoc(OUTPUT_PATH)
    doc.multiBuild(story, canvasmaker=NGWCanvas)

    size_kb = os.path.getsize(OUTPUT_PATH) // 1024
    print(f'Done.  {OUTPUT_PATH}  ({size_kb} KB)')


if __name__ == '__main__':
    main()
