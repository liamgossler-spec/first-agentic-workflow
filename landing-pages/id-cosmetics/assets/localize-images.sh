#!/usr/bin/env bash
# מוריד את תמונות ה-AI מה-CDN של Higgsfield לקבצים מקומיים,
# ומעדכן את index.html להשתמש בנתיבים המקומיים.
# להריץ מתיקיית id-cosmetics:  bash assets/localize-images.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="https://d8j0ntlcm91z4.cloudfront.net/user_36vm0A45O0HnenvQucMpC7VoGek"
declare -A IMAGES=(
  [hero]="hf_20260713_124745_c18ffcbc-3967-4c1b-bde0-cced736e8bb3"
  [laser]="hf_20260713_124748_ee60ac22-7641-4f33-861d-c14cfbd68acf"
  [facial]="hf_20260713_124756_0e101ea0-26c4-4086-851a-707d3ae5fe38"
  [products]="hf_20260713_124801_268f0e09-87d3-44db-85ab-3ad9505dcafe"
  [clinic]="hf_20260713_124804_6d6da688-55a2-4946-80fb-a132edd90663"
)

mkdir -p assets/img
for name in "${!IMAGES[@]}"; do
  key="${IMAGES[$name]}"
  echo "מוריד: $name"
  curl -fsS -o "assets/img/${name}.webp" "${BASE}/${key}_min.webp"      # גרסת web מוקטנת
  curl -fsS -o "assets/img/${name}-full.png" "${BASE}/${key}.png"       # מקור באיכות מלאה
  sed -i.bak "s|${BASE}/${key}_min.webp|assets/img/${name}.webp|g" index.html
done
rm -f index.html.bak
echo "בוצע. index.html משתמש עכשיו בתמונות מקומיות מתוך assets/img/"
