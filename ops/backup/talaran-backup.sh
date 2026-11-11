#!/usr/bin/env bash
# Talaran nightly backup (docs/backups.md).
#
# Dumps the game database and the avatars folder, checks the dump can be read
# back, keeps 14 daily and 8 weekly copies, and, when RCLONE_REMOTE is set,
# copies each new file off the server. Run by cron as root; safe to run by hand.
#
# Settings, all optional, from the environment or /etc/talaran-backup.conf:
#   TALARAN_DIR      the repo on the box            (default /var/www/talaran)
#   BACKUP_DIR       where the copies are kept      (default /var/backups/talaran)
#   KEEP_DAILY       daily copies kept              (default 14)
#   KEEP_WEEKLY      weekly copies kept (Sundays)   (default 8)
#   RCLONE_REMOTE    e.g. "b2:talaran-backups"; unset means no off-site copy yet
#
# The database address is read from $TALARAN_DIR/apps/server/.env (DATABASE_URL),
# the same one the game uses, so there is nothing to keep in step by hand.

set -euo pipefail

[ -f /etc/talaran-backup.conf ] && . /etc/talaran-backup.conf

TALARAN_DIR="${TALARAN_DIR:-/var/www/talaran}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/talaran}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
ENV_FILE="$TALARAN_DIR/apps/server/.env"
AVATAR_DIR="$TALARAN_DIR/apps/server/uploads/avatars"

log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { log "FAILED: $*"; exit 1; }

# One run at a time: a slow night must not overlap the next.
exec 9>"/tmp/talaran-backup.lock"
flock -n 9 || fail "another backup is still running"

# Dumps hold emails and password hashes: readable by root only.
umask 077
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"

[ -f "$ENV_FILE" ] || fail "no .env at $ENV_FILE"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
[ -n "$DATABASE_URL" ] || fail "DATABASE_URL is not set in $ENV_FILE"

command -v pg_dump >/dev/null || fail "pg_dump is not installed (apt-get install postgresql-client)"

STAMP="$(date -u '+%Y-%m-%d_%H%M')"
DUMP="$BACKUP_DIR/daily/talaran-$STAMP.dump"
AVATARS="$BACKUP_DIR/daily/avatars-$STAMP.tar.gz"

# The game's database role times out a transaction that sits idle and may cap
# statements; a dump is one long read, so both are lifted for this session only.
export PGOPTIONS="-c statement_timeout=0 -c idle_in_transaction_session_timeout=0"

log "dumping the database"
# Custom format: compressed, and pg_restore can bring back one table on its own.
pg_dump --format=custom --compress=6 --no-owner --file="$DUMP.part" "$DATABASE_URL" \
    || { rm -f "$DUMP.part"; fail "pg_dump"; }

# Read it back before trusting it: a truncated or broken file fails here.
pg_restore --list "$DUMP.part" > /dev/null || { rm -f "$DUMP.part"; fail "the dump could not be read back"; }
mv "$DUMP.part" "$DUMP"
log "database: $(du -h "$DUMP" | cut -f1) in $DUMP"

if [ -d "$AVATAR_DIR" ]; then
    tar -czf "$AVATARS.part" -C "$(dirname "$AVATAR_DIR")" "$(basename "$AVATAR_DIR")" \
        && mv "$AVATARS.part" "$AVATARS" \
        && log "avatars: $(du -h "$AVATARS" | cut -f1)"
else
    log "no avatars folder at $AVATAR_DIR; skipped"
fi

# Sunday's copies are also kept as weekly ones.
if [ "$(date -u +%u)" = "7" ]; then
    cp -p "$DUMP" "$BACKUP_DIR/weekly/"
    [ -f "$AVATARS" ] && cp -p "$AVATARS" "$BACKUP_DIR/weekly/"
    log "kept as this week's copy"
fi

# Old copies go: by count, newest kept, so a few missed nights never empty the folder.
#
# A folder with nothing in it yet is not a failure. `ls` exits non-zero when the
# pattern matches no file, and under `set -e -o pipefail` that ended the whole
# script here, silently: every run before the first Sunday (weekly/ still empty)
# took its dump and then stopped, with no off-site copy and no last-success
# (found setting up the first backups, 2026-11-11).
prune() {
    local dir="$1" pattern="$2" keep="$3"
    { ls -1t "$dir"/$pattern 2>/dev/null || true; } | tail -n +"$((keep + 1))" | while read -r old; do rm -f -- "$old"; done
}
prune "$BACKUP_DIR/daily"  'talaran-*.dump'   "$KEEP_DAILY"
prune "$BACKUP_DIR/daily"  'avatars-*.tar.gz' "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" 'talaran-*.dump'   "$KEEP_WEEKLY"
prune "$BACKUP_DIR/weekly" 'avatars-*.tar.gz' "$KEEP_WEEKLY"

# Off the server. `copy`, never `sync`: a file removed here is never removed
# there, so pruning (or someone on this box) cannot empty the off-site copies.
if [ -n "$RCLONE_REMOTE" ]; then
    command -v rclone >/dev/null || fail "RCLONE_REMOTE is set but rclone is not installed"
    rclone copy "$DUMP" "$RCLONE_REMOTE/daily/" || fail "off-site copy of the database"
    [ -f "$AVATARS" ] && { rclone copy "$AVATARS" "$RCLONE_REMOTE/daily/" || fail "off-site copy of the avatars"; }
    log "copied off-site to $RCLONE_REMOTE"
fi

date -u '+%Y-%m-%dT%H:%M:%SZ' > "$BACKUP_DIR/last-success"
log "done"
