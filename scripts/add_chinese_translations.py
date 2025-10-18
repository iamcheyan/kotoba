#!/usr/bin/env python3
"""
Add Chinese translations to JLPT dictionary entries.

This script reads all JLPT JSON dictionaries located under static/dictionaries,
detects entries that still lack Chinese text in their meaning, translates the
English gloss into Simplified Chinese via the public Google Translate endpoint,
and appends the result after the original English gloss (separated by a
full-width semicolon).
"""

import argparse
import json
import sys
import time
from collections import OrderedDict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib import error as urlerror
from urllib import parse, request


REPO_ROOT = Path(__file__).resolve().parents[1]
DICTIONARY_DIR = REPO_ROOT / "static" / "dictionaries"


def contains_cjk(text: str) -> bool:
    """Quickly check if the string already contains CJK characters."""
    for ch in text:
        code = ord(ch)
        if 0x4E00 <= code <= 0x9FFF or 0x3400 <= code <= 0x4DBF:
            return True
    return False


def split_meaning(raw: str) -> Tuple[str, str]:
    """
    Split the dictionary value into part-of-speech tag and the meaning text.

    The dictionaries follow the format "<POS> <gloss>". If the gloss is absent,
    the function returns an empty string for the second element.
    """
    stripped = raw.strip()
    if not stripped:
        return "", ""
    parts = stripped.split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1].strip()


def collect_targets(files: Iterable[Path]) -> Tuple[Dict[Path, OrderedDict], List[str]]:
    """Load dictionaries and collect meanings that require translation."""
    dictionaries: Dict[Path, OrderedDict] = {}
    english_segments: List[str] = []
    seen: set[str] = set()

    for path in files:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle, object_pairs_hook=OrderedDict)
        dictionaries[path] = data

        for meaning in data.values():
            if not isinstance(meaning, str):
                continue
            _, gloss = split_meaning(meaning)
            if not gloss:
                continue
            if contains_cjk(gloss):
                continue
            if gloss in seen:
                continue
            seen.add(gloss)
            english_segments.append(gloss)

    return dictionaries, english_segments


def call_google_translate(text: str) -> str:
    """Translate a single phrase using Google's unofficial translate endpoint."""
    params = parse.urlencode(
        {
            "client": "gtx",
            "sl": "en",
            "tl": "zh-CN",
            "dt": "t",
            "q": text,
        }
    )
    url = f"https://translate.googleapis.com/translate_a/single?{params}"
    req = request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    return "".join(part[0] for part in data[0] if part and part[0])


def translate_phrases(phrases: List[str]) -> Dict[str, str]:
    """Translate phrases sequentially with retries."""
    translations: Dict[str, str] = {}
    for phrase in phrases:
        success = False
        for attempt in range(5):
            try:
                translated = call_google_translate(phrase).strip()
                translations[phrase] = translated
                success = True
                time.sleep(0.2)  # be gentle with the endpoint
                break
            except (urlerror.URLError, json.JSONDecodeError) as exc:  # pragma: no cover - defensive retry
                wait = 2 ** attempt
                print(
                    f"Translation failed for '{phrase}' (attempt {attempt + 1}/5): {exc}. Retrying in {wait}s...",
                    file=sys.stderr,
                )
                time.sleep(wait)
            except Exception as exc:  # pragma: no cover - defensive retry
                wait = 2 ** attempt
                print(
                    f"Unexpected error for '{phrase}' (attempt {attempt + 1}/5): {exc}. Retrying in {wait}s...",
                    file=sys.stderr,
                )
                time.sleep(wait)
        if not success:
            print(f"Failed to translate '{phrase}'. Using original text as fallback.", file=sys.stderr)
            translations[phrase] = phrase
    return translations


def merge_meaning(pos: str, english: str, chinese: str) -> str:
    """Compose the final meaning string with both English and Chinese glosses."""
    base = pos.strip()
    if english:
        base = f"{base} {english.strip()}"
    if chinese:
        base = f"{base}；{chinese.strip()}"
    return base


def update_dictionaries(dictionaries: Dict[Path, OrderedDict], translations: Dict[str, str], dry_run: bool = False) -> None:
    """Rewrite dictionary files with appended Chinese translations."""
    for path, data in dictionaries.items():
        updated = False
        for key, meaning in data.items():
            if not isinstance(meaning, str):
                continue
            pos, gloss = split_meaning(meaning)
            if not gloss or contains_cjk(gloss):
                continue
            chinese = translations.get(gloss, "").strip()
            if not chinese:
                continue
            data[key] = merge_meaning(pos, gloss, chinese)
            updated = True

        if updated and not dry_run:
            with path.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=4)
                handle.write("\n")
            print(f"Updated {path.relative_to(REPO_ROOT)}")
        elif updated:
            print(f"[dry-run] Would update {path.relative_to(REPO_ROOT)}")


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Append Chinese translations to JLPT dictionaries.")
    parser.add_argument("--dry-run", action="store_true", help="Do not modify files, just show what would change.")
    args = parser.parse_args(argv)

    jlpt_files = sorted(DICTIONARY_DIR.glob("jlpt_*.json"))
    if not jlpt_files:
        print("No JLPT dictionary files found.", file=sys.stderr)
        return 1

    dictionaries, english_segments = collect_targets(jlpt_files)
    if not english_segments:
        print("All JLPT dictionary entries already contain Chinese text.")
        return 0

    translations = translate_phrases(english_segments)
    update_dictionaries(dictionaries, translations, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
