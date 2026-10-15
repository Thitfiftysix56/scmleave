#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
target="backups/scm-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers "$MYSQL_DATABASE"' | gzip > "$target"
echo "สำรองฐานข้อมูลแล้ว: $target"
echo 'เก็บ FILE_ENCRYPTION_KEY จาก .env ไว้อีกแห่งอย่างปลอดภัยด้วย มิฉะนั้นจะเปิดรูปใบรับรองจากข้อมูลสำรองไม่ได้'
