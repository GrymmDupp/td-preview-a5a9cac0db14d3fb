#!/usr/bin/env python3
"""Load the PRIVATE full files into Supabase `listing_full` (upsert by listing_id).

Input : /workspace/twisted-deeds/_build/listings_full.json  (written by feed-repo/scripts/publish_feed.py;
        never published, never committed)
Output: rows in public.listing_full (see schema.sql). RLS keeps them readable only by accounts that
        unlocked the file (and moderators). This script writes with the service-role key, which
        bypasses RLS, so run it only on a trusted machine.

Environment (never hardcode keys):
  SUPABASE_URL               https://<project-ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  the service_role / secret key (Project Settings -> API)

Usage:
  python3 import_full_files.py --dry-run              # validate + show what would be sent; no network, no key needed
  python3 import_full_files.py                        # upsert all records
  python3 import_full_files.py --only castle-rock     # upsert one listing (repeatable)
  python3 import_full_files.py --file other.json --batch 25
"""
import argparse, base64, json, os, sys, urllib.error, urllib.request

DEFAULT_FILE = "/workspace/twisted-deeds/_build/listings_full.json"
COLUMNS = {  # listing_full column -> python type
    "listing_id": str, "story": str, "history": str, "timeline": list, "lore": str, "citations": str,
    "sources": list, "ownership_chain": str, "story_fields": dict, "dossier_md": str,
}
STORY_FIELD_KEYS = {"architectural_notes", "vacancy_years", "folklore_type", "failure_reason", "significance"}


def load(path):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    files = data.get("files") if isinstance(data, dict) else data
    if not isinstance(files, list):
        sys.exit(f"{path}: expected {{files: [...]}} or a list")
    return data if isinstance(data, dict) else {}, files


def to_row(rec):
    """Keep only listing_full columns, with defaults; return (row, problems)."""
    errs, row = [], {}
    for col, t in COLUMNS.items():
        v = rec.get(col, t())
        if v is None:
            v = t()
        if not isinstance(v, t):
            errs.append(f"{col} should be {t.__name__}")
            v = t()
        row[col] = v
    if not row["listing_id"].strip():
        errs.append("empty listing_id")
    for i, x in enumerate(row["timeline"]):
        if not (isinstance(x, dict) and isinstance(x.get("year"), int) and isinstance(x.get("text"), str)):
            errs.append(f"timeline[{i}] must be {{year:int, text:str}}")
    for i, x in enumerate(row["sources"]):
        if not (isinstance(x, dict) and str(x.get("url", "")).startswith("http")):
            errs.append(f"sources[{i}] must be {{url, label}}")
    extra = set(row["story_fields"]) - STORY_FIELD_KEYS
    if extra:
        errs.append(f"unknown story_fields keys {sorted(extra)}")
    return row, errs


def key_role(key):
    if key.startswith("sb_secret_"):
        return "service_role"
    if key.startswith("sb_publishable_"):
        return "anon"
    try:
        payload = key.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))).get("role", "?")
    except Exception:
        return "?"


def upsert(url, key, rows):
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/listing_full?on_conflict=listing_id",
        data=json.dumps(rows, ensure_ascii=False).encode(), method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        sys.exit(f"upsert failed: HTTP {e.code} {e.read().decode(errors='replace')[:500]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", default=DEFAULT_FILE)
    ap.add_argument("--dry-run", action="store_true", help="validate and print; send nothing")
    ap.add_argument("--only", action="append", default=[], help="listing_id to import (repeatable)")
    ap.add_argument("--batch", type=int, default=50)
    a = ap.parse_args()

    meta, files = load(a.file)
    rows, bad, seen = [], [], set()
    for rec in files:
        row, errs = to_row(rec if isinstance(rec, dict) else {})
        lid = row["listing_id"] or "?"
        if lid in seen:
            errs.append("duplicate listing_id")
        seen.add(lid)
        if errs:
            bad.append((lid, errs))
        elif not a.only or lid in a.only:
            rows.append(row)
    missing = sorted(set(a.only) - seen)
    print(f"file: {a.file} (generated {meta.get('generated_at', '?')}, sheet {meta.get('sheet', '?')})")
    print(f"records: {len(files)}  valid: {len(files) - len(bad)}  selected: {len(rows)}  invalid: {len(bad)}")
    for lid, errs in bad[:20]:
        print(f"  INVALID {lid}: {'; '.join(errs)}")
    if missing:
        print(f"  not in file: {', '.join(missing)}")
    if bad or missing:
        sys.exit(1)
    filled = {c: sum(1 for r in rows if r[c]) for c in COLUMNS if c != "listing_id"}
    print("non-empty per column: " + ", ".join(f"{c}={n}" for c, n in filled.items()))
    print(f"payload: {len(json.dumps(rows, ensure_ascii=False).encode()) // 1024} KB in {-(-len(rows) // a.batch)} batch(es) of <= {a.batch}")

    url, key = os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if a.dry_run:
        if rows:
            r = rows[0]
            print("first row (truncated): " + json.dumps({k: (v[:70] + "…" if isinstance(v, str) and len(v) > 70 else v if not isinstance(v, list) else f"[{len(v)} items]") for k, v in r.items()}, ensure_ascii=False))
        print(f"target: {url + '/rest/v1/listing_full' if url else '(SUPABASE_URL not set)'}; "
              f"key: {'set (role ' + key_role(key) + ')' if key else 'not set'}")
        print("DRY RUN: nothing was sent.")
        return
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never in this file).")
    if key_role(key) not in ("service_role", "?"):
        sys.exit(f"SUPABASE_SERVICE_ROLE_KEY looks like a '{key_role(key)}' key; listing_full needs the service_role key.")
    for i in range(0, len(rows), a.batch):
        upsert(url, key, rows[i:i + a.batch])
        print(f"upserted {min(i + a.batch, len(rows))}/{len(rows)}")
    print("done.")


if __name__ == "__main__":
    main()
