# NGW Lab — Developer Guide

Internal development environment for testing the analysis pipeline, managing the Gold Set, proposing engine rule changes, and reviewing Reference Dataset entries.

---

## Access

**Who can use it:** Accounts whose email address appears in the `ADMIN_EMAILS` whitelist (configured in `auth/dev_guard.py`). All admin emails automatically receive enterprise-level access.

**How to get there:**
1. Open the app and sign in.
2. From the home screen, tap the **NGW Lab** entry (visible only to admin accounts).
3. You land on the Lab screen with four tabs across the top.

If you see "Sign in required", you are not authenticated. If the tab never appears, your account email is not in the admin whitelist.

---

## The Four Tabs

### 1 — Workbench

The primary analysis sandbox. Run any image through the full NGW pipeline and inspect every layer of output.

**How to use:**

1. Tap **Select Image** and pick a photo from your device (JPEG, PNG, WebP, HEIC, TIFF — max 10 MB).
2. Optionally tick **Debug Overlay** before analysing — this generates a visual overlay showing shadows, highlights, catchlights, surface classes, and light roles drawn on the image.
3. Tap **Analyze**. A scanning animation plays while the pipeline runs (typically 5–20 seconds depending on VLM availability).
4. Results appear in four views, switchable via sub-tabs:

| Sub-tab | What it shows |
|---------|---------------|
| **Formatted** | Human-readable cards: Description, Narrative, Lighting (family, quality, direction, shadow pattern, fill/rim, light count), Recreation Setup (modifier, key placement, fill strategy, background strategy) |
| **VLM vs CV** | Side-by-side comparison of VLM-extracted signals vs computer vision signals. Each row has an **Accept VLM** button to override the CV value. Only visible when VLM is configured and returned data. |
| **Raw JSON** | Full API response as pretty-printed JSON — every signal, candidate, score, and debug field. |
| **Debug Overlay** | The annotated image (only available when Debug Overlay was checked before analysis). |

**After analysis:**

- **Save to Gold Set** — pre-fills a Gold Set entry with this image path and analysis. If you accepted VLM overrides first, the button turns green: "✔ Commit to Gold Set".
- **Propose Rule** — pre-fills a Candidates entry with the lighting family / setup from this analysis as the basis for a new engine rule.
- **New Image** — clears everything and returns to the upload screen.

