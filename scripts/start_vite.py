"""Vite dev server launcher — called by .claude/launch.json via Python.

Python works in the preview_start sandbox (same as uvicorn); Node spawned
directly from the preview tool fails with EPERM: uv_cwd because the
sandbox restricts getcwd(). Spawning Node as a subprocess of Python avoids
this — Python sets a valid cwd for the child process.
"""
import os
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(PROJECT_ROOT, "ui")
os.chdir(UI_DIR)

result = subprocess.run(
    [
        "/usr/local/bin/node",
        "node_modules/.bin/vite",
    ],
    cwd=UI_DIR,
    env={**os.environ, "PATH": "/usr/local/bin:/usr/bin:/bin"},
)
sys.exit(result.returncode)
