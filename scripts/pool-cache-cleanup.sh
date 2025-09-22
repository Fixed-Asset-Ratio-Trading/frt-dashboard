#!/bin/bash
#
# Pool Cache Cleanup Script
# 
# Removes cached pool data files older than 24 hours
# Prevents race conditions by checking for lock files and temp files
# Logs cleanup activity for monitoring
#
# Usage: Run via cron daily
# 0 2 * * * /path/to/pool-cache-cleanup.sh

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML_DIR="$(dirname "$SCRIPT_DIR")/html"
POOL_DATA_DIR="$HTML_DIR/pool_data"
TTL_HOURS=24
LOG_FILE="$POOL_DATA_DIR/cleanup.log"

# Ensure directories exist
if [ ! -d "$POOL_DATA_DIR" ]; then
    echo "$(date): Pool data directory does not exist: $POOL_DATA_DIR" >> "$LOG_FILE"
    exit 1
fi

# Create log file if it doesn't exist
touch "$LOG_FILE"

# Function to log with timestamp
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S'): $1" >> "$LOG_FILE"
}

log_message "Starting pool cache cleanup (TTL: ${TTL_HOURS}h)"

# Count files before cleanup
INITIAL_COUNT=$(find "$POOL_DATA_DIR" -name "*.json" -not -name "*.tmp" | wc -l)
log_message "Found $INITIAL_COUNT cache files before cleanup"

# Track cleanup statistics
DELETED_COUNT=0
SKIPPED_COUNT=0
ERROR_COUNT=0

# Find and process cache files older than TTL
find "$POOL_DATA_DIR" -name "*.json" -not -name "*.tmp" -mtime +1 | while read -r file; do
    if [ ! -f "$file" ]; then
        continue # File might have been deleted by another process
    fi
    
    # Extract filename for lock checking
    filename=$(basename "$file")
    lock_file="${file}.lock"
    
    # Skip if lock file exists (file is being written)
    if [ -f "$lock_file" ]; then
        log_message "Skipping locked file: $filename"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        continue
    fi
    
    # Check file age more precisely
    file_age_seconds=$(( $(date +%s) - $(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || echo 0) ))
    ttl_seconds=$((TTL_HOURS * 3600))
    
    if [ "$file_age_seconds" -gt "$ttl_seconds" ]; then
        # File is old enough to delete
        file_size=$(stat -f %z "$file" 2>/dev/null || stat -c %s "$file" 2>/dev/null || echo 0)
        
        if rm -f "$file" 2>/dev/null; then
            log_message "Deleted expired cache file: $filename (age: ${file_age_seconds}s, size: ${file_size} bytes)"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            log_message "ERROR: Failed to delete file: $filename"
            ERROR_COUNT=$((ERROR_COUNT + 1))
        fi
    else
        log_message "Keeping recent file: $filename (age: ${file_age_seconds}s)"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    fi
done

# Clean up old temporary files (older than 1 hour)
find "$POOL_DATA_DIR" -name "*.tmp" -mtime +1 -delete 2>/dev/null
TEMP_DELETED=$(find "$POOL_DATA_DIR" -name "*.tmp" -mtime +1 2>/dev/null | wc -l)
if [ "$TEMP_DELETED" -gt 0 ]; then
    log_message "Cleaned up $TEMP_DELETED old temporary files"
fi

# Final count
FINAL_COUNT=$(find "$POOL_DATA_DIR" -name "*.json" -not -name "*.tmp" | wc -l)

# Log cleanup summary
log_message "Cleanup completed: deleted=$DELETED_COUNT, skipped=$SKIPPED_COUNT, errors=$ERROR_COUNT"
log_message "Cache files: $INITIAL_COUNT -> $FINAL_COUNT"

# Rotate log file if it gets too large (keep last 1000 lines)
if [ -f "$LOG_FILE" ] && [ $(wc -l < "$LOG_FILE") -gt 1000 ]; then
    tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    log_message "Log file rotated to prevent excessive growth"
fi

# Optional: Clean up metrics log if it gets too large
METRICS_FILE="$POOL_DATA_DIR/metrics.log"
if [ -f "$METRICS_FILE" ] && [ $(wc -l < "$METRICS_FILE") -gt 5000 ]; then
    tail -n 2000 "$METRICS_FILE" > "$METRICS_FILE.tmp" && mv "$METRICS_FILE.tmp" "$METRICS_FILE"
    log_message "Metrics log rotated to prevent excessive growth"
fi

log_message "Pool cache cleanup finished"

# Exit with error code if there were errors
if [ "$ERROR_COUNT" -gt 0 ]; then
    exit 1
fi

exit 0

