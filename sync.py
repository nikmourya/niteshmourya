"""
sync.py — Portfolio Data Sync Tool
====================================
Run this script whenever you update portfolio-data.json.
It automatically updates index.html to reflect your changes.

Usage:
    python sync.py

Both files (index.html and portfolio-data.json) must be in the same folder as this script.
"""

import json
import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_FILE  = os.path.join(SCRIPT_DIR, "portfolio-data.json")
HTML_FILE  = os.path.join(SCRIPT_DIR, "index.html")

def sync():
    # Check files exist
    if not os.path.exists(JSON_FILE):
        print(f"ERROR: Could not find portfolio-data.json in {SCRIPT_DIR}")
        return
    if not os.path.exists(HTML_FILE):
        print(f"ERROR: Could not find index.html in {SCRIPT_DIR}")
        return

    # Read files
    with open(JSON_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    with open(HTML_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    # Build minified JSON for embedding
    new_inline = json.dumps(data, separators=(",", ":"), ensure_ascii=False)

    # Replace INLINE_DATA block in HTML
    pattern = r"(const INLINE_DATA = )(\{.*?\});"
    new_html, count = re.subn(pattern, r"\g<1>" + new_inline + ";", html, flags=re.DOTALL)

    if count == 0:
        print("ERROR: Could not find INLINE_DATA block in index.html. Is this the right file?")
        return

    # Write updated HTML
    with open(HTML_FILE, "w", encoding="utf-8") as f:
        f.write(new_html)

    # Summary
    pub_count  = len(data.get("publications", []))
    exp_count  = len(data.get("experience", []))
    cert_count = len(data.get("certifications", []))
    name       = data.get("profile", {}).get("name", "Unknown")

    print("=" * 50)
    print("  Portfolio Sync Complete!")
    print("=" * 50)
    print(f"  Profile   : {name}")
    print(f"  Publications : {pub_count}")
    print(f"  Experience   : {exp_count}")
    print(f"  Certifications: {cert_count}")
    print()
    print("  index.html has been updated.")
    print("  Refresh your browser to see changes.")
    print("=" * 50)

if __name__ == "__main__":
    sync()
