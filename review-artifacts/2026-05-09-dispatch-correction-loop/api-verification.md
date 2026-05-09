# API Verification — fix/dispatch-correction-loop
Date: 2026-05-09

## Endpoints wired in this branch

### /api/lab/signals (via postSignal)
- Triggered by: SocialExportPanel judgment chip (all three states)
- Triggered by: ResultScreen DID YOU GET THE SHOT? (all three states, was already wired)
- Payload: pattern_id, confidence_score, outcome, input_method
- Auth: none required (public write endpoint per signalsApi.js comment)
- Source: signalsApi.js:50 → apiFetch('/api/lab/signals', POST)

### /api/intelligence/nailed-it
- Triggered by: ResultScreen handleOutcome when outcome === 'nailed_it'
- Payload: predicted_pattern, confidence
- Auth: Bearer token if available (getToken())
- Source: legacy ResultsScreenV2.jsx:1187 confirmed endpoint exists

### /api/failures/event
- Triggered by: ResultScreen handleOutcome when outcome === 'failed'
- Triggered by: SocialExportPanel handleJudgmentSelect when id === 'missed'
- Payload: predicted_pattern, confidence, session_id (Dispatch only)
- Auth: Bearer token if available
- Returns: { id } — used as failureEventId for CorrectionSheet
- Source: legacy ResultsScreenV2.jsx:1215 confirmed endpoint exists

### /api/failures/feedback
- Triggered by: CorrectionSheet on reason submit
- Payload: failure_event_id (may be null if failures/event call failed), reason
- Auth: Bearer token if available
- Source: legacy OutcomeFeedback.jsx:57 confirmed endpoint exists

## Network verification
Backend not live during this pass — cannot show network tab.
Endpoint availability assumed from:
1. Legacy ResultsScreenV2.jsx which calls all three enriched endpoints
2. OutcomeFeedback.jsx which calls /api/failures/feedback
3. rc2-production-verified memory: backend live at f8aeee2 as of 2026-05-02

## QA path required before merge to main
1. Load a result with a paid account
2. In Dispatch panel:
   a. Click "Nailed It" → confirm POST to /api/lab/signals with outcome: 'nailed_it'
   b. Click "Close Read" → confirm POST to /api/lab/signals; confirm "Teach the Engine" link appears
   c. Click "Missed It" → confirm POST to /api/lab/signals; confirm POST to /api/failures/event; confirm CorrectionSheet opens after ~600ms
3. In CorrectionSheet:
   a. Click a reason → confirm POST to /api/failures/feedback; confirm "Correction saved." state
   b. Click Skip → confirm sheet closes, no API call
   c. Tap outside sheet → confirm sheet closes
4. In ResultScreen DID YOU GET THE SHOT? section:
   a. Click "Nailed It" → confirm POST to /api/lab/signals + POST to /api/intelligence/nailed-it
   b. Click "Off" → confirm POST to /api/lab/signals + POST to /api/failures/event; confirm CorrectionSheet opens after ~600ms
5. Confirm no dead "Teach the Engine" buttons exist in DOM for any user tier

## E2E note
ui/e2e-user-path.mjs requires Node.js 18+. Current environment is Node 16.16.0.
Cannot run automated Playwright tests in this environment.
Manual QA required for correction loop paths.

## Screenshots needed (manual QA)
- desktop-1440-nailed-it-logged.png
- desktop-1440-close-read-teach-engine.png
- desktop-1440-teach-engine-sheet.png
- desktop-1440-missed-it-sheet.png
- desktop-1440-correction-saved.png
- mobile-390-teach-engine-sheet.png
- mobile-390-correction-saved.png
