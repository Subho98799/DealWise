#!/usr/bin/env bash
# Checks your setup and prints PASS/FAIL per item. Never prints secret values.
exec "$(dirname "$0")/dt.sh" check
