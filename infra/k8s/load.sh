#!/usr/bin/env bash
# Generate enough sustained load on the API to make the HPA act, and leave it
# running for as long as you want to watch.
#
#   npm run k8s:load          # ~2 minutes of load
#   npm run k8s:load 300      # five
#
# Watch it work in another terminal with `npm run k8s:hpa`.
#
# Two details that are not incidental:
#
#   · It runs *inside* the cluster, against the `api` Service rather than
#     through the edge. The point is to load the pods, and going straight at
#     the Service also means the connections being balanced are the ones under
#     test.
#   · Every request carries a different X-Forwarded-For. The API rate-limits
#     /api to 300 a minute per client, and those counters are shared through
#     Redis - so a load test from a single apparent IP throttles itself at 5
#     requests a second and never touches the CPU. Varying the header is what
#     a load test simulating many clients has to do; with `trust proxy 1` the
#     API reads that header as the client address, which is the same path a
#     real request through the edge takes.
set -euo pipefail
NS=naukri-suvidha
DURATION="${1:-120}"

kubectl -n "$NS" delete job load --ignore-not-found >/dev/null

cat <<YAML | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: load
  namespace: $NS
  labels:
    app.kubernetes.io/name: load
    app.kubernetes.io/part-of: naukri-suvidha
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: load
        app.kubernetes.io/part-of: naukri-suvidha
    spec:
      restartPolicy: Never
      containers:
        - name: load
          # The API image, because node is already in it and it is already on
          # every node - no pull, and a Node client can generate far more load
          # than a shell loop around curl.
          image: naukri-suvidha/api:dev
          imagePullPolicy: IfNotPresent
          command:
            - node
            - -e
            - |
              const CONCURRENCY = 60;
              const until = Date.now() + $DURATION * 1000;
              let sent = 0, ok = 0, failed = 0;
              async function worker(id) {
                while (Date.now() < until) {
                  sent++;
                  try {
                    const r = await fetch('http://api:5001/api/health', {
                      headers: { 'x-forwarded-for': \`10.\${id % 255}.\${sent % 255}.\${(sent >> 8) % 255}\` },
                    });
                    r.status === 200 ? ok++ : failed++;
                    await r.arrayBuffer();
                  } catch { failed++; }
                }
              }
              const t = setInterval(
                () => console.log(\`sent=\${sent} ok=\${ok} other=\${failed}\`),
                10000,
              );
              Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i))).then(() => {
                clearInterval(t);
                console.log(\`done sent=\${sent} ok=\${ok} other=\${failed}\`);
              });
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              memory: 256Mi
YAML

echo
echo "  Load running for ${DURATION}s. Watch the autoscaler with:"
echo "    npm run k8s:hpa"
echo
kubectl -n "$NS" wait --for=condition=ready pod -l app.kubernetes.io/name=load --timeout=60s
kubectl -n "$NS" logs -f job/load
