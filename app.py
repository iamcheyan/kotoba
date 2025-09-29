# -*- coding: utf-8 -*-
"""Flask application serving the Kotoba vocabulary trainer."""

from __future__ import annotations

import json
import os
import random
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from flask import Flask, abort, jsonify, request, send_from_directory
import pykakasi

# ---------------------------------------------------------------------------
# Configuration loading
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
_CONFIG_FILE = BASE_DIR / "config.json"
_DEFAULT_CONFIG = {
    "dictionaries": [
        {
            "path": "dictionaries/base.json",
            "name": "基础词库",
        }
    ],
    "default_dictionary": "dictionaries/base.json",
}

_kakasi = pykakasi.Kakasi()

app = Flask(__name__, static_folder="static", static_url_path="/static")

_dictionary_lock = threading.Lock()
_dictionary_cache: Dict[str, "DictionaryData"] = {}

_session_lock = threading.Lock()
_sessions: Dict[str, float] = {}
_SESSION_TTL_SECONDS = 65


@dataclass
class DictionaryEntry:
    kanji: str
    meaning: str
    reading: str
    romaji: str
    segments: List[Dict[str, object]]


@dataclass
class DictionaryData:
    id: str
    name: str
    path: str
    entries: List[DictionaryEntry]
    lookup: Dict[str, DictionaryEntry]
    mtime: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def load_config() -> Dict[str, object]:
    """Load application configuration from disk."""
    if not _CONFIG_FILE.exists():
        return _DEFAULT_CONFIG.copy()
    with _CONFIG_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


_CONFIG = load_config()


def _is_kanji(char: str) -> bool:
    return 0x4E00 <= ord(char) <= 0x9FFF


def _is_katakana(char: str) -> bool:
    return 0x30A0 <= ord(char) <= 0x30FF


def _build_segments(text: str) -> List[Dict[str, object]]:
    segments: List[Dict[str, object]] = []
    for piece in _kakasi.convert(text):
        orig = piece.get("orig", "")
        hira = piece.get("hira", "")
        hepburn = piece.get("hepburn", "")
        segments.append(
            {
                "text": orig,
                "reading": hira,
                "romaji": hepburn,
                "hasKanji": any(_is_kanji(ch) for ch in orig),
                "hasKatakana": any(_is_katakana(ch) for ch in orig),
            }
        )
    return segments


def _normalize_meaning(raw_meaning: str) -> str:
    if "(" in raw_meaning and ")" in raw_meaning:
        return raw_meaning.split(")", 1)[1].strip()
    return raw_meaning


def _to_reading_and_romaji(text: str) -> Dict[str, str]:
    pieces = _kakasi.convert(text)
    reading = " ".join(item.get("hira", "") for item in pieces if item.get("hira"))
    romaji = " ".join(item.get("hepburn", "") for item in pieces if item.get("hepburn"))
    return {"reading": reading, "romaji": romaji}


def _resolve_dictionary(identifier: Optional[str]) -> Optional[Dict[str, str]]:
    if not identifier:
        identifier = _CONFIG.get("default_dictionary")
    for item in _CONFIG.get("dictionaries", []):
        if identifier in {
            item.get("name"),
            item.get("path"),
            os.path.basename(item.get("path", "")),
        }:
            return item
    return None


def _load_dictionary(identifier: Optional[str]) -> DictionaryData:
    """Load and cache dictionary data."""
    record = _resolve_dictionary(identifier)
    if record is None:
        abort(404, description="Dictionary not found")

    rel_path = record["path"]
    abs_path = (BASE_DIR / rel_path).resolve()
    if not abs_path.exists():
        abort(404, description="Dictionary file missing")

    mtime = abs_path.stat().st_mtime
    cache_key = os.path.normpath(rel_path)

    with _dictionary_lock:
        cached = _dictionary_cache.get(cache_key)
        if cached and cached.mtime == mtime:
            return cached

        with abs_path.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)

        entries: List[DictionaryEntry] = []
        lookup: Dict[str, DictionaryEntry] = {}
        for kanji, meaning in raw.items():
            reading_info = _to_reading_and_romaji(kanji)
            entry = DictionaryEntry(
                kanji=kanji,
                meaning=_normalize_meaning(meaning),
                reading=reading_info["reading"],
                romaji=reading_info["romaji"],
                segments=_build_segments(kanji),
            )
            entries.append(entry)
            lookup[kanji] = entry

        data = DictionaryData(
            id=os.path.basename(rel_path),
            name=record.get("name", os.path.basename(rel_path)),
            path=rel_path,
            entries=entries,
            lookup=lookup,
            mtime=mtime,
        )
        _dictionary_cache[cache_key] = data
        return data


