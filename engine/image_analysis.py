from __future__ import annotations

from typing import Any, Dict, List, Tuple

try:
    from PIL import Image, ImageOps
except Exception:  # pragma: no cover
    Image = None  # type: ignore
    ImageOps = None  # type: ignore

from engine.vision_pipeline import analyze_image_regions


BASIC_COLOR_NAMES = [
    ("black", (0, 0, 0)),
    ("white", (255, 255, 255)),
    ("gray", (128, 128, 128)),
    ("red", (220, 20, 60)),
    ("orange", (255, 140, 0)),
    ("yellow", (255, 215, 0)),
    ("green", (34, 139, 34)),
    ("cyan", (0, 206, 209)),
    ("blue", (30, 144, 255)),
    ("purple", (138, 43, 226)),
    ("magenta", (255, 0, 255)),
    ("brown", (139, 69, 19)),
    ("beige", (245, 245, 220)),
]


def _rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{r:02x}{g:02x}{b:02x}"


def _dist2(a: Tuple[int, int, int], b: Tuple[int, int, int]) -> int:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def _nearest_basic_name(rgb: Tuple[int, int, int]) -> str:
    best = ("unknown", 10**18)
    for name, ref in BASIC_COLOR_NAMES:
        d = _dist2(rgb, ref)
        if d < best[1]:
            best = (name, d)
    return best[0]


def _is_grayscale_like(img_rgb: "Image.Image") -> bool:
    im = img_rgb.resize((96, 96))
    px = list(im.getdata())
    if not px:
        return True
    total = 0.0
    for (r, g, b) in px:
        total += abs(r - g) + abs(g - b) + abs(r - b)
    avg = total / float(len(px))
    return avg < 6.0


def _palette(img_rgb: "Image.Image", k: int = 6) -> List[Dict[str, Any]]:
    im = img_rgb.resize((160, 160)).convert("RGB")
    pal = im.convert("P", palette=Image.Palette.ADAPTIVE, colors=k)  # type: ignore[attr-defined]
    palette = pal.getpalette() or []
    color_counts = pal.getcolors() or []
    total = sum(c for c, _ in color_counts) or 1

    out: List[Dict[str, Any]] = []
    for count, idx in sorted(color_counts, reverse=True):
        base = idx * 3
        if base + 2 >= len(palette):
            continue
        rgb = (palette[base], palette[base + 1], palette[base + 2])
        out.append(
            {
                "rgb": list(rgb),
                "hex": _rgb_to_hex(rgb),
                "name": _nearest_basic_name(rgb),
                "pct": round(100.0 * (count / float(total)), 2),
            }
        )
    return out


def describe_image(path: str, describe_mode: str = "basic") -> Dict[str, Any]:
    """
    basic: safe stats + palettes (no subject claims)
    vision: adds segmentation-based palettes + pose guess (opencv+mediapipe)
    """
    if Image is None or ImageOps is None:
        return {"ok": False, "error": "Pillow not installed; cannot describe image."}

    img = Image.open(path)  # type: ignore
    img = ImageOps.exif_transpose(img)  # type: ignore
    img_rgb = img.convert("RGB")

    w, h = img_rgb.size
    aspect = (w / float(h)) if h else 0.0
    if aspect >= 1.20:
        orientation = "landscape"
    elif aspect <= 0.83:
        orientation = "portrait"
    else:
        orientation = "square-ish"

    grayscale_like = _is_grayscale_like(img_rgb)
    overall_palette = _palette(img_rgb, k=6)

    out: Dict[str, Any] = {
        "ok": True,
        "size": {"width": w, "height": h},
        "orientation": orientation,
        "aspect_ratio": round(aspect, 4),
        "is_grayscale_like": bool(grayscale_like),
        "palette": {
            "overall": overall_palette,
            "notes": [
                "Overall palette is global; it does not attribute colors to objects without vision mode.",
            ],
        },
        "subject": {
            "description": "unknown",
            "gender": "unknown",
            "pose": "unknown",
            "needs_user_confirmation": True,
        },
        "mode": describe_mode,
        "limits": [
            "basic mode does not infer subject attributes to avoid hallucination.",
        ],
    }

    if describe_mode == "vision":
        vision = analyze_image_regions(path)
        out["vision"] = vision
        # bubble up pose if available
        try:
            pose = vision.get("pose", {})
            if isinstance(pose, dict) and pose.get("ok"):
                out["subject"]["pose"] = pose.get("pose", "unknown")
        except Exception:
            pass

    return out
