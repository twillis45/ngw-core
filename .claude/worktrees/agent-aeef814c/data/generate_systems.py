"""Generate 30 lighting systems from taxonomy.json.

Every system is validated against:
  - Environment gear_allowed / modifier_allowed constraints
  - Criteria composition formula (gear + modifier + environment)
  - Modifier calculation formula (mood × skin_tone)
  - ID/name construction rules
  - No duplicate IDs or functional setups
"""

import json
from pathlib import Path

TAX = json.loads(Path("data/taxonomy.json").read_text())

# Build lookup dicts
GEAR = {g["id"]: g for g in TAX["gear_profiles"]["enums"]}
MODS = {m["id"]: m for m in TAX["modifier_families"]["enums"]}
MOODS = {m["id"]: m for m in TAX["mood_definitions"]["enums"]}
ENVS = {e["id"]: e for e in TAX["environment_constraints"]["enums"]}
TONES = {t["id"]: t for t in TAX["skin_tone_handling"]["enums"]}

CRITERIA_KEYS = ["brightness", "energy_efficiency", "color_accuracy", "lifespan_hours", "cost_effectiveness"]
FEATURE_KEYS = ["dimmable", "smart_ready", "waterproof"]


def compute_criteria(gear_id, mod_id, env_id):
    g = GEAR[gear_id]["criteria"]
    m = MODS[mod_id]["criteria_adjustments"]
    e = ENVS[env_id]["criteria_adjustments"]
    return {k: g.get(k, 0) + m.get(k, 0) + e.get(k, 0) for k in CRITERIA_KEYS}


def compute_features(gear_id, mod_id):
    g = GEAR[gear_id]["features"]
    m = MODS[mod_id].get("features", {})
    merged = dict(g)
    for k, v in m.items():
        merged[k] = merged.get(k, False) or v
    # Ensure all 3 keys present
    for k in FEATURE_KEYS:
        merged.setdefault(k, False)
    return merged


def compute_modifier(mood_id, tone_id):
    return round(MOODS[mood_id]["scoring_modifier"] * TONES[tone_id]["modifier_bias"], 4)


def validate_env(gear_id, mod_id, env_id):
    env = ENVS[env_id]
    ga = env["gear_allowed"]
    ma = env["modifier_allowed"]
    if ga != ["ALL"] and gear_id not in ga:
        return False
    if ma != ["ALL"] and mod_id not in ma:
        return False
    return True


def make_id(gear_id, mod_id, env_id):
    return f"{gear_id}__{mod_id}__{env_id}"


def make_name(gear_id, mod_id, env_id):
    return f"{GEAR[gear_id]['label']} + {MODS[mod_id]['label']} ({ENVS[env_id]['label']})"


