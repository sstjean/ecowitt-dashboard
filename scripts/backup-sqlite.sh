#!/bin/sh
# backup-sqlite.sh — consistent, off-host backups of the readings store.
#
# Uses SQLite's online backup API (`.backup`), which produces a transactionally
# consistent copy even while the poller is writing under WAL — never a raw `cp`,
# which can capture a torn page or miss un-checkpointed WAL frames
# (research.md Decision 11 / analysis finding C1).
#
# Designed to run two ways:
#   1. As the compose `backup` sidecar with BACKUP_INTERVAL_SECONDS set (loops).
#   2. As a host cron entry with no interval (single shot), e.g.
#        */30 * * * *  SQLITE_PATH=/srv/ecowitt/ecowitt.sqlite \
#          BACKUP_DIR=/mnt/nas/ecowitt-backups /opt/ecowitt/scripts/backup-sqlite.sh
#
# Environment:
#   SQLITE_PATH              Source database file.            (required)
#   BACKUP_DIR               Off-host destination directory.  (required)
#   RETENTION_DAYS           Prune backups older than N days. (default 14)
#   BACKUP_INTERVAL_SECONDS  If set, loop forever sleeping N. (default: run once)
#
# ---------------------------------------------------------------------------
# RESTORE PROCEDURE (verify this works before you trust the backups):
#   1. Stop the stack so nothing is writing:   docker compose down
#   2. Pick a backup:                          ls -1t "$BACKUP_DIR"/ecowitt-*.sqlite
#   3. Integrity-check it:
#        sqlite3 <chosen-backup> 'PRAGMA integrity_check;'   # must print: ok
#   4. Replace the live DB (the .backup output is a standalone file — there is
#      no separate -wal/-shm to copy):
#        cp <chosen-backup> /path/to/ecowitt.sqlite
#        rm -f /path/to/ecowitt.sqlite-wal /path/to/ecowitt.sqlite-shm
#   5. Bring the stack back up:                 docker compose up -d
# ---------------------------------------------------------------------------

set -eu

: "${SQLITE_PATH:?SQLITE_PATH is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# sqlite3 CLI is preinstalled on most hosts; in the minimal sidecar image it is
# fetched once on first run.
if ! command -v sqlite3 >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache sqlite >/dev/null
  else
    echo "[backup] sqlite3 not found and no apk to install it" >&2
    exit 1
  fi
fi

do_backup() {
  if [ ! -f "$SQLITE_PATH" ]; then
    echo "[backup] source $SQLITE_PATH not present yet; skipping this cycle" >&2
    return 0
  fi
  mkdir -p "$BACKUP_DIR"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dest="$BACKUP_DIR/ecowitt-$stamp.sqlite"
  # `.backup` is the online backup API; the resulting file is self-contained.
  sqlite3 "$SQLITE_PATH" ".backup '$dest'"
  echo "[backup] wrote $dest"
  # Prune copies older than the retention window.
  find "$BACKUP_DIR" -name 'ecowitt-*.sqlite' -type f \
    -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
}

if [ -n "${BACKUP_INTERVAL_SECONDS:-}" ]; then
  echo "[backup] loop mode: every ${BACKUP_INTERVAL_SECONDS}s -> $BACKUP_DIR"
  while true; do
    do_backup || echo "[backup] cycle failed (continuing)" >&2
    sleep "$BACKUP_INTERVAL_SECONDS"
  done
else
  do_backup
fi
