#!/bin/sh
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/dist}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/data"

for f in index.html app.js styles.css _headers; do
  cp "$REPO_ROOT/$f" "$OUTPUT_DIR/$f"
done

echo "Cloudflare Pages assets built at $OUTPUT_DIR"
