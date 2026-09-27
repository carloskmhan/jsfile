#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
    exec python3 rule_manager.py
fi
exec python rule_manager.py
