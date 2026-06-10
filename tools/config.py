"""Shared configuration for tools.

Loads environment variables from `.env` once and exposes helpers so every
tool reads secrets and paths the same way. Import this at the top of any tool:

    from config import get_env, TMP_DIR
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Project root is the parent of this tools/ directory.
ROOT = Path(__file__).resolve().parent.parent
TMP_DIR = ROOT / ".tmp"
WORKFLOWS_DIR = ROOT / "workflows"

# Load .env from the project root.
load_dotenv(ROOT / ".env")


def get_env(key: str, required: bool = True, default: str | None = None) -> str | None:
    """Fetch an env var. Raises if required and missing — fail loud, fail early."""
    value = os.getenv(key, default)
    if required and not value:
        raise RuntimeError(
            f"Missing required env var: {key}. Add it to .env (see .env.example)."
        )
    return value


def tmp_path(name: str) -> Path:
    """Return a path inside .tmp/, creating the directory if needed."""
    TMP_DIR.mkdir(exist_ok=True)
    return TMP_DIR / name
