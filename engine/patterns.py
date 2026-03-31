from __future__ import annotations

from typing import Any, Dict, List


def classify_lighting_pattern(
    *,
    mood: str,
    modifier_family: str,
    gear_profile: str,
    key_position_text: str = "",
    fill_method_text: str = "",
) -> str:
    """
    Best-effort pattern classification in PHOTOGRAPHER terms.
    This is NOT computer vision; it's classification based on the planned setup.

    Returns: one of:
      - "triangle"
      - "clamshell"
      - "rembrandt"
      - "loop"
      - "split"
      - "unknown"
    """
    m = (mood or "").lower()
    mod = (modifier_family or "").lower()
    gear = (gear_profile or "").lower()
    kp = (key_position_text or "").lower()
    fm = (fill_method_text or "").lower()

    # Triangle (Hurley-style): three-light symmetric setup for headshots
    # Two flanking keys + low fill creating triangle catchlights
    if ("headshot" in m or "clean" in m or "beauty" in m) and (
        "triangle" in kp or "symmetric" in kp or "dual key" in kp or "hurley" in kp
    ):
        return "triangle"

    # Clamshell: commonly "beauty" vibe + centered-ish key + reflector/low fill near axis
    if ("beauty" in m or "clean" in m) and ("reflector" in fm or "near camera axis" in fm or "clamshell" in kp):
        return "clamshell"

    # Split/Short: key pushed far to the side (often ~90°) and dramatic
    if "dramatic" in m and ("90" in kp or "profile" in kp or "split" in kp or "short" in kp):
        return "split"

    # Rembrandt-ish: dramatic, key 30–60° off axis, slightly above eye line
    if "dramatic" in m and ("30" in kp or "45" in kp or "60" in kp or "off-axis" in kp):
        return "rembrandt"

    # Loop: common portrait default 25–45° off axis without calling it rembrandt
    if ("natural" in m or "classic" in m or "portrait" in m) and ("30" in kp or "35" in kp or "45" in kp):
        return "loop"

    # Fallbacks by modifier + mood
    if "beauty_dish" in mod and "dramatic" in m:
        return "rembrandt"
    if "beauty_dish" in mod and ("beauty" in m or "natural" in m):
        return "loop"

    # If it's a 2-light portrait kit and dramatic, rembrandt-ish is the safest default
    if gear in ("basic_2_light", "speedlight_2_light") and "dramatic" in m:
        return "rembrandt"

    # Mood-based defaults when position/fill data isn't available.
    # Never default to split — it requires hard 90° side evidence.
    # Rembrandt is the safest dramatic default (45° key, triangle shadow).
    if m in ("cinematic", "low_key", "lowkey"):
        return "rembrandt"
    if m in ("corporate",):
        return "loop"
    if m in ("editorial",):
        return "rembrandt"
    if m in ("high_key", "highkey"):
        return "clamshell"

    return "unknown"


