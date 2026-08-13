#!/usr/bin/env bash
# Starts the AI Merch production VM, working around ZONE_RESOURCE_POOL_EXHAUSTED
# by falling back through machine types known to have capacity in this zone.
#
# Background: the instance is stopped between dev sessions to save compute
# cost. On restart, GCP's zonal capacity for a given machine type can have
# drained since it was last running (this has already happened once for
# e2-standard-2, and again for t2d-standard-2 — see CLAUDE.md deploy notes).
# This script retries the current shape a few times, then tries the next
# machine type in FALLBACK_TYPES, all confirmed available in this zone as of
# 2026-08-01. It never changes zone (that requires a new instance + IP
# reattach, which caused a tag/firewall outage previously).
#
# Usage: ./start-vm-with-fallback.sh
set -euo pipefail

INSTANCE="${INSTANCE:-instance-20241124-224845-new}"
ZONE="${ZONE:-us-west1-b}"
FALLBACK_TYPES=("t2d-standard-2" "n2d-standard-2" "c2d-standard-2" "n2-standard-2")
RETRIES_PER_TYPE=3
RETRY_DELAY_SECONDS=60

current_status() {
  gcloud compute instances describe "$INSTANCE" --zone="$ZONE" \
    --format='value(status)'
}

current_machine_type() {
  gcloud compute instances describe "$INSTANCE" --zone="$ZONE" \
    --format='value(machineType)' | sed 's#.*/##'
}

status="$(current_status)"
if [[ "$status" == "RUNNING" ]]; then
  echo "$INSTANCE is already RUNNING (machine type: $(current_machine_type)). Nothing to do."
  exit 0
fi

active_type="$(current_machine_type)"
# Try the currently-configured type first, then the rest of the fallback list.
ordered_types=("$active_type")
for t in "${FALLBACK_TYPES[@]}"; do
  [[ "$t" == "$active_type" ]] || ordered_types+=("$t")
done

for machine_type in "${ordered_types[@]}"; do
  if [[ "$machine_type" != "$(current_machine_type)" ]]; then
    echo "Switching machine type: $(current_machine_type) -> $machine_type"
    if ! gcloud compute instances set-machine-type "$INSTANCE" \
        --zone="$ZONE" --machine-type="$machine_type"; then
      echo "Could not set machine type to $machine_type, trying next option."
      continue
    fi
  fi

  for attempt in $(seq 1 "$RETRIES_PER_TYPE"); do
    echo "[$machine_type] start attempt $attempt/$RETRIES_PER_TYPE..."
    if output="$(gcloud compute instances start "$INSTANCE" --zone="$ZONE" 2>&1)"; then
      echo "$output"
      echo "Started successfully on $machine_type."
      exit 0
    fi

    echo "$output"
    if echo "$output" | grep -qi "ZONE_RESOURCE_POOL_EXHAUSTED"; then
      echo "[$machine_type] zone exhausted, waiting ${RETRY_DELAY_SECONDS}s before retry..."
      sleep "$RETRY_DELAY_SECONDS"
      continue
    fi

    echo "[$machine_type] start failed with a non-capacity error, aborting."
    exit 1
  done

  echo "[$machine_type] still exhausted after $RETRIES_PER_TYPE attempts, trying next machine type."
done

echo "All machine types in FALLBACK_TYPES are exhausted in $ZONE right now."
echo "Try again later, or consider a zone move (new instance + IP reattach required)."
exit 1
