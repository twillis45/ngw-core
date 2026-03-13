#!/usr/bin/env python3
"""
Capture screenshots for NGW docs using Playwright.
Requires the dev server running on port 8000.

Usage: python3 scripts/capture_screenshots.py
"""

import os
import time
from playwright.sync_api import sync_playwright

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'docs', 'images')
BASE = 'http://localhost:8000/ui/'
THEMES = ['dark', 'light', 'photoshop', 'lightroom', 'daynote']

os.makedirs(IMG_DIR, exist_ok=True)


def set_theme(page, theme):
    page.evaluate(f"""() => {{
        localStorage.setItem('ngw_theme', '{theme}');
        document.documentElement.setAttribute('data-theme', '{theme}');
    }}""")
    page.wait_for_timeout(300)


def shot(page, name):
    fp = os.path.join(IMG_DIR, f'{name}.png')
    page.screenshot(path=fp, type='png')
    print(f'  -> {name}.png')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            device_scale_factor=2,
        )
        page = context.new_page()

        # ── 1. Welcome screen in each theme ──────────────────
        print('Capturing welcome screen themes...')
        for theme in THEMES:
            page.goto(BASE, wait_until='networkidle')
            set_theme(page, theme)
            page.wait_for_timeout(400)
            shot(page, f'welcome-{theme}')

        # ── 2. Wizard (Build From Scratch) ───────────────────
        print('Capturing wizard screens...')
        page.goto(BASE, wait_until='networkidle')
        set_theme(page, 'dark')
        page.wait_for_timeout(300)

        # Click first mode card
        mode_cards = page.query_selector_all('.mode-card')
        if mode_cards:
            mode_cards[0].click()
            page.wait_for_timeout(600)
            shot(page, 'wizard-master-mode')

            # Select first master mode option
            mm_cards = page.query_selector_all('.master-mode-card')
            if mm_cards:
                mm_cards[0].click()
                page.wait_for_timeout(300)

            # Click Next
            next_btn = page.query_selector('.wizard__nav-next, .btn--primary')
            if next_btn:
                next_btn.click()
                page.wait_for_timeout(400)
                shot(page, 'wizard-mood')

                # Select first mood tile
                mood_tiles = page.query_selector_all('.mood-tile')
                if mood_tiles:
                    mood_tiles[0].click()
                    page.wait_for_timeout(300)

                # Next → subject step
                next_btn2 = page.query_selector('.wizard__nav-next, .btn--primary')
                if next_btn2:
                    next_btn2.click()
                    page.wait_for_timeout(400)
                    shot(page, 'wizard-subject')

        # ── 3. Auth screen ───────────────────────────────────
        print('Capturing auth screen...')
        page.goto(BASE, wait_until='networkidle')
        set_theme(page, 'dark')
        page.wait_for_timeout(300)

        # Click sign-in icon in header
        auth_btn = page.query_selector('.app-header__user-btn')
        if auth_btn:
            auth_btn.click()
            page.wait_for_timeout(500)
            shot(page, 'auth-screen')

        # ── 4. Lab-enabled welcome screen ────────────────────
        print('Capturing Lab-enabled welcome...')
        page.goto(BASE + '?lab=1', wait_until='networkidle')
        set_theme(page, 'dark')
        page.wait_for_timeout(300)

        # Enable lab flag
        page.evaluate("""() => {
            const flags = JSON.parse(localStorage.getItem('ngw_feature_flags') || '{}');
            flags.enable_lab = true;
            localStorage.setItem('ngw_feature_flags', JSON.stringify(flags));
        }""")
        page.reload(wait_until='networkidle')
        set_theme(page, 'dark')
        page.wait_for_timeout(500)
        shot(page, 'welcome-lab-enabled')

        # ── 5. Lab screen (requires fake user) ───────────────
        print('Capturing Lab screen...')
        # Inject a fake user + lab flag to show the Lab tab UI
        page.evaluate("""() => {
            localStorage.setItem('ngw_user', JSON.stringify({id: 'demo', email: 'dev@example.com', username: 'dev'}));
            localStorage.setItem('ngw_token', 'demo-token');
            const flags = JSON.parse(localStorage.getItem('ngw_feature_flags') || '{}');
            flags.enable_lab = true;
            localStorage.setItem('ngw_feature_flags', JSON.stringify(flags));
        }""")
        page.reload(wait_until='networkidle')
        set_theme(page, 'dark')
        page.wait_for_timeout(500)

        # Look for the Lab mode card and click it
        lab_cards = page.query_selector_all('.mode-card')
        lab_clicked = False
        for card in lab_cards:
            text = card.inner_text()
            if 'Lab' in text:
                card.click()
                lab_clicked = True
                break

        if lab_clicked:
            page.wait_for_timeout(600)
            shot(page, 'lab-workbench')

            # Click Gold Set tab
            tabs = page.query_selector_all('.lab-tab, [role="tab"]')
            for tab in tabs:
                text = tab.inner_text()
                if 'Gold' in text:
                    tab.click()
                    page.wait_for_timeout(400)
                    shot(page, 'lab-gold-set')
                    break

            # Click Candidates tab
            for tab in tabs:
                text = tab.inner_text()
                if 'Candid' in text:
                    tab.click()
                    page.wait_for_timeout(400)
                    shot(page, 'lab-candidates')
                    break
        else:
            print('  (!) Lab card not found — skipping Lab screenshots')

        browser.close()
        print(f'\nDone! Screenshots saved to {os.path.abspath(IMG_DIR)}')


if __name__ == '__main__':
    main()
