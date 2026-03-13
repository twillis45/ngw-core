"""Quick script to run the full reference analysis pipeline on an image."""
import json
import os
import sys
import warnings

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
warnings.filterwarnings("ignore")

from engine.image_analysis import describe_image
from engine.lighting_inference import infer_lighting_from_vision
from engine.lighting_inference import build_reference_description


def main(image_path: str):
    print(f"Analyzing: {image_path}")
    print()

    raw = describe_image(image_path, describe_mode="vision")

    vision = raw.get("vision", {})
    classification = raw.get("classification", {})
    cue_report_obj = raw.get("_cue_report")
    vlm_desc_obj = raw.get("_vlm_description")

    intel = infer_lighting_from_vision(
        vision, classification=classification, cue_report=cue_report_obj
    )

    desc = build_reference_description(
        vision_data=vision,
        classification=classification,
        image_analysis=raw,
        inference=intel,
        cue_report=cue_report_obj,
        vlm_description=vlm_desc_obj,
    )

    ref = desc.get("referenceAnalysis", {})
    ir = ref.get("image_read", {})
    lr = ref.get("lighting_read", {})
    rs = ref.get("recreation_setup", {})

    print("=== SCENE READ (image_read) ===")
    for k, v in ir.items():
        if v and v != "unknown" and v != [] and v != 0 and v != 0.0:
            print(f"  {k}: {v}")

    print()
    print("=== LIGHTING READ ===")
    for k, v in lr.items():
        if v and v != "unknown" and v != [] and v != 0 and v != 0.0:
            print(f"  {k}: {v}")

    print()
    print("=== RECREATION SETUP ===")
    for k, v in rs.items():
        if v and v != "unknown" and v != [] and v != 0 and v != 0.0:
            print(f"  {k}: {v}")

    # Also dump the lighting intel pattern
    print()
    print("=== LIGHTING INTEL (raw) ===")
    print(f"  pattern: {intel.pattern}")
    print(f"  pattern_confidence: {intel.pattern_confidence}")
    print(f"  modifier_family: {intel.modifier_family}")
    print(f"  modifier_confidence: {intel.modifier_confidence}")
    print(f"  light_count: {intel.light_count}")
    print(f"  key_position_text: {intel.key_position_text}")
    print(f"  key_side: {intel.key_side}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/run_ref_analysis.py <image_path>")
        sys.exit(1)
    main(sys.argv[1])
