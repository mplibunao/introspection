#!/usr/bin/env sh

resolve_vale() {
  if [ -n "${VALE_BIN:-}" ]; then
    printf '%s
' "$VALE_BIN"
    return 0
  fi

  if command -v vale >/dev/null 2>&1; then
    candidate="$(command -v vale)"
    if "$candidate" --version >/dev/null 2>&1; then
      printf '%s
' "$candidate"
      return 0
    fi
  fi

  mise_vale="${HOME:-}/.local/share/mise/installs/vale/3.9.6/vale"
  if [ -x "$mise_vale" ]; then
    printf '%s
' "$mise_vale"
    return 0
  fi

  printf '%s
' "Unable to find a runnable Vale binary. Install Vale 3.9.6 with mise or set VALE_BIN." >&2
  return 1
}
