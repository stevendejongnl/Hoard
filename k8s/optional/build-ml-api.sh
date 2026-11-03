#!/usr/bin/env bash
# Builds the image of Obico's ml_api from its source at a pinned commit. Nothing is pushed:
# run `docker push` yourself when the image is the one you want.
set -euo pipefail

UPSTREAM=https://github.com/TheSpaghettiDetective/obico-server.git
UPSTREAM_COMMIT=6f938964c63892df2b6d5b68d99ea783fc1a7c78
IMAGE=ghcr.io/stevendejongnl/obico-ml-api:${UPSTREAM_COMMIT:0:7}

work_directory=$(mktemp -d)
trap 'rm -rf "$work_directory"' EXIT

git clone --quiet "$UPSTREAM" "$work_directory/obico-server"
git -C "$work_directory/obico-server" checkout --quiet "$UPSTREAM_COMMIT"
docker build --tag "$IMAGE" "$work_directory/obico-server/ml_api"
echo "Built $IMAGE. Push it with: docker push $IMAGE"
