#!/usr/bin/env bash
# Switches the AI Merch production VM to t2d-standard-2 in place (same disk,
# same static IP, same firewall tags) — the cheapest/best-fit machine type for
# this workload (Docker web app: Next.js frontend + n8n, network/IO-bound, not
# compute-intensive). See project_gcp_vm_capacity_t2d_migration memory for the
# full price/positioning comparison against n2d/c2d/n2.
#
# GCP requires the instance to be STOPPED to change machine type, so this
# script stops it first if running, switches, then starts it back up. If
# t2d-standard-2 is exhausted in this zone (ZONE_RESOURCE_POOL_EXHAUSTED),
# use start-vm-with-fallback.sh instead to fall through to the next-cheapest
# available type.
#
# Usage: ./set-machine-type-t2d.sh
#   INSTANCE=other-instance ZONE=us-west1-a ./set-machine-type-t2d.sh
set -euo pipefail

INSTANCE="${INSTANCE:-instance-20241124-224845-new}"
ZONE="${ZONE:-us-west1-b}"
TARGET_TYPE="t2d-standard-2"

current_status() {
  gcloud compute instances describe "$INSTANCE" --zone="$ZONE" \
    --format='value(status)'
}

current_machine_type() {
  gcloud compute instances describe "$INSTANCE" --zone="$ZONE" \
    --format='value(machineType)' | sed 's#.*/##'
}

active_type="$(current_machine_type)"
if [[ "$active_type" == "$TARGET_TYPE" ]]; then
  echo "$INSTANCE is already $TARGET_TYPE. Nothing to do."
  exit 0
fi

status="$(current_status)"
was_running=false
if [[ "$status" == "RUNNING" ]]; then
  was_running=true
  echo "Stopping $INSTANCE (currently $active_type, RUNNING)..."
  gcloud compute instances stop "$INSTANCE" --zone="$ZONE"
fi

echo "Switching machine type: $active_type -> $TARGET_TYPE"
if ! gcloud compute instances set-machine-type "$INSTANCE" \
    --zone="$ZONE" --machine-type="$TARGET_TYPE"; then
  echo "Could not set machine type to $TARGET_TYPE. Instance left stopped; re-run or start manually."
  exit 1
fi

if [[ "$was_running" == true ]]; then
  echo "Starting $INSTANCE on $TARGET_TYPE..."
  if ! output="$(gcloud compute instances start "$INSTANCE" --zone="$ZONE" 2>&1)"; then
    echo "$output"
    if echo "$output" | grep -qi "ZONE_RESOURCE_POOL_EXHAUSTED"; then
      echo "$TARGET_TYPE is exhausted in $ZONE right now. Instance is stopped on $TARGET_TYPE."
      echo "Run ./start-vm-with-fallback.sh to fall through to the next-cheapest available type."
    fi
    exit 1
  fi
  echo "$output"
  echo "Started successfully on $TARGET_TYPE."
else
  echo "Instance was not running before this change; left stopped on $TARGET_TYPE."
fi