# 30 hand-curated combinations: (gear, modifier, environment, mood, tone, difficulty, setup_min, why, failures, substitutions)
COMBOS = [
    # --- STUDIO LARGE ---
    ("strobe_mono", "softbox_octa", "studio_large", "beauty", "medium", 2, 15,
     "The gold standard for beauty portraiture. Octa gives round catchlights, strobe freezes motion, CRI 96+ renders skin accurately. Medium tones need no special handling.",
     ["Octa too close causes uneven falloff across face", "Modeling lamp heat can wilt makeup over long sessions", "Recycle time limits rapid-fire shooting"],
     [{"if_missing": "softbox_octa", "use": "softbox_rect", "tradeoff": "Rectangular catchlights; slightly less wrap on cheekbones"}]),

    ("strobe_mono", "beauty_dish", "studio_large", "beauty", "dark", 3, 20,
     "Beauty dish sculpts dark skin with dimensional contrast while maintaining highlight detail. CRI 96 reveals undertone richness. The 1.05 tone bias rewards high-CRI setups.",
     ["Silver dish adds too much specular on oily skin — switch to white dish", "Without fill below, chin shadow goes too deep", "Dish must be precisely centered on face axis"],
     [{"if_missing": "beauty_dish", "use": "softbox_octa", "tradeoff": "Loses the signature contrasty-yet-smooth quality; becomes flatter"}]),

    ("strobe_pack", "diffusion_panel", "studio_large", "high_key", "varied", 4, 35,
     "Pack system punches through a large diffusion panel to create a wall of soft light. Best setup for group portraits with varied skin tones — wide dynamic range handled by massive soft source.",
     ["Panel must be very large (180cm+) or light falls off at edges of group", "Power pack required — monolight lacks punch through heavy diffusion", "Expensive setup; not cost-effective for solo headshots"],
     [{"if_missing": "diffusion_panel", "use": "umbrella_shoot_through", "tradeoff": "Less even coverage; more spill; harder to control background"}]),

    ("fresnel", "grid_spot", "studio_large", "cinematic", "medium", 4, 30,
     "Fresnel with grid produces a tight, controlled beam for cinematic key light. Creates hard-edged shadow pools and dramatic falloff. Grid prevents spill onto background.",
     ["Grid narrows beam so much that subject movement ruins the shot", "Color temp can drift on cheaper fresnels", "No fill — shadow side goes completely black without secondary light"],
     [{"if_missing": "grid_spot", "use": "bare_bulb", "tradeoff": "Loses spill control; background contamination; wider beam requires flagging"}]),

    ("strobe_mono", "bare_bulb", "studio_large", "low_key", "light", 3, 10,
     "Bare strobe at distance creates hard, dramatic shadows for low-key portraiture. Light skin's high reflectance makes metering straightforward. Fast setup — no modifier to mount.",
     ["Blown highlights on forehead and nose bridge if too close", "Every skin imperfection is visible", "Spill hits everything — needs flags or v-flats for background control"],
     [{"if_missing": "bare_bulb", "use": "grid_spot", "tradeoff": "More controlled but less raw-dramatic character; loses the point-source specular quality"}]),

    ("led_cob", "softbox_rect", "studio_large", "corporate", "varied", 2, 15,
     "COB through rectangular softbox is the repeatable corporate headshot machine. Continuous light means WYSIWYG — critical when shooting 50+ subjects back-to-back. CRI 96 handles all skin tones.",
     ["Continuous light heats up the modifier over long sessions", "Lower flash-freeze capability means motion blur if subject moves", "Rectangular catchlight reads less 'premium' than octagonal"],
     [{"if_missing": "softbox_rect", "use": "softbox_octa", "tradeoff": "Round catchlights; slightly less even coverage on full-body shots"}]),

    ("strobe_mono", "softbox_rect", "studio_large", "high_key", "light", 2, 20,
     "Large rectangular softbox wraps light evenly for clean high-key looks. Light skin benefits from the broad diffusion preventing hot spots. Combined with white background and fill, achieves near-shadowless illumination.",
     ["Requires secondary fill or reflector to eliminate chin shadow completely", "Softbox size must match framing — too small creates visible falloff", "White background needs separate lighting to avoid going gray"],
     [{"if_missing": "softbox_rect", "use": "umbrella_shoot_through", "tradeoff": "More spill; less directional control; cheaper but sloppier high-key"}]),

    ("led_cob", "beauty_dish", "studio_large", "editorial", "dark", 4, 25,
     "COB through beauty dish gives the contrasty editorial look while continuous output lets the photographer fine-tune shadow depth in real time. CRI 96 is critical for dark skin undertone rendering.",
     ["Beauty dish size must be ≥22 inches or light becomes too hard", "Continuous means ambient contamination in non-blackout studios", "Subject sees the bright light — causes squinting over long sessions"],
     [{"if_missing": "beauty_dish", "use": "softbox_octa", "tradeoff": "Flatter, less editorial edge; loses the signature dish 'pop'"}]),

    # --- STUDIO SMALL ---
    ("strobe_mono", "umbrella_shoot_through", "studio_small", "natural", "medium", 1, 8,
     "The simplest effective portrait setup. Shoot-through umbrella on a monolight creates broad, forgiving light that emulates window light. Perfect for beginners and quick sessions.",
     ["Umbrella spills light everywhere — small room becomes a bounce box", "No spill control means background is also lit", "Cheap umbrellas yellow with age, shifting color"],
     [{"if_missing": "umbrella_shoot_through", "use": "umbrella_reflective", "tradeoff": "More directional; less wrap; slightly harder shadows"}]),

    ("led_panel", "bare_bulb", "studio_small", "corporate", "medium", 1, 5,
     "LED panel with no modifier is the fastest corporate headshot setup. Panel's inherent diffusion is already soft enough at close range. Bi-color lets you match any ambient.",
     ["Panel must be large enough (≥60cm diagonal) or light goes hard", "Budget panels under CRI 90 make skin look sickly", "No modeling lamp — what you see is what you get, but also no freeze"],
     [{"if_missing": "bare_bulb", "use": "diffusion_panel", "tradeoff": "N/A — bare_bulb means no modifier; adding diffusion panel softens further but kills output"}]),

    ("speedlight", "softbox_octa", "studio_small", "beauty", "light", 2, 12,
     "Speedlight in a small octa is the budget beauty setup. Small room means short distance, which makes even a small modifier appear large relative to the subject. Light skin's reflectance compensates for limited flash power.",
     ["Recycle time is slow at full power — can't shoot rapid sequences", "Batteries drain fast; always have spares", "Small octa still produces harder light than full-size — visible texture"],
     [{"if_missing": "softbox_octa", "use": "umbrella_shoot_through", "tradeoff": "Loses round catchlights; more spill in small room; cheaper but less refined"}]),

    ("ring_light", "bare_bulb", "studio_small", "beauty", "dark", 1, 3,
     "Ring light provides perfectly even facial illumination with the signature doughnut catchlight. On dark skin, the axial light minimizes shadow pockets and reveals even skin tone across the face. Virtually zero setup time.",
     ["Flat lighting eliminates all facial dimension — nose and jaw lose definition", "Creates weird shadow halos on background if subject stands too close to wall", "Limited power — useless beyond headshot distance"],
     [{"if_missing": "bare_bulb", "use": "diffusion_panel", "tradeoff": "N/A — ring light is self-contained; bare_bulb is the default state"}]),

    ("led_cob", "grid_spot", "studio_small", "low_key", "medium", 3, 15,
     "COB with grid in a small dark room creates intense, focused low-key portraits. The small space actually helps — less stray light to contaminate the dark background. Grid controls spill precisely.",
     ["Grid must be properly seated or creates asymmetric hot spots", "Subject has very little room to move before leaving the beam", "Room reflections from light walls ruin low-key — needs dark walls or v-flats"],
     [{"if_missing": "grid_spot", "use": "snoot", "tradeoff": "Even tighter beam; more dramatic but less usable area; harder to aim"}]),

    ("strobe_mono", "softbox_octa", "studio_small", "corporate", "dark", 2, 15,
     "Proven corporate headshot setup scaled for home studios. Octa provides round catchlights that read professionally. Strobe's CRI 96 is critical for rendering dark skin undertones accurately in consistent headshot batches.",
     ["Octa may be too large for very small rooms — consider 90cm max", "Need to meter carefully — strobe can overpower at close range", "Background separation is harder in small spaces"],
     [{"if_missing": "softbox_octa", "use": "umbrella_reflective", "tradeoff": "Directional bounce; no round catchlight; less premium look but more compact"}]),

    # --- ON-LOCATION INDOOR ---
    ("speedlight", "umbrella_shoot_through", "on_location_indoor", "corporate", "varied", 2, 10,
     "The workhorse location headshot kit. Speedlight in an umbrella fits in a carry bag, sets up in minutes, runs on batteries. Shoot-through umbrella is forgiving enough for varied skin tones in office environments.",
     ["Low power — struggles against bright office windows", "Mixed ambient color casts (fluorescent + daylight) need gelling", "Umbrella can blow over if HVAC vent is overhead"],
     [{"if_missing": "umbrella_shoot_through", "use": "bare_bulb", "tradeoff": "Bounce off white ceiling instead; uncontrolled but passable in white-walled offices"}]),

    ("led_panel", "diffusion_panel", "on_location_indoor", "natural", "dark", 3, 20,
     "LED panel through a diffusion frame mimics a large window. Continuous output lets you shape light in real time — essential for dark skin where you need to see exactly how shadows fall before shooting.",
     ["Needs a large frame (120cm+) which is awkward to transport", "LED panel alone may lack punch through diffusion; need high-output model", "Ambient contamination from overhead fluorescents shifts color"],
     [{"if_missing": "diffusion_panel", "use": "umbrella_shoot_through", "tradeoff": "Smaller effective source; less even; more spill; but far more portable"}]),

    ("natural_window", "diffusion_panel", "on_location_indoor", "natural", "light", 1, 5,
     "Window light through a sheer curtain or diffusion panel is portraiture's oldest technique. Zero electricity, perfect CRI, beautiful soft falloff. Light skin's high reflectance means even weak window light produces usable exposure.",
     ["Completely dependent on weather and time of day", "No repeatable power control — each session is different", "Falls off rapidly on the shadow side — needs reflector fill or second light"],
     [{"if_missing": "diffusion_panel", "use": "bare_bulb", "tradeoff": "Use window with no diffusion (curtain); harder light but still natural quality"}]),

    ("led_cob", "softbox_octa", "on_location_indoor", "beauty", "medium", 3, 20,
     "COB in an octa gives studio-quality beauty light in a hotel room or office. Bowens mount means the same modifier you use in studio travels to location. Continuous output is reassuring for subjects unfamiliar with flash.",
     ["COB generates significant heat in enclosed rooms", "Needs AC power — battery options exist but are heavy and expensive", "Octa setup takes time and the room needs enough space to position it at proper distance"],
     [{"if_missing": "softbox_octa", "use": "umbrella_reflective", "tradeoff": "Faster setup; lighter; less even but still reasonable beauty quality"}]),

    ("led_tube", "gel_cto", "on_location_indoor", "cinematic", "medium", 3, 15,
     "LED tube with a warm CTO gel creates a motivated practical-light look — as if the subject is lit by a lamp, candle, or fireplace. The tube's linear shape adds an interesting gradient across the face.",
     ["Very low output — only works in dark rooms or as accent light", "CTO stacks with the tube's already-warm setting — can go too orange", "Linear source creates unusual shadow patterns that may distract"],
     [{"if_missing": "gel_cto", "use": "bare_bulb", "tradeoff": "Lose the warm motivated look; tube's bare bi-color output is neutral; adjust color temp on the tube itself"}]),

    ("ring_light", "bare_bulb", "on_location_indoor", "beauty", "light", 1, 3,
     "Ring light in a hotel room or office for quick beauty-style content. Completely self-contained, no light stands needed. Even illumination prevents harsh shadows on light skin that might reveal texture.",
     ["Flat lighting — no facial dimension or drama", "Limited throw distance; only works for headshots", "Competes with ambient overhead lighting; may need to turn room lights off"],
     [{"if_missing": "bare_bulb", "use": "diffusion_panel", "tradeoff": "N/A — ring light is self-contained; bare_bulb is default"}]),

    # --- ON-LOCATION OUTDOOR ---
    ("speedlight", "umbrella_reflective", "on_location_outdoor", "natural", "medium", 2, 10,
     "Speedlight bounced into a reflective umbrella fills shadows in outdoor portraits while matching the quality of ambient daylight. Silver umbrella adds catchlight energy; white umbrella gives softer fill.",
     ["Wind collapses or catches the umbrella — need sandbag on stand", "Must overpower sun at close range; may need high-sync or ND filter", "Batteries drain faster in cold weather"],
     [{"if_missing": "umbrella_reflective", "use": "bare_bulb", "tradeoff": "Direct flash fill; harsh but effective for balancing sun; use at lower power for ratio control"}]),

    ("reflector_only", "bare_bulb", "on_location_outdoor", "natural", "dark", 1, 2,
     "Silver/white reflector bouncing sunlight is the simplest outdoor fill for dark skin. Zero power required. Brings shadow-side exposure up to reveal undertone detail without overpowering the natural light.",
     ["Completely dependent on sun position and intensity", "Silver side creates specular kick that can be harsh", "Requires an assistant to hold and aim the reflector"],
     [{"if_missing": "bare_bulb", "use": "diffusion_panel", "tradeoff": "N/A — reflector is passive; bare_bulb is its default state; alternatively use diffusion panel OVER subject to soften direct sun instead of bouncing"}]),

    ("speedlight", "gel_cto", "on_location_outdoor", "cinematic", "light", 3, 12,
     "CTO-gelled speedlight matches golden-hour warmth during blue hour or shade, creating a warm/cool color contrast that reads as cinematic. Light skin picks up the warm tone beautifully.",
     ["Gel reduces already-limited speedlight output", "Must balance flash exposure with rapidly changing ambient", "Gel can melt or detach from flash head in hot weather"],
     [{"if_missing": "gel_cto", "use": "bare_bulb", "tradeoff": "Lose warm/cool contrast; flash will look neutral-cool against warm ambient; less cinematic"}]),

    ("natural_window", "diffusion_panel", "on_location_outdoor", "natural", "varied", 2, 5,
     "Diffusion panel held overhead converts direct sunlight into a massive soft source — essentially creating a portable window. Best outdoor option for group portraits with varied skin tones.",
     ["Needs assistants or C-stands to hold the frame", "Wind makes large frames dangerous — can sail away", "Only works when sun is high enough to shoot through; useless on overcast days"],
     [{"if_missing": "diffusion_panel", "use": "umbrella_shoot_through", "tradeoff": "Much smaller coverage; can't cover a group; but works for singles in a pinch"}]),

    ("led_panel", "bare_bulb", "on_location_outdoor", "corporate", "medium", 2, 8,
     "Battery-powered LED panel provides consistent fill for outdoor corporate headshots. No flash pops — subjects stay relaxed. Bi-color dial matches ambient from golden hour to overcast.",
     ["Low power — struggles to fill against direct sun; best in shade", "Wind can topple light panel on stand", "Continuous drain on battery; limited shoot duration"],
     [{"if_missing": "bare_bulb", "use": "diffusion_panel", "tradeoff": "N/A — panel has no modifier mount; bare_bulb is default; aim to use in open shade where raw output suffices"}]),

    # --- EVENT ---
    ("speedlight", "bare_bulb", "event", "natural", "varied", 1, 2,
     "On-camera or bracket-mounted speedlight is the event photographer's survival tool. TTL metering handles varying distances and skin tones automatically. Fastest possible setup.",
     ["Direct flash is harsh and unflattering — bounce off ceiling when possible", "TTL can be fooled by white wedding dresses or dark suits", "Recycle time causes missed moments at full power"],
     [{"if_missing": "bare_bulb", "use": "gel_cto", "tradeoff": "Gel warms flash to match tungsten venue lighting; better color but lower output"}]),

    ("speedlight", "gel_cto", "event", "cinematic", "medium", 2, 5,
     "CTO-gelled speedlight blends with warm venue lighting (tungsten chandeliers) instead of fighting it. Set camera white balance to tungsten — gelled flash matches, ambient matches, everything is warm and cohesive.",
     ["Must remember to remove gel when moving to daylight-balanced areas", "Reduces flash power by ~1 stop", "Gel attachment can fall off during fast-paced shooting"],
     [{"if_missing": "gel_cto", "use": "bare_bulb", "tradeoff": "Flash goes cool-white against warm ambient; creates orange/blue color clash; fixable in post but less cohesive"}]),

    ("led_tube", "bare_bulb", "event", "editorial", "dark", 2, 3,
     "Handheld LED tube as a creative accent light at events. Hold it just out of frame for an editorial rim or edge light. RGB capability lets you match or contrast venue colors. Waterproof — survives outdoor receptions.",
     ["Very low output — accent only, not a key light", "Must be hand-held or clamped creatively — no standard mount", "RGB color choices can look gimmicky if overdone"],
     [{"if_missing": "bare_bulb", "use": "gel_cto", "tradeoff": "N/A — tube is self-contained; use built-in color control instead of external gel"}]),

    ("speedlight", "umbrella_shoot_through", "event", "corporate", "light", 2, 8,
     "Off-camera speedlight with shoot-through umbrella for event headshot stations. Quick-collapse umbrella fits in a small footprint. Light skin's reflectance means even a small flash produces well-exposed results.",
     ["Umbrella footprint blocks traffic in tight venues", "Wind at outdoor receptions collapses it", "Must be tethered to camera via radio trigger — another failure point"],
     [{"if_missing": "umbrella_shoot_through", "use": "bare_bulb", "tradeoff": "Bounce off nearby wall or ceiling instead; less controlled but zero extra footprint"}]),

    ("led_panel", "bare_bulb", "event", "natural", "dark", 1, 3,
     "Small LED panel on a bracket gives continuous fill at events. Dark skin benefits from the constant output — you can see exactly how the light falls before pressing the shutter. No flash pops disturb the event.",
     ["Very limited power for anything beyond close range", "Panel size is small — light goes hard at distance", "Battery life is finite; carry spares"],
     [{"if_missing": "bare_bulb", "use": "gel_cto", "tradeoff": "N/A — panel is self-contained; use built-in bi-color to warm output instead"}]),
]