def _normalize_to_romaji(text: str) -> str:
    if not text:
        return ""
    pieces = _kakasi.convert(text)
    return "".join(piece.get("hepburn", "") for piece in pieces).lower()


def _touch_session(session_id: Optional[str]) -> int:
    now = time.time()
    with _session_lock:
        if session_id:
            _sessions[session_id] = now
        expired = [sid for sid, ts in _sessions.items() if now - ts > _SESSION_TTL_SECONDS]
        for sid in expired:
            _sessions.pop(sid, None)
        return len(_sessions)


def _check_answer(entry: DictionaryEntry, user_input: str) -> Dict[str, object]:
    """Compare user input with the correct entry."""
    normalized_input = (user_input or "").replace(" ", "").strip()
    if not normalized_input:
        return {"correct": False, "match": None, "userRomaji": ""}

    input_romaji = _normalize_to_romaji(normalized_input)
    kanji_romaji = _normalize_to_romaji(entry.kanji)
    reading_romaji = _normalize_to_romaji(entry.reading)
    target_romaji = entry.romaji.replace(" ", "").lower()

    correct = input_romaji in {kanji_romaji, reading_romaji, target_romaji}
    return {
        "correct": correct,
        "match": "romaji" if input_romaji == target_romaji else "reading" if input_romaji == reading_romaji else "kanji" if input_romaji == kanji_romaji else None,
        "userRomaji": input_romaji,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return send_from_directory(app.root_path, "index.html")


@app.get("/api/config")
def api_config():
    session_id = request.args.get("sessionId")
    online_users = _touch_session(session_id)

    dictionaries = []
    for item in _CONFIG.get("dictionaries", []):
        path_value = item.get("path")
        if not path_value:
            continue
        dictionaries.append(
            {
                "id": os.path.basename(path_value),
                "name": item.get("name", os.path.basename(path_value)),
            }
        )

    default_source = _CONFIG.get("default_dictionary")
    if default_source:
        default_id = os.path.basename(default_source)
    elif dictionaries:
        default_id = dictionaries[0]["id"]
    else:
        default_id = ""

    return jsonify(
        {
            "dictionaries": dictionaries,
            "default": default_id,
            "onlineUsers": online_users,
        }
    )


@app.get("/api/dictionaries/<dict_id>/random")
def api_random_word(dict_id: str):
    session_id = request.args.get("sessionId")
    dictionary = _load_dictionary(dict_id)
    entry = random.choice(dictionary.entries)
    online_users = _touch_session(session_id)

    return jsonify(
        {
            "dictionary": {
                "id": dictionary.id,
                "name": dictionary.name,
                "size": len(dictionary.entries),
            },
            "entry": {
                "kanji": entry.kanji,
                "meaning": entry.meaning,
                "reading": entry.reading,
                "romaji": entry.romaji,
                "segments": entry.segments,
            },
            "onlineUsers": online_users,
        }
    )


@app.post("/api/dictionaries/<dict_id>/check")
def api_check(dict_id: str):
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("sessionId")
    kanji = payload.get("kanji")
    answer = payload.get("answer", "")

    dictionary = _load_dictionary(dict_id)
    entry = dictionary.lookup.get(kanji)
    if entry is None:
        abort(404, description="Word not found in dictionary")

    result = _check_answer(entry, answer)
    online_users = _touch_session(session_id)

    return jsonify(
        {
            "correct": result["correct"],
            "match": result["match"],
            "onlineUsers": online_users,
            "answer": {
                "kanji": entry.kanji,
                "reading": entry.reading,
                "romaji": entry.romaji,
                "meaning": entry.meaning,
            },
            "user": {
                "raw": answer,
                "romaji": result["userRomaji"],
            },
        }
    )


@app.post("/api/ping")
def api_ping():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("sessionId")
    online_users = _touch_session(session_id)
    return jsonify({"onlineUsers": online_users})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
