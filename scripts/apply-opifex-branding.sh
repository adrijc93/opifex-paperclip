#!/usr/bin/env bash
set -euo pipefail

# apply-opifex-branding.sh — Copia los assets de branding/  OPIFEX sobre ui/dist/
# Se ejecuta como postbuild en @paperclipai/ui para asegurar que los assets
# personalizados (favicons, iconos, etc.) queden en el dist final.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRANDING_DIR="$REPO_ROOT/branding"
UI_DIST="$REPO_ROOT/ui/dist"

if [ ! -d "$BRANDING_DIR" ]; then
  echo "  -> branding/ no encontrado, saltando."
  exit 0
fi

if [ ! -d "$UI_DIST" ]; then
  echo "  -> ui/dist/ no existe todavía, saltando branding copy."
  exit 0
fi

echo "  -> Aplicando branding OPIFEX sobre ui/dist/..."
# Copiar todo excepto README.md y archivos .css (ya integrados en el bundle)
find "$BRANDING_DIR" -type f \
  ! -name "README.md" \
  ! -name "*.css" \
  | while read -r src; do
    rel="${src#$BRANDING_DIR/}"
    dst="$UI_DIST/$rel"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "    copied: $rel"
  done

echo "  -> Branding OPIFEX aplicado."
