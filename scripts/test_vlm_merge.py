#!/usr/bin/env python3
"""Test VLM merge into the three-layer reference read pipeline.

Run from project root with OPENAI_API_KEY set:
    python3 scripts/test_vlm_merge.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.vlm import vlm_available

if not vlm_available():
    print("OPENAI_API_KEY not set — cannot test VLM merge")
    sys.exit(1)

print("=" * 60)
print("STEP 1: Full image analysis (CV + VLM)")
print("=" * 60)

from engine.image_analysis import describe_image
raw = describe_image("static/uploads/gobo_test.jpeg", "vision")

vlm = raw.get("_vlm_description")
if vlm and vlm.ok:
    print(f"  VLM pose:       {vlm.pose}")
    print(f"  VLM expression: {vlm.expression}")
    print(f"  VLM styling:    {vlm.styling_details}")
    print(f"  VLM features:   {vlm.notable_features}")
else:
    print("  VLM: not available or failed")
    sys.exit(1)

print()
print("=" * 60)
print("STEP 2: Lighting inference")
print("=" * 60)

from engine.lighting_inference import infer_lighting_from_vision
cue_report = raw.get("_cue_report")
vision = raw.get("vision", {})
classification = raw.get("classification", {})
lighting_intel = infer_lighting_from_vision(vision, classification=classification, cue_report=cue_report)
print(f"  Pattern:  {lighting_intel.pattern}")
print(f"  Modifier: {lighting_intel.modifier_family}")

print()
print("=" * 60)
print("STEP 3: Three-layer read (with VLM merge)")
print("=" * 60)

from engine.reference_read import build_reference_photo_analysis
analysis = build_reference_photo_analysis(
    vision_data=vision,
    classification=classification,
    cue_report=cue_report,
    lighting_intel=lighting_intel,
    image_analysis=raw,
    vlm_description=vlm,
)

ir = analysis.image_read
lr = analysis.lighting_read
rs = analysis.recreation_setup

print()
print("--- IMAGE READ ---")
print(f"  Genre:            {ir.genre}")
print(f"  Visual Intent:    {ir.visual_intent}")
print(f"  Mood:             {ir.mood}")
print(f"  Framing:          {ir.camera_subject_relationship}")
print(f"  Pose Notes:       {ir.pose_notes}")
print(f"  Background:       {ir.background_relationship}")
print(f"  Contrast/Shadow:  {ir.contrast_shadow_feel}")
print(f"  Visual Devices:   {ir.notable_visual_devices}")
print(f"  Narrative:        {ir.narrative}")
print(f"  Confidence:       {ir.confidence}")
print(f"  Resolution:       {ir.resolution_quality}")

print()
print("--- LIGHTING READ ---")
print(f"  Source Quality:   {lr.source_quality}")
print(f"  Source Direction:  {lr.source_direction}")
print(f"  Shadow Pattern:   {lr.shadow_pattern}")
print(f"  Fill:             {lr.fill_presence}")
print(f"  Rim:              {lr.rim_presence}")
print(f"  Lighting Family:  {lr.lighting_family}")
print(f"  Processing:       {lr.tonal_processing_notes}")
print(f"  Key Observations: {lr.key_observations}")

print()
print("--- RECREATION SETUP ---")
print(f"  Setup Family:     {rs.setup_family}")
print(f"  Modifier:         {rs.modifier_suggestion}")
print(f"  Lights:           {rs.light_count}")
print(f"  Key Placement:    {rs.key_placement}")
print(f"  Fill Strategy:    {rs.fill_strategy}")
print(f"  Background:       {rs.background_strategy}")
print(f"  Focal Length:     {rs.focal_length}")
print(f"  Aperture:         {rs.aperture}")
print(f"  Setup Notes:      {rs.setup_notes}")

print()
print("--- VLM ON ANALYSIS ---")
vd = analysis.vlm_description
print(f"  Stored: {vd is not None and vd.ok}")

print()
print("=" * 60)
print("DONE")
print("=" * 60)
