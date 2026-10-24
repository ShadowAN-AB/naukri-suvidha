#!/usr/bin/env bash
# Bring the whole portal up on a local Kubernetes cluster.
#
# Idempotent: run it again after changing a manifest or the server code and it
# rebuilds, reloads and rolls out without recreating the cluster.
set -euo pipefail

CLUSTER=naukri-suvidha
NS=naukri-suvidha
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  step "Creating the kind cluster (1 control-plane, 2 workers)"
  kind create cluster --config "$HERE/kind-cluster.yaml"
else
  step "Cluster $CLUSTER already exists"
fi

kubectl config use-context "kind-$CLUSTER" >/dev/null

step "Building the images"
docker build -t naukri-suvidha/api:dev  -f "$ROOT/server/Dockerfile" "$ROOT"
docker build -t naukri-suvidha/edge:dev -f "$ROOT/client/Dockerfile" "$ROOT"

step "Side-loading the images into the cluster"
# No registry anywhere in this story: kind copies from the local Docker image
# store straight into each node's containerd. This is also why the manifests
# say imagePullPolicy: IfNotPresent - the default for a :dev-style tag would
# still be IfNotPresent, but Always would make every pod fail to pull.
kind load docker-image naukri-suvidha/api:dev  --name "$CLUSTER"
kind load docker-image naukri-suvidha/edge:dev --name "$CLUSTER"
# busybox, which the API's dependency gates use, is deliberately *not* loaded
# this way. It is a public multi-arch image, and `docker pull` on an arm64 Mac
# stores a manifest list whose other platforms' layers are absent - which
# `kind load` then refuses with "content digest not found", because it imports
# --all-platforms. The nodes pull it themselves in a second, and only the two
# images with no registry behind them actually need side-loading.

step "Installing metrics-server (the HPA has no metric without it)"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# kind's kubelets serve their metrics endpoint with a self-signed certificate
# that metrics-server will not trust, so it reports every node as unreachable
# and the HPA sits at <unknown> forever. This flag is the standard local fix
# and it is a local-cluster concession, not something a real cluster needs.
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' \
  2>/dev/null || echo "   (already patched)"

step "Applying the manifests"
# The model runs on the host. A pod cannot reach it as host.docker.internal
# the way a compose container can, so the host is addressed as the gateway of
# the kind Docker network - which differs per machine (172.18.0.1 and
# 172.24.0.1 are both common). Rendering the manifests and rewriting the
# placeholder means the value is correct from the first pod rather than
# patched in afterwards and needing a restart.
GATEWAY="$(docker network inspect kind --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' | tr -d '[:space:]')"
echo "   host gateway for Ollama: ${GATEWAY:-unknown}"
# The image ids go into the pod templates - see the annotation in api.yaml for
# why a mutable :dev tag otherwise leaves old pods running a stale build.
API_ID="$(docker image inspect naukri-suvidha/api:dev  --format '{{.Id}}')"
EDGE_ID="$(docker image inspect naukri-suvidha/edge:dev --format '{{.Id}}')"
kubectl kustomize "$HERE" \
  | sed "s|http://172\.18\.0\.1:11434|http://${GATEWAY:-172.18.0.1}:11434|" \
  | sed "s|__API_IMAGE_ID__|${API_ID}|; s|__EDGE_IMAGE_ID__|${EDGE_ID}|" \
  | kubectl apply -f -

step "Waiting for the data services"
kubectl -n "$NS" rollout status statefulset/mongo --timeout=180s
kubectl -n "$NS" rollout status deployment/redis --timeout=120s
# Kafka is the slow one: a broker needs tens of seconds before it will answer.
kubectl -n "$NS" rollout status statefulset/kafka --timeout=300s

step "Waiting for the API and the edge"
kubectl -n "$NS" rollout status deployment/api  --timeout=300s
kubectl -n "$NS" rollout status deployment/edge --timeout=120s

step "Up"
kubectl -n "$NS" get pods -o wide
cat <<EOF

  The portal is on http://localhost:8081
  Seed it with:   npm run k8s:seed

EOF