def shadow_expectations_for(pattern: str) -> Dict[str, Any]:
    """
    Photographer-speak shadow expectations + what to fix.
    """
    p = (pattern or "").lower()

    if p == "triangle":
        return {
            "pattern": "Triangle (Hurley-style)",
            "what_you_should_see": [
                "Three catchlights forming a triangle in each eye.",
                "Nearly shadowless face with subtle dimension from angled keys.",
                "Clean jawline — no hard shadow under chin.",
                "Even skin exposure across both sides of face.",
                "Background blown clean white with no visible gradient.",
            ],
            "what_means_it_is_wrong": [
                "One side brighter than the other → lights not balanced; meter both sides independently.",
                "Hard nose shadow appearing → one light too high or too far to the side; bring it back toward center.",
                "Only two catchlights visible → third light not reaching the eyes; move it closer or raise it slightly.",
                "Flat or waxy skin look → lights too close; move all three back 6–12 inches.",
                "Hot spot on forehead → lower the two upper lights or feather them slightly.",
            ],
            "fix_order": [
                "Balance power between all three lights (meter each independently at subject position).",
                "Adjust angles — small moves only, 5–10° at a time.",
                "Then adjust distance (all three should move together to maintain the triangle shape).",
            ],
        }

    if p in ("rembrandt", "rembrandt-ish"):
        return {
            "pattern": "Rembrandt-ish",
            "what_you_should_see": [
                "A small Rembrandt triangle on the shadow cheek (not huge, not missing).",
                "A nose shadow that trends toward the cheek (not a long sideways slash).",
                "Eyes still have life (no dead sockets).",
                "Jawline has shape — not filled flat, not crushed to black."
            ],
            "what_means_it_is_wrong": [
                "Triangle missing and face is flat → key too frontal OR too much fill/room bounce.",
                "Triangle huge and eye socket goes dark → key too far to the side OR too high OR fill too weak.",
                "Raccoon eyes → key too high or brow blocking; lower key a bit."
            ],
            "fix_order": [
                "Feather/flag first (control spill and bounce).",
                "Move the key (angle + height).",
                "Then adjust power (last)."
            ],
        }

    if p == "clamshell":
        return {
            "pattern": "Clamshell",
            "what_you_should_see": [
                "Soft, even light with a clean shadow under the nose (small).",
                "Under-eye shadows are filled (no raccoon).",
                "Catchlights are symmetrical/centered and flattering.",
                "Chin shadow is controlled (not heavy)."
            ],
            "what_means_it_is_wrong": [
                "Under-eye shadows still present → fill too weak/too low or key too high.",
                "Double catchlights ('double headlights') → fill too strong or placed wrong.",
                "Flat/washed face → too much fill or too much bounce; add negative fill at sides."
            ],
            "fix_order": [
                "Raise/lower fill (reflector or fill light).",
                "Adjust key height (don’t over-height it).",
                "Then adjust power."
            ],
        }

    if p in ("split", "split/short", "short"):
        return {
            "pattern": "Split / Short Lighting",
            "what_you_should_see": [
                "One side of the face lit, the other in deep shadow (strong drama).",
                "A crisp cheek/jaw cut with intentional negative space.",
                "Separation edge (rim/kicker) is subtle, not blown."
            ],
            "what_means_it_is_wrong": [
                "Shadow side is unusably black → add minimal fill (-3 stops) or bring key slightly forward.",
                "Looks flat → key too frontal; move it further to the side and add negative fill."
            ],
            "fix_order": [
                "Move key further to the side (or forward if too harsh).",
                "Add/adjust negative fill.",
                "Then adjust power."
            ],
        }

    if p == "loop":
        return {
            "pattern": "Loop",
            "what_you_should_see": [
                "A small ‘loop’ nose shadow that does NOT connect to the lip.",
                "Nice cheek shaping without heavy darkness.",
                "Eyes are bright with a clean catchlight."
            ],
            "what_means_it_is_wrong": [
                "Nose shadow too long/harsh → key too far to the side; bring it forward.",
                "Face looks flat → key too frontal; move it slightly more off-axis and add negative fill."
            ],
            "fix_order": [
                "Move key (small changes, 10–15°).",
                "Feather the key.",
                "Then adjust power."
            ],
        }

    return {
        "pattern": "Unknown",
        "what_you_should_see": [
            "Intentional shadow shape (not random).",
            "Catchlights present (unless pose is profile).",
            "No blown highlights on skin."
        ],
        "what_means_it_is_wrong": [
            "Flat face → too much fill/bounce.",
            "Dead shadows → add a touch of fill or reduce negative fill.",
            "Neon rim → reduce rim 1 stop or flag it."
        ],
        "fix_order": [
            "Feather/flag",
            "Move lights",
            "Adjust power"
        ],
    }


def catchlight_plan_for(modifier_family: str, pattern: str) -> Dict[str, Any]:
    """
    Strong catchlight guidance in portrait terms.
    """
    mod = (modifier_family or "").lower()
    p = (pattern or "").lower()

    if "beauty_dish" in mod:
        expected_shape = "Round / defined (beauty dish look)"
    elif "softbox" in mod:
        expected_shape = "Softbox shape (rect/oct), softer edge"
    elif "umbrella" in mod:
        expected_shape = "Broad umbrella catchlight (can be large)"
    else:
        expected_shape = "Shape depends on modifier"

    ideal = "10–11 o’clock or 12 o’clock in the iris"
    if p == "clamshell":
        ideal = "Centered/top (11–1 o’clock), symmetrical and flattering"
    if p == "triangle":
        ideal = "Three catchlights in a triangle — two upper (10 and 2 o’clock), one lower (5–6 o’clock)"

    if p == "triangle":
        return {
            "goal": "Three clean catchlights per eye forming an even triangle. This is the signature look.",
            "expected_shape": expected_shape,
            "ideal_position": "Two upper catchlights at 10 and 2 o’clock, one lower at 5–6 o’clock",
            "avoid": [
                "Missing third catchlight — means the low fill isn’t reaching the eyes.",
                "Uneven triangle (one catchlight bigger) — lights at different distances.",
                "Catchlights merging into a blob — lights too close together, spread them out.",
                "Extra catchlight from background or bounce — flag or kill the spill source.",
            ],
            "quick_fixes": [
                "Missing bottom catchlight: raise the low fill slightly or angle it more toward the face.",
                "Uneven triangle: measure distances from each light to subject — they should match.",
                "One catchlight too bright: that light is closer or higher power — pull it back or dim it.",
            ],
        }

    return {
        "goal": "One clean catchlight per eye. Portrait pop depends on this.",
        "expected_shape": expected_shape,
        "ideal_position": ideal,
        "avoid": [
            "Double catchlights (‘double headlights’) unless intentional.",
            "Catchlight so high the eyes go dead.",
            "Rim/hair light creating a second catchlight."
        ],
        "quick_fixes": [
            "No catchlight: lower the key a few inches or aim slightly more toward the eyes (reduce feather a touch).",
            "Catchlight too high: lower key.",
            "Two catchlights: flag the rim from hitting the eyes; keep fill as reflector or drop fill to -3 stops."
        ],
    }
