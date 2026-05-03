"""Deterministic pass-key hashing (HMAC-SHA256) for lookup without storing plaintext."""

from __future__ import annotations

import hashlib
import hmac


def hash_pass_key(pepper: str, pass_key: str) -> str:
    """Return hex digest used as ``pass_key_hash`` in ``user_credentials``."""
    key = pepper.encode("utf-8")
    msg = pass_key.strip().encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()
