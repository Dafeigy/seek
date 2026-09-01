#!/usr/bin/env bash

set -euo pipefail

if ! command -v ip >/dev/null 2>&1; then
  printf 'warning: ip command not found; no LAN development origins were detected\n' >&2
  detected_origins=""
else
  mapfile -t detected_addresses < <(
    ip -o -4 addr show up scope global 2>/dev/null |
      awk '
        $2 !~ /^(docker|br-|veth|virbr|podman|cni|flannel)/ {
          split($4, address, "/")
          if (address[1] !~ /^169\.254\./) print address[1]
        }
      ' |
      sort -u
  )

  detected_origins=""
  if ((${#detected_addresses[@]} > 0)); then
    detected_origins="$(IFS=,; printf '%s' "${detected_addresses[*]}")"
  fi
fi

export SEEK_DETECTED_DEV_ORIGINS="${detected_origins}"

if [[ -n "${SEEK_DETECTED_DEV_ORIGINS}" ]]; then
  printf 'Next.js LAN development origins: %s\n' "${SEEK_DETECTED_DEV_ORIGINS}"
else
  printf 'Next.js LAN development origins: none detected\n'
fi

if [[ "${1:-}" == "--print" ]]; then
  exit 0
fi

if (($# == 0)); then
  printf 'usage: %s COMMAND [ARGUMENT ...]\n' "$0" >&2
  exit 2
fi

exec "$@"
