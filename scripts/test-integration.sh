#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export TEST_DB_PASSWORD
TEST_DB_PASSWORD=$(openssl rand -hex 24)
scm_test_project="scm-leave-test-$(openssl rand -hex 5)"
cleanup(){ docker compose -p "$scm_test_project" -f compose.test.yaml down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose -p "$scm_test_project" -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
