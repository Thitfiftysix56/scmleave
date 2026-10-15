# Deploy: Cloudflare Pages + Render + Aiven

คู่มือนี้ใช้ซอร์สในชุด `scm-leave` ตรวจเอกสารบริการวันที่ 15 ตุลาคม 2026 ยังไม่ได้สร้างบัญชีหรือ Deploy เข้า account ของผู้ใช้แทน

## แต่ละบริการทำอะไร

| ส่วน | บริการ | URL ตัวอย่าง / วิธีใช้ |
|---|---|---|
| React ที่ build เป็น static files | Cloudflare Pages | `https://ชื่อโปรเจกต์.pages.dev` |
| Node.js / Express API | Render Web Service | `https://ชื่อ-service.onrender.com` |
| MySQL ถาวร รวมรูปเข้ารหัส | Aiven for MySQL | ใช้ hostname/port/CA ที่ Aiven ให้ ไม่ใช่ URL เว็บ |
| จัดการตาราง | phpMyAdmin บน Mac ผ่าน Docker | `http://localhost:8089` เชื่อม Aiven ด้วย TLS |

Cloudflare Pages ไม่รัน Express หรือ phpMyAdmin ในชุดนี้ Render รัน API ส่วน phpMyAdmin เป็นเครื่องมือบริหาร MySQL ไม่ใช่ตัวฐานข้อมูล จึงไม่ต้องเปิด phpMyAdmin บนอินเทอร์เน็ตให้ผู้ใช้เว็บ

Free plan เริ่มทดลองได้ แต่มีข้อจำกัดที่ต้องรู้:

- Cloudflare Pages ให้ subdomain `pages.dev`; custom domain แบบ `.com` ไม่ได้แถมฟรี
- Render Free พักบริการหลังไม่มี traffic 15 นาที การเรียกครั้งแรกหลังพักอาจรอประมาณ 1 นาที
- Render filesystem ไม่ถาวรเมื่อเริ่ม/deploy ใหม่ โค้ดนี้จึงไม่เก็บรูปในโฟลเดอร์ uploads แต่เข้ารหัสเก็บใน Aiven
- Aiven MySQL Free ตามเอกสารปัจจุบันมี 1 GB disk, 1 GB RAM, single node; รูปภาพใช้พื้นที่ในโควตานี้ด้วย
- แผนฟรีอาจมีข้อจำกัด/เปลี่ยนนโยบาย ตรวจหน้าเลือก plan จริงก่อนกดยืนยัน ไม่จำเป็นต้องเลือก trial แบบมีวันหมดอายุ

## 1. เตรียมซอร์สและ GitHub repository

GitHub ใช้เป็นที่เก็บโค้ดเพื่อให้ Pages และ Render ดึงไป build สามารถใช้ private repository ได้

1. แตก ZIP และลองรันในเครื่องก่อน
2. เข้า GitHub สร้าง repository ใหม่ เช่น `scm-leave` ไม่เพิ่ม README ของ GitHub ถ้า repository ยังว่าง
3. เปิด Terminal ในโฟลเดอร์ `scm-leave` รันทีละขั้น:

```bash
git init
git add .
git status
```

ตรวจว่าไม่มี `.env`, `ca.pem`, ข้อมูลสำรอง หรือ node_modules อยู่ในรายการ staged โค้ดมี `.gitignore` สำหรับไฟล์เหล่านี้แล้ว

```bash
git commit -m "Initial SCM Leave application"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/scm-leave.git
git push -u origin main
```

เปลี่ยน YOUR_ACCOUNT ให้ตรงบัญชีของคุณ ระบบ GitHub อาจให้ยืนยันตัวตนผ่านเบราว์เซอร์หรือ token ตามวิธีที่คุณใช้

## 2. สร้าง MySQL ใน Aiven

