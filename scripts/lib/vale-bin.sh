#!/usr/bin/env sh

resolve_vale() {
  if [ -n "${VALE_BIN:-}" ]; then
    printf '%s
' "$VALE_BIN"
    return 0
  fi

  # Prefer the mise-pinned binary; mise.toml is the authoritative version source.
  if command -v mise >/dev/null 2>&1; then
    mise_vale="$(mise which vale 2>/dev/null)"
    if [ -n "$mise_vale" ] && [ -x "$mise_vale" ]; then
      printf '%s\n' "$mise_vale"
      return 0
    fi
  fi

  # Last-resort: accept whatever vale is on PATH (e.g. a system-wide install).
  if command -v vale >/dev/null 2>&1; then
    candidate="$(command -v vale)"
    if "$candidate" --version >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  printf '%s\n' "Unable to find a runnable Vale binary. Install Vale with mise (version is pinned in mise.toml) or set VALE_BIN." >&2
  return 1
}