# --- Build systems ---
systems = []
seen_ids = set()
seen_functional = set()

for i, (gear, mod, env, mood, tone, diff, setup_min, why, failures, subs) in enumerate(COMBOS):
    # Validate against environment constraints
    assert validate_env(gear, mod, env), f"#{i}: {gear}/{mod} not allowed in {env}"

    sid = make_id(gear, mod, env)
    assert sid not in seen_ids, f"Duplicate id: {sid}"
    seen_ids.add(sid)

    functional_key = (gear, mod, env)
    assert functional_key not in seen_functional, f"Duplicate functional setup: {functional_key}"
    seen_functional.add(functional_key)

    criteria = compute_criteria(gear, mod, env)
    features = compute_features(gear, mod)
    modifier = compute_modifier(mood, tone)
    name = make_name(gear, mod, env)

    system = {
        "id": sid,
        "name": name,
        "criteria": criteria,
        "features": features,
        "modifier": modifier,
        "taxonomy_refs": {
            "gear_profile": gear,
            "modifier_family": mod,
            "environment": env,
            "mood": mood,
            "skin_tone": tone
        },
        "why_this_works": why,
        "failure_modes": failures,
        "substitutions": subs,
        "difficulty": diff,
        "setup_time_minutes": setup_min
    }
    systems.append(system)

