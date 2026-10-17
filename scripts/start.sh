#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null 2>&1 || { echo 'กรุณาติดตั้งและเปิด Docker Desktop ก่อน: https://www.docker.com/products/docker-desktop/'; exit 1; }
docker compose version >/dev/null 2>&1 || { echo 'ต้องใช้ Docker Compose v2 ที่มากับ Docker Desktop'; exit 1; }
if ! docker info >/dev/null 2>&1; then
  if [ "$(uname -s)" = Darwin ]; then open -a Docker; fi
  echo 'กำลังรอ Docker Desktop เริ่มทำงาน…'
  ready=0
  for _ in $(seq 1 90); do if docker info >/dev/null 2>&1; then ready=1; break; fi; sleep 2; done
  [ "$ready" = 1 ] || { echo 'Docker ยังไม่พร้อม กรุณาเปิด Docker Desktop แล้วรันคำสั่งเดิม'; exit 1; }
fi
if [ ! -f .env ]; then
  umask 077
  command -v openssl >/dev/null 2>&1 || { echo 'ต้องมี openssl สำหรับสร้างรหัสลับ'; exit 1; }
  db_password=$(openssl rand -hex 24)
  root_password=$(openssl rand -hex 24)
  admin_password=$(openssl rand -hex 12)
  image_key=$(openssl rand -base64 32 | tr -d '\n')
  cat > .env <<ENV
NODE_ENV=development
PORT=4000
API_PORT=4000
WEB_PORT=5173
PMA_PORT=8088
MYSQL_PORT=3307
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=scm_leave
DB_USER=scm
DB_PASSWORD=$db_password
MYSQL_ROOT_PASSWORD=$root_password
DB_SSL=false
CORS_ORIGINS=http://localhost:5173
TRUST_PROXY=0
FILE_ENCRYPTION_KEY=$image_key
BOOTSTRAP_ADMIN_EMAIL=admin@scm.local
BOOTSTRAP_ADMIN_NAME=SCM Administrator
BOOTSTRAP_ADMIN_PASSWORD=$admin_password
SEED_DEMO=false
ENV
  chmod 600 .env
fi
echo 'กำลัง build และเริ่ม React + Express + MySQL + phpMyAdmin (ครั้งแรกใช้เวลาหลายนาที)…'
docker compose up -d --build --wait --wait-timeout 300 || { docker compose logs --tail=60 api web mysql; exit 1; }
# .env is read as data, not sourced as executable shell code.
read_value() { sed -n "s/^$1=//p" .env | head -n 1; }
web_port=$(read_value WEB_PORT); web_port=${web_port:-5173}
api_port=$(read_value API_PORT); api_port=${api_port:-4000}
pma_port=$(read_value PMA_PORT); pma_port=${pma_port:-8088}
echo ''
echo "พร้อมใช้งาน: http://localhost:$web_port"
echo "API health: http://localhost:$api_port/health"
echo "phpMyAdmin: http://localhost:$pma_port"
echo "บัญชีผู้ดูแล (Admin สำหรับฐานใหม่): $(read_value BOOTSTRAP_ADMIN_EMAIL)"
echo "รหัสเริ่มต้น: $(read_value BOOTSTRAP_ADMIN_PASSWORD)"
echo 'รหัสนี้ใช้เฉพาะก่อนเปลี่ยนรหัสครั้งแรก ระบบไม่เปลี่ยนรหัสเดิมเมื่อรันซ้ำ'
echo "phpMyAdmin user: $(read_value DB_USER)"
echo "phpMyAdmin password: $(read_value DB_PASSWORD)"
echo 'ขั้นแรก: เปลี่ยนรหัส → ตรวจ/ยืนยันวันหยุดไทย → ให้สมาชิกสมัคร → เปิดใช้งานสมาชิก'
if [ "$(uname -s)" = Darwin ]; then open "http://localhost:$web_port"; fi
