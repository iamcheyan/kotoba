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
import re
from urllib import error as urlerror
from urllib import parse, request


REPO_ROOT = Path(__file__).resolve().parents[1]
DICTIONARY_DIR = REPO_ROOT / "static" / "dictionaries"
CACHE_PATH = REPO_ROOT / ".cache" / "jlpt_translation_cache.json"
MANUAL_OVERRIDES: Dict[str, str] = {
    "woman 、女の人 )": "妇女，女士",
    "-- honorific form for 人  --; way of doing": "（敬语）人；方式，做法",
    "house; home -- polite word for 家  --": "（敬语）家，府上",
    "-- extra-modest  expression for 言う  --": "（谦逊语）说",
    "humble form of 行く , 聞く  and 来る": "（谦逊语）去、听、来",
    "to be visible; -- polite verb meaning 来る  --": "看得见；（敬语）来访",
    "-- honorific form of 食べる  and 飲む  --": "（敬语）吃、喝",
    "humble expression for 行く and 来る": "（谦逊语）去、来",
    "who": "谁",
}


def contains_cjk(text: str) -> bool:
    """Quickly check if the string already contains CJK characters."""
    for ch in text:
        code = ord(ch)
        if 0x4E00 <= code <= 0x9FFF or 0x3400 <= code <= 0x4DBF:
            return True
    return False


def split_meaning(raw: str) -> Tuple[str, str, str]:
    """
    Split the dictionary value into part-of-speech tag and the meaning text.

    The dictionaries follow the format "<POS> <gloss>". If the gloss is absent,
    the function returns an empty string for the second element.
    """
    stripped = raw.strip()
    if not stripped:
        return "", "", ""
    parts = stripped.split(None, 1)
    if len(parts) == 1:
        return parts[0], "", ""
    pos = parts[0]
    remainder = parts[1].strip()
    english = remainder
    chinese = ""
    if "；" in remainder:
        english_candidate, _, tail = remainder.partition("；")
        tail = tail.strip()
        if tail and contains_cjk(tail):
            english = english_candidate.strip()
            chinese = tail
    return pos, english.strip(), chinese


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
            _, english, chinese = split_meaning(meaning)
            if not english:
                continue
            if chinese:
                continue
            if english in seen:
                continue
            seen.add(english)
            english_segments.append(english)

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


def clean_chinese_translation(text: str) -> str:
    """Remove duplicate fragments and normalize delimiters."""
    if not text:
        return ""
    fragments = re.split(r"[；;，、/]+", text)
    seen: set[str] = set()
    cleaned: List[str] = []
    for fragment in fragments:
        part = fragment.strip()
        if not part:
            continue
        if not contains_cjk(part):
            continue
        if part in seen:
            continue
        seen.add(part)
        cleaned.append(part)
    if not cleaned and fragments:
        cleaned = [frag.strip() for frag in fragments if frag.strip()]
        if not cleaned:
            return ""
    return "，".join(cleaned)


def extract_primary_english(phrase: str) -> str:
    """Return the first English fragment before any full-width semicolon."""
    fragments = [frag.strip() for frag in phrase.split("；") if frag.strip()]
    if fragments:
        return fragments[0]
    return phrase.strip()


def save_cache(cache: Dict[str, str]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_PATH.open("w", encoding="utf-8") as handle:
        json.dump(cache, handle, ensure_ascii=False, indent=2)


def translate_phrases(phrases: List[str], cache: Dict[str, str]) -> Dict[str, str]:
    """Translate phrases sequentially with retries."""
    translations: Dict[str, str] = {}
    total = len(phrases)
    for index, phrase in enumerate(phrases, 1):
        primary = extract_primary_english(phrase)
        if primary in cache and contains_cjk(cache[primary]):
            translations[phrase] = cache[primary]
            cache[phrase] = cache[primary]
            continue
        if phrase in cache and contains_cjk(cache[phrase]):
            translations[phrase] = cache[phrase]
            continue
        if primary in MANUAL_OVERRIDES:
            manual = MANUAL_OVERRIDES[primary]
            translations[phrase] = manual
            cache[primary] = manual
            cache[phrase] = manual
            if index % 50 == 0 or index == total:
                save_cache(cache)
            if index % 200 == 0:
                print(f"Translated {index}/{total}", file=sys.stderr)
            continue
        success = False
        for attempt in range(5):
            try:
                translated = call_google_translate(primary).strip()
                normalized = clean_chinese_translation(translated) if contains_cjk(translated) else translated
                translations[phrase] = normalized
                cache[primary] = normalized
                cache[phrase] = normalized
                if index % 50 == 0 or index == total:
                    save_cache(cache)
                success = True
                if index % 200 == 0:
                    print(f"Translated {index}/{total}", file=sys.stderr)
                time.sleep(0.05)  # be gentle with the endpoint
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
            cache[phrase] = phrase
            save_cache(cache)
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
            pos, english, _ = split_meaning(meaning)
            if not english:
                continue
            chinese = translations.get(english, "").strip()
            if not chinese:
                continue
            chinese = clean_chinese_translation(chinese)
            if not chinese or not contains_cjk(chinese):
                continue
            new_value = merge_meaning(pos, english, chinese)
            if new_value != meaning:
                data[key] = new_value
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

    cache: Dict[str, str] = {}
    if CACHE_PATH.exists():
        try:
            with CACHE_PATH.open("r", encoding="utf-8") as handle:
                cache = json.load(handle)
        except Exception as exc:
            print(f"Failed to load cache: {exc}. Starting fresh.", file=sys.stderr)
            cache = {}
    if cache:
        changed = False
        for key, value in list(cache.items()):
            if contains_cjk(value):
                cleaned = clean_chinese_translation(value)
                if cleaned != value:
                    cache[key] = cleaned
                    changed = True
                primary = extract_primary_english(key)
                if primary and primary not in cache:
                    cache[primary] = cleaned
                    changed = True
        if changed:
            save_cache(cache)

    translations: Dict[str, str] = {}
    if english_segments:
        pending = [phrase for phrase in english_segments if phrase not in cache or not contains_cjk(cache.get(phrase, ""))]
        print(f"{len(english_segments)} unique English glosses; {len(pending)} require translation.")
        if pending:
            translations = translate_phrases(pending, cache)
    else:
        print("All JLPT dictionary entries already contain Chinese text.")

    cache.update(translations)
    save_cache(cache)
    update_dictionaries(dictionaries, cache, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
