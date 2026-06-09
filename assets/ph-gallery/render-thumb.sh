#!/usr/bin/env bash
# Render thumbnail variants to 1080x1080 PNG via headless Chrome.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
mkdir -p "$OUT"

declare -a THUMBS=(
  "thumb:thumb.html"
)

for entry in "${THUMBS[@]}"; do
  name="${entry%%:*}"
  html="${entry##*:}"
  src="$HERE/$html"
  dst="$OUT/$name.png"
  echo "→ $name"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size=1080,1080 \
    --screenshot="$dst" \
    "file://$src" >/dev/null 2>&1
  if command -v sips >/dev/null 2>&1; then
    sips -z 1080 1080 "$dst" --out "$dst" >/dev/null
  fi
done

echo
echo "Done. Files written to: $OUT"
ls -lh "$OUT"/thumb*.png
