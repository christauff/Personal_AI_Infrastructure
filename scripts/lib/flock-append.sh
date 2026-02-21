#!/bin/bash
# Advisory-locked JSONL append using flock(1)
# Prevents TOCTOU race between cron compaction and hook writers
#
# Usage: source this file, then call flock_append "$FILE" "$LINE"
# Both cron jobs AND hooks should use this for JSONL writes.

# flock_append FILE LINE
# Acquires flock on FILE.lock, appends LINE to FILE, releases
flock_append() {
    local file="$1"
    local line="$2"
    local lockfile="${file}.lock"

    (
        flock -w 5 200 || {
            echo "[ERROR] flock_append: could not acquire lock on $lockfile" >&2
            return 1
        }
        echo "$line" >> "$file"
    ) 200>"$lockfile"
}
