#!/bin/sh
# Rebuilds docs/architecture.pdf from docs/architecture.html using headless Chrome.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$DIR/architecture.pdf" "file://$DIR/architecture.html"
