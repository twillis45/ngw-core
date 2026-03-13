---
name: analyze-ref
description: Analyze a reference photo using the full 5-step comparison workflow for photography lighting analysis
---

Analyze a reference photo using the full 5-step comparison workflow. The language NGW produces should be close to what a skilled photographer or generic AI vision model would say — natural, specific, useful.

The image can be provided in TWO ways:
- **As a file path** in $ARGUMENTS (e.g., `/analyze-ref static/uploads/gobo_test.jpeg`)
- **As an attached image** in the chat (when $ARGUMENTS is empty or not a valid file path)

---

## Step 0: Determine the image path

- If $ARGUMENTS is a valid file path, use it directly.
- If the user attached an image in the chat, save it to `static/uploads/` with a descriptive name first, then use that path.
- If neither is available, ask the user to provide an image.

---

## Step 1: Generic AI Analysis

Look at the attached image yourself (you are a multimodal model). Describe what you see AS IF you were a skilled portrait/fashion photographer evaluating a reference image. Cover:

- **Scene & subject**: What is the subject doing? Framing? Crop? Pose?
- **Mood & intent**: What feeling does the image convey? What genre?
- **Lighting**: Where is the key light? What quality (hard/soft)? Any fill? Rim? How many sources?
- **Shadows**: What pattern? Any projected shadows (gobo, flags, blinds)?
- **Background**: What's happening behind the subject?
- **Tonal treatment**: Color or B&W? Contrast level? Post-processing?
- **How you'd recreate it**: What gear, placement, modifiers would you use?

Write this as natural photographer language — the kind of description you'd give a lighting assistant to recreate the shot.

**IMPORTANT**: Also present this generic analysis mapped to the NGW UI card structure:

### RefImageReadCard fields:
- narrative, genre, mood, visual_intent, camera_subject_relationship, pose_notes, background_relationship, contrast_shadow_feel, notable_visual_devices

### RefLightingCard fields:
- lighting_family, source_quality, source_direction, shadow_pattern, fill_presence, rim_presence, light_count, tonal_processing_notes, key_observations, ambiguity_notes

### RefRecreationCard fields:
- setup_family, modifier_suggestion, light_count, key_placement, fill_strategy, background_strategy, camera_subject_guidance, setup_notes, alternate_hypotheses

---

## Step 2: NGW Structured Analysis

Run the analysis script from the project root:
```
TF_CPP_MIN_LOG_LEVEL=3 .venv/bin/python scripts/analyze_ref.py "<image_path>" --pretty 2>/dev/null
```

Present the JSON output mapped to the same three card structures as Step 1.

---

## Step 3: Comparison

Build a comparison table with these columns:

| Card / Field | Generic AI Read | NGW Structured Read | Assessment |

Cover EVERY field in each card. Assessment column should say one of: ✅ NGW agrees, ⚠️ NGW partially captures, ❌ NGW misses, or 🔍 NGW adds detail generic missed.

---

## Step 4: Recommended NGW Updates

Based on gaps found in Step 3, organize recommendations by priority:

**P1 — Fixable in `engine/reference_read.py`** (pure logic/text, no CV changes):
List each issue with a letter (P1a, P1b, ...) and one-line description.

**P2 — Upstream pipeline fixes** (CV, extraction, inference changes):
List each issue with a letter (P2a, P2b, ...) and one-line description.

**P3 — Confidence & UX**:
List any confidence calibration or user-facing language improvements.

If no updates are needed (NGW nails it), say so explicitly.

---

## Step 5: STOP — Approval Gate

**Do not silently update the repo based on your own conclusions.**

Present the recommended updates and ask:
> "These are the recommended changes. Which priorities should I implement? Or should I skip updates this round?"

Wait for explicit user approval before making ANY code changes.

---

## Safety Rules

- NEVER modify code without explicit approval in Step 5
- If the image can't be analyzed (script fails, no cue data), report what failed and why
- If confidence is below 0.4 on any layer, flag it and explain what data was missing
- Keep NGW language natural and photographer-friendly — close to the generic AI read quality