**VLM status:** If the VLM vs CV tab is greyed out, either:
- No VLM API key is set in `.env` (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` required), or
- The VLM call returned no data for this image (check server logs for 429 rate-limit or timeout errors).

---

### 2 — Gold Set

The benchmark truth dataset. Each entry is a known image paired with the expected analysis output. The Gold Set drives automated evaluation (`run_benchmarks.py`) and is the ground truth for measuring engine accuracy.

**Viewing entries:**

- Entries are listed with image path, status badge (Draft / Approved / Archived), and creation date.
- Tap an entry to expand and view or edit the expected analysis JSON.

**Adding an entry manually:**

1. Tap **Add Entry**.
2. Enter the image path (relative to the server's working directory) or use the file picker.
3. Paste or type the expected analysis output as JSON.
4. Set status to **Draft** while working, **Approved** when the entry is confirmed correct.
5. Save.

**From Workbench:** The faster path — analyse an image in Workbench, then tap **Save to Gold Set**. The form auto-fills with the image path and analysis result.

**Editing:** Tap any existing entry to edit the expected analysis, add notes, or change status.

**Deleting:** Swipe or tap the trash icon on any entry. Confirmed entries (Approved) should be archived rather than deleted.

**Running evaluation:** Gold Set evaluation is triggered from the server CLI:
```
python3 scripts/run_benchmarks.py
```
Results print to terminal. The UI Gold Set tab does not run evaluation directly.

---

### 3 — Candidates

Proposed engine rule changes. When the Workbench reveals a gap, contradiction, or new pattern worth adding, create a Candidate to track it.

**Adding a candidate:**

1. Tap **Add Candidate**.
2. Fill in:
   - **Title** — short description of the proposed change (e.g. "Improve clamshell detection for high-key setups")
   - **Description** — what the current engine gets wrong or misses
   - **Rationale** — why this change improves accuracy, with evidence from benchmark data or Workbench results
   - **Proposed Change** — JSON describing the rule delta (pattern weights, new conditions, etc.)
3. Save as Draft.

**From Workbench:** Tap **Propose Rule** after analysis. The form auto-fills with the lighting family and a reference to the source image.

**Status flow:**
- `draft` — being written
- `review` — ready for evaluation against benchmarks
- `accepted` — merged into engine rules
- `rejected` — discarded with reason

**Editing / deleting:** Tap any entry to edit. Use status to track progress rather than deleting.

---

### 4 — Reference Dataset

A library of curated reference photos with full pipeline analysis attached. Each entry stores the original image, VLM description, CV signals, and the complete `reference_analysis` JSON. Used to build the pattern match library and validate the engine against known setups.

**Browsing the dataset:**

- Entries appear as a grid of thumbnails with filename and status badge (pending / approved / rejected).
- Images are fetched with auth headers automatically — you do not need to handle tokens manually.
- Tap **Load More** to paginate through large datasets.

**Viewing an entry:**

1. Tap any thumbnail to open the detail view.
2. The full-size image renders at the top.
3. Navigate between entries with the **← Prev** and **Next →** arrows, or the counter in the middle (e.g. "3 / 47"). This lets you step through the full dataset without returning to the grid.
4. Below the image, collapsible sections show:

| Section | Contents |
|---------|----------|
| **Reference Analysis** | Core analysis JSON — lighting read, recreation setup, image read. Expanded by default. |
| **Pipeline Signals** | Raw CV pipeline pass outputs — shadow, highlight, catchlight, geometry, etc. |
| **VLM Reconstruction** | VLM-based physical reconstruction: primary candidate, alternatives, confidence, ambiguity notes. |

5. Tap any section header to collapse / expand it.

**Approving / rejecting entries:**

- Use the **Approve** or **Reject** buttons in the detail view.
- **Approve** — marks the entry as a valid reference image. Approved entries are eligible for benchmark inclusion.
- **Reject** — marks the entry as unsuitable (bad framing, ambiguous lighting, duplicate, etc.). Rejected entries stay in the dataset but are filtered from benchmarks.

**Reprocessing:**

- Tap **Reprocess** to re-run the full pipeline on an existing entry. Use this when the engine has changed and you want updated signals without re-ingesting the image.

**Ingesting new images:**

Reference images are added via the API rather than through the UI grid:
```
POST /api/lab/reference/ingest
```
Or via the CLI script if one exists. Once ingested, the entry appears in the Reference Dataset tab as "pending" and can be reviewed, approved, or rejected.

---

## Common Workflows

### Testing a new image end-to-end
1. **Workbench** → Select Image → Analyze
2. Review Formatted view — check lighting family, modifier, light count
3. Switch to **VLM vs CV** — confirm signals agree or accept VLM overrides where better
4. Switch to **Raw JSON** — check `bestMatch.reliabilityScore` and `pattern_candidates`
5. If the result is useful: **Save to Gold Set**
6. If the engine got something wrong: **Propose Rule**

### Adding a benchmark image
1. Upload to Workbench, verify the analysis is correct
2. Save to Gold Set (status: Draft)
3. Edit the Gold Set entry to confirm the `expected_analysis` matches ground truth
4. Set status to Approved
5. Run `python3 scripts/run_benchmarks.py` to verify the entry passes

### Investigating a SOFT_PASS benchmark
1. Find the image path from benchmark output
2. Load it in Workbench with **Debug Overlay** checked
3. Inspect the overlay — look for weak catchlights, occlusion shadows, ambiguous geometry
4. Check the **VLM vs CV** tab for signal conflicts
5. If a rule fix is clear: **Propose Rule** with the relevant signal data attached

### Reviewing Reference Dataset images
1. Open **Reference Dataset** tab
2. Step through entries with ← / → navigation
3. Check **Reference Analysis** section — is the lighting family and setup correct?
4. If correct: **Approve**. If wrong framing, bad lighting, or ambiguous: **Reject**
5. If signals look stale after an engine update: **Reprocess**

---

## Environment Requirements

| Variable | Required for |
|----------|-------------|
| `OPENAI_API_KEY` | VLM analysis (OpenAI provider) |
| `ANTHROPIC_API_KEY` | VLM analysis (Anthropic provider) |
| `VLM_PROVIDER` | Override auto-detection (`openai` / `anthropic` / `none`) |
| `VLM_MODEL` | Override default model (`gpt-4.1` / `claude-sonnet-4-20250514`) |

VLM is optional. Without it, Workbench still runs the full CV pipeline and returns results — the VLM vs CV tab will be disabled and the "VLM not configured" tooltip will appear.

---

## Rate Limits (429 Errors)

The VLM layer now retries on 429 responses automatically:

- Attempt 1 fails → wait **2 seconds** → retry
- Attempt 2 fails → wait **5 seconds** → retry
- Attempt 3 fails → wait **15 seconds** → retry
- Attempt 4 fails → logs error, pipeline continues without VLM data

If you see frequent 429s during benchmark runs, request a rate limit increase at:
**https://platform.openai.com/settings/organization/limits**
