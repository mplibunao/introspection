#!/usr/bin/env sh
set -eu

resolve_link() {
  target=$1

  while [ -L "$target" ]; do
    link=$(readlink "$target")
    case "$link" in
      /*) target=$link ;;
      *) target=$(dirname "$target")/$link ;;
    esac
  done

  printf '%s\n' "$target"
}

platform_id() {
  os=$(uname -s)
  arch=$(uname -m)

  case "$os:$arch" in
    Darwin:arm64) printf '%s\n' "darwin-arm64" ;;
    Linux:x86_64 | Linux:amd64) printf '%s\n' "linux-x64" ;;
    Linux:aarch64 | Linux:arm64) printf '%s\n' "linux-arm64" ;;
    *) printf '%s\n' "unsupported" ;;
  esac
}

script_path=$(resolve_link "$0")
script_dir=$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd)
package_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
platform=$(platform_id)

if [ "$platform" != "unsupported" ]; then
  platform_binary="$package_dir/../introspection-$platform/bin/introspection"

  if [ -x "$platform_binary" ]; then
    exec "$platform_binary" "$@"
  fi
fi

fallback_bundle="$script_dir/bin.mjs"

if command -v bun >/dev/null 2>&1; then
  exec bun "$fallback_bundle" "$@"
fi

cat >&2 <<EOF
introspection could not start.

No compiled @mplibunao/introspection platform package matched this host, and Bun was not found for the JS fallback.

Install Bun >=1.3.11, or install the matching optional platform package for darwin-arm64, linux-x64, or linux-arm64.
EOF
exit 1