1. เปิด [Aiven Console](https://console.aiven.io/) สมัคร/เข้าสู่ระบบ
2. สร้าง Project สำหรับแอปนี้ เช่น `scm-project`
3. สร้าง service เลือก **MySQL** และ **Free plan** ถ้ามีให้เลือก
4. เลือก region ใกล้ Render ที่จะใช้ เพื่อลดเวลาเชื่อมต่อ
5. ตั้งชื่อ เช่น `scm-mysql` แล้วรอจน Running
6. เปิด Overview / Connection information จดค่าจริง:

| ค่าใน Aiven | นำไปตั้งเป็น |
|---|---|
| Host | DB_HOST |
| Port | DB_PORT — ใช้ค่าที่แสดง ไม่สมมติว่าเป็น 3306 |
| Database | DB_NAME — มักเป็น `defaultdb` ใช้ค่าจริง |
| User | DB_USER — เช่น `avnadmin` หรือ app user ที่สร้างเอง |
| Password | DB_PASSWORD |
| CA certificate | ดาวน์โหลดเป็น `ca.pem` |

เก็บรหัสและ CA นอก Git repo ไม่ปิดการตรวจ certificate ด้วย `rejectUnauthorized:false` โค้ดตั้งให้ตรวจ CA ไว้แล้ว

Schema ไม่มี CREATE DATABASE/GRANT/SUPER privileges จึงนำไปสร้างตารางใน database ที่ Aiven เตรียมไว้ได้ ไม่ต้องเปลี่ยนชื่อฐานข้อมูลเป็น scm_leave

ถ้าเปิด IP filter ใน Aiven ต้องอนุญาต IP ของเครื่องที่ใช้บริหาร และ outbound IP ของ Render service ตามที่ Render แสดง หากยังไม่ตั้งข้อจำกัดเครือข่าย ให้ใช้ข้อมูลเชื่อมต่อที่ Aiven เปิดให้บริการและรักษารหัสผ่านให้ปลอดภัย

## 3. เตรียมรหัสลับของ production

รหัสผ่าน bootstrap admin และ FILE_ENCRYPTION_KEY ต้องสร้างใหม่สำหรับ production ไม่ใช้รหัสตัวอย่างในเอกสาร

บน Mac:

```bash
# ใช้ผลบรรทัดนี้เป็น FILE_ENCRYPTION_KEY (base64 ของ 32 bytes)
openssl rand -base64 32

# ใช้ผลบรรทัดนี้เป็น BOOTSTRAP_ADMIN_PASSWORD
openssl rand -hex 16
```

จดสองค่านี้ไว้ใน password manager โดยเฉพาะ **FILE_ENCRYPTION_KEY ต้องเก็บเดิมตลอดอายุฐานข้อมูล** เปลี่ยน/ทำหายแล้วจะถอดรหัสรูปเก่าไม่ได้ การ deploy ซ้ำไม่ต้องสุ่ม key ใหม่

Bootstrap password ใช้สร้าง Super เฉพาะตอนที่ยังไม่มี Super ในฐานข้อมูล หลังผู้ใช้เปลี่ยนรหัสแล้ว การ deploy/migrate ซ้ำจะไม่รีเซ็ตรหัสนั้น

## 4. สร้าง Render Web Service

1. เข้า [Render Dashboard](https://dashboard.render.com/)
2. เลือก **New → Web Service** แล้วเชื่อม repository `scm-leave`
3. ตั้งค่าตามนี้:

| ช่อง | ค่า |
|---|---|
| Name | `scm-leave-api` หรือชื่อที่ว่าง |
| Branch | `main` |
| Root Directory | เว้นว่าง — ใช้ root ของ repo |
| Runtime / Language | Docker |
| Dockerfile Path | `api/Dockerfile` |
| Docker Build Context | `.` |
| Instance Type | Free สำหรับทดลอง |
| Health Check Path | `/health` |

Docker image รัน migration ก่อนเริ่ม Express อัตโนมัติ จึงไม่ต้องใช้ Render Shell ซึ่ง Free plan อาจไม่มี และไม่ต้องอัปโหลด SQL ด้วยมือก่อน

### Environment variables ของ Render

| Key | Value / วิธีกรอก |
|---|---|
| NODE_ENV | `production` |
| TRUST_PROXY | `1` |
| DB_HOST | Host จริงของ Aiven |
| DB_PORT | Port จริงของ Aiven |
| DB_NAME | Database จริง เช่น `defaultdb` |
| DB_USER | User จริงของ Aiven |
| DB_PASSWORD | Password จริงของ Aiven |
| DB_SSL | `true` |
| DB_SSL_CA | วางข้อความ PEM ทั้งไฟล์ ca.pem รวม BEGIN/END CERTIFICATE และบรรทัดใหม่ |
| FILE_ENCRYPTION_KEY | ค่า base64 ที่สร้างในขั้น 3 |
| CORS_ORIGINS | `https://ชื่อที่จะใช้.pages.dev` — ต้องตรง origin จริง ไม่มี `/` ปิดท้าย ไม่มี `/api` |
| BOOTSTRAP_ADMIN_EMAIL | อีเมลผู้ดูแลที่คุณจะใช้เข้าสู่ระบบ |
| BOOTSTRAP_ADMIN_NAME | ชื่อผู้ดูแล |
| BOOTSTRAP_ADMIN_PASSWORD | รหัสสุ่ม 12+ ตัวอักษรจากขั้น 3 |
| SESSION_HOURS | `12` หรือเว้นเพื่อใช้ค่าเริ่มต้น |
| SEED_DEMO | `false` หรือเว้น |

ไม่ต้องกำหนด PORT เอง Render ส่ง PORT ให้แอป ซึ่งรับและฟังบน `0.0.0.0` แล้ว

ทางเลือก CA: ใช้ Render **Secret File** ชื่อ `ca.pem` แล้วตั้ง `DB_SSL_CA_FILE=/etc/secrets/ca.pem` แทน DB_SSL_CA ได้ ใช้อย่างใดอย่างหนึ่ง

กด Create Web Service แล้วดู Logs ต้องเห็น:

```text
Schema 001 ready. Existing data preserved. Review holiday years before submitting leave.
SCM API listening on port ...
```

Render ให้ URL เช่น `https://scm-leave-api-xxxx.onrender.com` เปิด `/health` ต้องได้:

```json
{"status":"ok","service":"scm-leave-api"}
```

ถ้ายังไม่ทราบชื่อ Pages จริง ใส่ชื่อที่วางแผนไว้ก่อนได้ จากนั้นอัปเดต CORS_ORIGINS ให้ตรง URL ที่ Cloudflare ออกจริงหลังขั้น 5 API health ใช้ตรวจได้แม้ยังไม่ได้ตั้ง frontend เสร็จ

ไฟล์ `render.yaml` เป็นทางเลือกสำหรับ Blueprint โดยถามค่า secrets ผ่าน Render ไม่ได้ใส่ secrets ลงไฟล์ คุณใช้ Manual Web Service ตามขั้นตอนนี้ได้โดยไม่ใช้ Blueprint

## 5. Deploy React บน Cloudflare Pages

1. เข้า [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. ไป **Workers & Pages → Create application → Pages → Import an existing Git repository** (ชื่อเมนูอาจแสดง Connect to Git)
3. เลือก GitHub repository เดียวกับ Render
4. ตั้ง Project name เช่น `scm-leave-yourteam` จะได้ `https://scm-leave-yourteam.pages.dev`
5. ตั้ง build:

| ช่อง | ค่า |
|---|---|
| Production branch | `main` |
| Framework preset | None หรือ React (Vite) ถ้ามี |
| Root directory | เว้นว่าง |
| Build command | `npm ci && npm run build` |
| Build output directory | `web/dist` |
| NODE_VERSION (build environment variable) | `24` |
| VITE_API_URL (build environment variable) | `https://URL-จริงของ-Render.onrender.com/api` |

Root ใช้ npm workspaces จึง build ออก `web/dist` แทน `dist` ที่ใช้ในโปรเจกต์ Vite แบบโฟลเดอร์เดียว

ตั้ง VITE_API_URL สำหรับ Production และ Preview ที่ต้องการทดสอบด้วย ค่า VITE_* เป็นข้อมูลฝั่งเบราว์เซอร์ **ห้ามใส่ DB_PASSWORD, FILE_ENCRYPTION_KEY หรือรหัสผู้ดูแลใน Cloudflare build variables**

6. กด Save and Deploy รอจนสำเร็จ
7. คัดลอก URL จริงของ Pages กลับไป Render ตั้ง CORS_ORIGINS ให้ตรง เช่น:

```text
https://scm-leave-yourteam.pages.dev
```

หลาย origin ให้คั่นด้วย comma ไม่มีช่อง path เช่น production + custom domain:

```text
https://scm-leave-yourteam.pages.dev,https://leave.example.com
```

Save/Deploy API ใหม่ แล้วเปิดเว็บ Pages

ไฟล์ `web/public/_redirects` จะถูกคัดลอกไป `web/dist` เพื่อให้รีเฟรช `/members`, `/requests` หรือ `/holidays` ได้ โดยย้อนเข้า React SPA

ถ้าเปลี่ยน VITE_API_URL ต้อง build/redeploy Pages ใหม่ เพราะ Vite ฝังค่านี้ตอน build เปลี่ยน environment อย่างเดียวโดยไม่ build จะยังชี้ API เก่า

Preview URL ของ Pages ที่มี hash เป็น origin อีกตัว ต้องเพิ่ม origin นั้นใน Render หากจะให้ทดสอบ ไม่ได้เปิด CORS แบบ wildcard ให้ทุก preview อัตโนมัติ

## 6. ตั้งค่าระบบหลัง Deploy

1. เข้า Pages ด้วยอีเมล bootstrap admin และรหัสจากขั้น 3
2. เปลี่ยนรหัสตามที่ระบบบังคับ แล้ว login ใหม่
3. ตรวจวันหยุดไทยปีปัจจุบันและปีที่จะขอลา เพิ่มวันหยุดพิเศษตามประกาศจริง/องค์กร
4. เลือกนำเข้าจาก Google เฉพาะวันหยุดที่บริษัทใช้ ตรวจรายการซ้ำ กรอกแหล่งอ้างอิง แล้วกดยืนยันปฏิทิน
5. ให้เพื่อนสมัครบัญชีจาก URL Pages ของคุณ
6. เปิดใช้งานแต่ละบัญชีและตรวจวันหยุดปกติในหน้าสมาชิก
7. กำหนดสิทธิ์รายปี และมอบหมาย Super คนที่สองสำหรับอนุมัติคำขอของ Super
8. ทดลองส่งวันลา ดูโควตา แนบรูป และอนุมัติด้วยบัญชีคนอื่น
9. ทดลองรีเฟรช URL ภายในเว็บ และออก/เข้าสู่ระบบใหม่

เพื่อนใช้เพียงลิงก์ Pages ไม่ต้องติดตั้ง Docker หรือ phpMyAdmin บนเครื่องเพื่อน

## 7. ใช้ phpMyAdmin บน Mac เชื่อม Aiven

ใช้ Docker Desktop เปิด phpMyAdmin แยกที่พอร์ต 8089 ไม่ชนตัว local:

1. ดาวน์โหลด `ca.pem` ของ Aiven มาไว้ใน `scm-leave/secrets/ca.pem` โฟลเดอร์ `secrets` ไม่ควรถูก commit
2. จากโฟลเดอร์ scm-leave ใช้คำสั่งนี้ โดยเปลี่ยน host/port ให้ตรงค่า Aiven (ไม่มี password ในคำสั่ง):

```bash
mkdir -p secrets
# ย้าย ca.pem ที่ดาวน์โหลดมาเข้า secrets ก่อนคำสั่ง docker ด้านล่าง
docker run -d --name scm-pma-aiven \
  -p 127.0.0.1:8089:80 \
  -e PMA_HOST=YOUR_AIVEN_HOST \
  -e PMA_PORT=YOUR_AIVEN_PORT \
  -v "$PWD/secrets/ca.pem:/etc/phpmyadmin/ca.pem:ro" \
  -v "$PWD/db/phpmyadmin-aiven.php:/etc/phpmyadmin/config.user.inc.php:ro" \
  phpmyadmin:5.2
```

3. เปิด `http://localhost:8089` กรอก user/password ของ Aiven ในหน้าล็อกอิน phpMyAdmin
4. เลือกฐานข้อมูล เช่น `defaultdb` จะเห็นตารางใน [DATABASE_TH.md](DATABASE_TH.md)

ไม่ต้อง Import SQL ซ้ำถ้า Render migration สำเร็จแล้ว หากต้อง Import เอง ใช้ `db/001_schema.sql` ซึ่งไม่สร้าง database ใหม่ แต่จะมีเพียง schema/roles/settings การสร้าง Super และวันหยุดเริ่มต้นทำโดย migration ของ API

หยุดตัว Aiven phpMyAdmin:

```bash
docker stop scm-pma-aiven
```

เปิดอีกครั้ง:

```bash
docker start scm-pma-aiven
```

ไม่ใช้ไฟล์ ca.pem คนละ Aiven project และไม่ปิด ssl_verify เพื่อแก้ certificate error

## 8. การอัปเดตและสำรองข้อมูล

เปลี่ยนโค้ด → ทดสอบ `npm test && npm run build` → commit/push → Pages และ Render build ตาม Git integration

ข้อมูลจริงอยู่ใน Aiven การ build เว็บ/API ใหม่ไม่ลบข้อมูล รูปไม่พึ่ง disk ของ Render อย่าเปลี่ยน FILE_ENCRYPTION_KEY เมื่อ deploy โค้ดใหม่

Local ใช้ `bash scripts/backup.sh` ส่วน production ใช้ backup/export ของ Aiven หรือ MySQL client ที่ต่อ TLS สำรอง key แยกจากฐานข้อมูล และทดลองกู้คืนในฐานข้อมูลทดสอบ

ไม่เปลี่ยน DB_NAME/DB_HOST ของ production ไปฐานอื่นโดยไม่ตั้งใจ เพราะระบบจะมองเป็นฐานข้อมูลอีกชุดแล้วสร้างข้อมูลเริ่มต้นใหม่

## 9. อาการที่พบบ่อย

| อาการ | ตรวจ/แก้ |
|---|---|
| เปิดครั้งแรกช้า / API connecting | รอ Render Free ตื่นประมาณ 1 นาที แล้วลองใหม่ |
| Login ขึ้นเชื่อมต่อไม่ได้ | ตรวจ VITE_API_URL ลงท้าย /api, /health และ Render Logs |
| CORS / preflight 403 | CORS_ORIGINS ต้องตรง `https://ชื่อ.pages.dev` ไม่มี / หรือ /api ปิดท้าย แล้ว redeploy Render |
| 404 ที่ /auth/login | Frontend ต้องชี้ฐาน `https://render-service/api` ไม่ใช่ root service |
| Refresh /members แล้ว 404 | ตรวจ build output `web/dist` มี `_redirects` และเป็น Pages project |
| Access denied | DB_USER/DB_PASSWORD/DB_NAME ต้องใช้ค่าจริงของ Aiven ไม่ใช่รหัส local Docker |
| connect timeout | ตรวจ Host/Port, สถานะ service และ IP filter ของ Aiven |
| self-signed / certificate verify | DB_SSL=true, วาง CA ครบ BEGIN/END รวม newline หรือใช้ Secret File ที่ถูกต้อง |
| เปิดรูปเก่าไม่ได้หลัง deploy | คืน FILE_ENCRYPTION_KEY เดิม ไม่มีไฟล์ใน Render ที่ต้องตามหา |
| ส่งวันลาไม่ผ่านปีปฏิทิน | Super ตรวจและยืนยัน holiday year ของช่วงวันลานั้น รวมปีข้างเคียงถ้าหยุดข้ามปี |
| เพิ่มวันหยุดไม่ได้เพราะมีคำขอ | จัดการคำขอปีนั้นตามข้อความระบบก่อน เพื่อไม่เปลี่ยนผลคำนวณย้อนหลัง |
| สมาชิก login ไม่ได้หลังสมัคร | Super ต้องเปิดสถานะ active ก่อน |
| Super อนุมัติไม่ได้ | ห้ามอนุมัติของตนเอง / มีกรณีพิเศษต้องติ๊กอนุมัติข้อยกเว้นและใส่หมายเหตุ |
| สมัคร/ล็อกอินบ่อยแล้ว 429 | รอ rate limit ตามข้อความ ไม่ต้องแก้ password ใน DB |
| เปลี่ยนค่าบน Pages แล้วเว็บยังชี้เก่า | VITE_* ต้อง Redeploy/build ใหม่ |
| Aiven disk ใกล้เต็ม | ตรวจจำนวนรูป/ข้อมูล เลือกขยายแผนหรือกำหนดกระบวนการเก็บรักษาและ export ที่องค์กรอนุมัติ |

## เอกสารต้นทาง

- [Cloudflare Pages — Deploy a React site](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Cloudflare Pages — Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages — Serving Pages / SPA](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Render — Deploy a Node Express App](https://render.com/docs/deploy-node-express-app)
- [Render — Free instances และข้อจำกัด](https://render.com/docs/free)
- [Render — Deploys / ephemeral filesystem](https://render.com/docs/deploys)
- [Aiven — MySQL Free tier](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier)
- [Aiven — TLS/SSL certificates](https://aiven.io/docs/platform/concepts/tls-ssl-certificates)
- [Aiven — MySQL connection information / Workbench](https://aiven.io/docs/products/mysql/howto/connect-from-mysql-workbench)
- [phpMyAdmin Docker — Configuration](https://github.com/phpmyadmin/docker)
- [date-holidays — Source and calculation rules](https://github.com/commenthol/date-holidays)
