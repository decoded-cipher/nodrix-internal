#!/usr/bin/env bash
# Render each frame-*.html to a 1270x760 PNG using headless Chrome.
# Output: ./out/01-hero.png ... ./out/06-stack.png
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
mkdir -p "$OUT"

declare -a FRAMES=(
  "01-hero:frame-01-hero.html"
  "02-dashboard:frame-02-dashboard.html"
  "03-howitworks:frame-03-howitworks.html"
  "04-curl:frame-04-curl.html"
  "05-automations:frame-05-automations.html"
  "06-stack:frame-06-stack.html"
)

for entry in "${FRAMES[@]}"; do
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
    --window-size=1270,760 \
    --screenshot="$dst" \
    "file://$src" >/dev/null 2>&1
  if [ ! -f "$dst" ]; then
    echo "  FAILED: $dst not produced"; exit 1
  fi
  # Resize back down to exactly 1270x760 (we rendered at 2x for crispness)
  if command -v sips >/dev/null 2>&1; then
    sips -z 760 1270 "$dst" --out "$dst" >/dev/null
  fi
done

echo
echo "Done. Files written to: $OUT"
ls -lh "$OUT"
