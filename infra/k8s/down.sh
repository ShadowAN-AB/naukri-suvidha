#!/usr/bin/env bash
# Delete the cluster, and with it every pod, volume and the node containers.
#
# A whole cluster rather than `kubectl delete -k`: the PersistentVolumeClaims
# behind mongo and kafka outlive a manifest delete, so deleting the workload
# alone leaves disks around and the next `up` starts on yesterday's data.
set -euo pipefail
kind delete cluster --name naukri-suvidha