assert len(systems) == 30, f"Expected 30, got {len(systems)}"

output = {
    "$schema": "https://ngw-core.dev/lighting-systems/v1.schema.json",
    "version": "1.0.0",
    "engine_compatibility": "ngw-core-v1.0",
    "taxonomy_version": "1.0.0",
    "total_systems": len(systems),
    "systems": systems
}

Path("data/lighting_systems.json").write_text(json.dumps(output, indent=2, ensure_ascii=False))
print(f"Generated {len(systems)} systems → data/lighting_systems.json")

# Validation summary
envs_used = set()
gears_used = set()
mods_used = set()
moods_used = set()
tones_used = set()
diffs = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
for s in systems:
    t = s["taxonomy_refs"]
    gears_used.add(t["gear_profile"])
    mods_used.add(t["modifier_family"])
    envs_used.add(t["environment"])
    moods_used.add(t["mood"])
    tones_used.add(t["skin_tone"])
    diffs[s["difficulty"]] += 1

print(f"\nCoverage:")
print(f"  Gear profiles:     {len(gears_used)}/{len(GEAR)} — {sorted(gears_used)}")
print(f"  Modifier families: {len(mods_used)}/{len(MODS)} — {sorted(mods_used)}")
print(f"  Environments:      {len(envs_used)}/{len(ENVS)} — {sorted(envs_used)}")
print(f"  Moods:             {len(moods_used)}/{len(MOODS)} — {sorted(moods_used)}")
print(f"  Skin tones:        {len(tones_used)}/{len(TONES)} — {sorted(tones_used)}")
print(f"  Difficulty spread:  {diffs}")
