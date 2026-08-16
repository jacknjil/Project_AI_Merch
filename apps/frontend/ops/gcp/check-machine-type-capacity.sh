#!/usr/bin/env bash
# Reports which candidate machine types currently have capacity in a zone,
# WITHOUT touching the production VM or causing any downtime.
#
# Background: GCP has no read-only "check capacity" API — the only way to
# know whether a machine type is available in a zone right now is to attempt
# to create one and see if ZONE_RESOURCE_POOL_EXHAUSTED comes back. This
# differs from start-vm-with-fallback.sh, which changes the *production*
# instance's machine type in place and stops at the first success (optimized
# for getting the app back up fast). This script instead spins up a small
# throwaway instance per candidate type (its own disk, no external IP), so it
# can run safely at any time — even while prod is already RUNNING — and it
# always tests every type in the list so you get the full picture, not just
# "good enough."
#
# Cost note: each candidate that IS available gets created then immediately
# deleted (typically <1 min of billing, rounded up per GCP's per-second
# billing with 1-min minimum). Candidates that fail with
# ZONE_RESOURCE_POOL_EXHAUSTED are never actually created, so no cost there.
#
# Usage: ./check-machine-type-capacity.sh
#   ZONE=us-west1-b MACHINE_TYPES="t2d-standard-2 n2d-standard-2" ./check-machine-type-capacity.sh
set -euo pipefail

ZONE="${ZONE:-us-west1-b}"
IMAGE_FAMILY="${IMAGE_FAMILY:-debian-12}"
IMAGE_PROJECT="${IMAGE_PROJECT:-debian-cloud}"
read -ra MACHINE_TYPES <<< "${MACHINE_TYPES:-t2d-standard-2 n2d-standard-2 c2d-standard-2 n2-standard-2}"

declare -a RESULTS=()

cleanup_probe() {
  local name="$1"
  gcloud compute instances delete "$name" --zone="$ZONE" --quiet >/dev/null 2>&1 || true
}

# Clean up a probe instance if the script is interrupted mid-test.
current_probe=""
trap 'if [[ -n "$current_probe" ]]; then echo; echo "Interrupted — cleaning up $current_probe..."; cleanup_probe "$current_probe"; fi' INT TERM

echo "Probing capacity in zone: $ZONE"
echo "Types: ${MACHINE_TYPES[*]}"
echo

for machine_type in "${MACHINE_TYPES[@]}"; do
  probe_name="capacity-probe-${machine_type}-$(date +%s)"
  current_probe="$probe_name"

  echo "[$machine_type] attempting probe instance..."
  if output="$(gcloud compute instances create "$probe_name" \
      --zone="$ZONE" \
      --machine-type="$machine_type" \
      --image-family="$IMAGE_FAMILY" \
      --image-project="$IMAGE_PROJECT" \
      --boot-disk-size=10GB \
      --no-address \
      --quiet 2>&1)"; then
    echo "[$machine_type] AVAILABLE — deleting probe instance."
    cleanup_probe "$probe_name"
    RESULTS+=("$machine_type|AVAILABLE")
  else
    if echo "$output" | grep -qi "ZONE_RESOURCE_POOL_EXHAUSTED"; then
      RESULTS+=("$machine_type|EXHAUSTED")
      echo "[$machine_type] EXHAUSTED."
    else
      RESULTS+=("$machine_type|ERROR")
      echo "[$machine_type] unexpected error (not a capacity issue):"
      echo "$output" | sed 's/^/    /'
    fi
  fi
  current_probe=""
  echo
done

echo "=== Capacity report: $ZONE ($(date '+%Y-%m-%d %H:%M:%S %Z')) ==="
printf "%-20s %s\n" "MACHINE TYPE" "STATUS"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r mt status <<< "$r"
  printf "%-20s %s\n" "$mt" "$status"
done
