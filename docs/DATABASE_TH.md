# ฐานข้อมูลและ API

ไฟล์สร้างตารางทั้งหมด: `db/001_schema.sql` และเพิ่ม role Admin ด้วย `db/002_admin_role.sql` ใช้ MySQL 8.0+ / 8.4, InnoDB, utf8mb4 Foreign keys ป้องกันข้อมูลอ้างอิงที่หายไป และ queries ใช้ parameter binding

## ตาราง

| ตาราง | ข้อมูล / Key สำคัญ |
|---|---|
| schema_migrations | เวอร์ชัน schema ที่ผ่าน migration |
| policy_lock | แถว id=1 สำหรับ serialize การจอง/อนุมัติ/เปลี่ยนกติกา |
| roles | ADMIN / SUPER_CS / CS / STORE และชื่อแสดง |
| users | id, name, email unique, password_hash (scrypt), role, status, must_change_password |
| work_schedules | user_id, valid_from, weekly_off JSON เช่น `[5,6]`; unique ต่อคน+วันเริ่ม |
| sessions | token_hash SHA-256, user_id, expires_at; ไม่เก็บ bearer token ตัวจริง |
| holiday_years | year ค.ศ., confirmed, ผู้ยืนยัน/เวลา/แหล่งอ้างอิง |
| holidays | day, name, source, enabled; รายการคำนวณ/นำเข้า/เพิ่มเอง |
| settings | policy JSON เพดานโควตา/ระยะเวลา/ใบรับรอง/เทศกาล |
| entitlements | user_id+year+leave_type เป็น primary key และจำนวนวัน quota |
| leave_requests | ช่วงลา เหตุผล สถานะ การยืนยันทีม/พี่เกล้า ข้อยกเว้น ผลตรวจ ผู้พิจารณา |
| leave_days | request_id+day, user_id; เฉพาะวันทำงานที่หักสิทธิ์จริง |
| certificates | request_id, ciphertext MEDIUMBLOB, iv, auth_tag, mime, bytes; AES-256-GCM |
| coverage_requests | ผู้ทำแทน/ผู้ถูกแทน วัน ชั่วโมง คำขอ OT Store ผู้อนุญาต Admin / Super ผู้พิจารณา |
| audit_logs | ผู้ดำเนินการ action entity details เวลาที่เกิดเหตุการณ์ |

ทุกตารางสร้างแบบ IF NOT EXISTS การรัน migration ซ้ำไม่ truncate/drop ข้อมูล ตาราง roles/settings ใช้ INSERT IGNORE Bootstrap admin และตัวอย่างสร้างผ่าน Node เพื่อ hash รหัสก่อนบันทึก จึงไม่มีรหัส plaintext ใน SQL

Migration ปัจจุบันมี 001 สำหรับ schema เริ่มต้น และ 002 สำหรับเพิ่ม role ADMIN โดยไม่เปลี่ยนข้อมูลเดิม หากแก้โครงสร้างในอนาคต ให้เพิ่ม migration version ใหม่พร้อม ALTER TABLE ที่เหมาะสม ไม่คาดหวังว่า IF NOT EXISTS จะแก้ column ในตารางเดิมให้

## ข้อมูลเริ่มต้น

| ข้อมูล | ค่า |
|---|---|
| roles | ADMIN / SUPER_CS / CS / STORE |
| users | Admin 1 คนจาก BOOTSTRAP_ADMIN_* เมื่อยังไม่มี Admin หรือ Super ในฐาน |
| schedule ของ Admin เริ่มต้น | ไม่มีตารางวันหยุด ไม่ใช้สิทธิ์วันลา |
| holiday_years / holidays | ปีปัจจุบัน -1, ปีปัจจุบัน, ปีปัจจุบัน +1 ยังไม่ยืนยัน |
| settings | weekendCapacity=1, maxConsecutive=4, exceptionConsecutive=5, certificateFromDays=3, blockHolidayExtension=true |
| entitlements | ไม่มีแถวจนผู้ดูแลตั้งสิทธิ์ |
| leave_requests / certificates / coverage | ว่าง ไม่เติมข้อมูลบุคลากรจริง |

ถ้าต้องการบัญชีตัวอย่างในฐานทดลองใหม่ ตั้ง `SEED_DEMO=true` และ `DEMO_PASSWORD=รหัสสุ่มอย่างน้อย12ตัวอักษร` ใน `.env` แล้วรัน `bash scripts/start.sh` จะได้ ploy@scm.local, nont@scm.local และ mint@scm.local วันหยุด [ศุกร์,เสาร์], [อาทิตย์,จันทร์], [อังคาร,พุธ] ตามลำดับ บังคับเปลี่ยนรหัสครั้งแรก

ไม่เปิด SEED_DEMO ใน production รันซ้ำไม่เปลี่ยนรหัสตัวอย่างที่มีแล้ว

## ความสัมพันธ์

users อ้างอิง roles; คนหนึ่งมี work_schedules หลายเวอร์ชัน มี sessions/entitlements/leave_requests หลายรายการ leave_requests มี leave_days หลายวันและ certificates ได้หนึ่งรูป coverage_requests อ้างถึง users หลายบทบาท ส่วน audit_logs อ้างถึงผู้กระทำ

leave_days เก็บผลการหักสิทธิ์ตอนส่ง ไม่คำนวณข้อมูลอดีตใหม่จากตารางวันหยุดที่เปลี่ยนไป หน้ารายละเอียดมี validation_snapshot และผู้อนุมัติเพื่อให้ตรวจสอบผลเดิมได้

## API

Base URL: `http://localhost:4000/api` ในเครื่อง หรือ `https://render-service.onrender.com/api` หลัง Deploy ทุก protected endpoint ส่ง `Authorization: Bearer TOKEN`

Session อยู่ใน sessionStorage ของแท็บ ไม่ใช้ third-party cookie ระหว่าง pages.dev กับ onrender.com หมดอายุตาม SESSION_HOURS, logout ลบ token, เปลี่ยน/รีเซ็ตรหัสลบทุก session การเปลี่ยนตำแหน่ง/สถานะยกเลิก session เดิม

| Method | Path | ผู้ใช้ / หน้าที่ |
|---|---|---|
| POST | /auth/register | สมัคร CS/Store สถานะ pending |
| POST | /auth/login | รับ token และ user |
| GET | /auth/me | บัญชีปัจจุบัน |
| POST | /auth/logout | ยกเลิก session |
| POST | /auth/password | เปลี่ยนรหัสและยกเลิกทุก session |
| GET | /meta | roles, policy, สถานะ holiday year, schedule ของตนเอง |
| GET | /people | ชื่อ/ตำแหน่งสมาชิก active ไม่ส่ง email/hash |
| GET | /calendar?start=YYYY-MM-DD&end=YYYY-MM-DD | ปฏิทิน end เป็น exclusive เช่น FullCalendar สูงสุด 400 วัน |
| GET | /balances?year=2027 | สิทธิ์/ยอดใช้/จองของตนเองในปี ค.ศ. |
| GET | /leaves | คำขอของตนเอง; Admin / Super เห็นทุกคน สูงสุด 500 ล่าสุด |
| POST | /leaves/preview | ตรวจเงื่อนไขก่อนส่ง ยังไม่จองโควตา |
| POST | /leaves | multipart: payload JSON + certificate ถ้ามี บันทึกและจองโควตา |
| GET | /leaves/:id | เหตุผล/วันลา/ผลตรวจ เฉพาะเจ้าของ Admin หรือ Super |
| POST | /leaves/:id/cancel | ยกเลิก pending/approved และคืนโควตา |
| POST | /leaves/:id/review | Admin / Super ตรวจซ้ำแล้ว approve/reject ห้ามตนเอง |
| GET | /leaves/:id/certificate | รูป JPEG ที่ถอดรหัส เฉพาะเจ้าของ/Admin/Super + audit |
| GET/POST | /coverage | ดูรายการ; ส่งคำขอได้เฉพาะสมาชิกที่ไม่ใช่ Admin |
| POST | /coverage/:id/store-authorize | Store อนุญาต OT ห้ามตนเอง |
| POST | /coverage/:id/review | Admin / Super อนุมัติ/ปฏิเสธ |
| POST | /coverage/:id/cancel | ยกเลิกโดยเจ้าของ/Admin/Super |
| POST | /admin/admins | Admin / Super สร้างบัญชี Admin จาก name,email ไม่มีตารางวันหยุด คืนรหัสชั่วคราวครั้งเดียว |
| GET | /admin/members | Admin / Super ดูรายชื่อ/ตาราง/สิทธิ์ทั้งหมด |
| PATCH | /admin/members/:id | Admin / Super แก้ name,role,status,weekly_off,valid_from |
| POST | /admin/members/:id/reset-password | สร้างรหัสสุ่มครั้งเดียว บังคับเปลี่ยน |
| PUT | /admin/members/:id/entitlements/:year | บันทึก 3 ประเภท quota จำนวนเต็มหรือ null |
| GET/PUT | /admin/settings | อ่าน/บันทึกกติกา |
| GET | /admin/holidays/:year | รายการวันหยุดและสถานะยืนยันของปี |
| GET | /admin/holidays/:year/online-preview | โหลด Google Thai ICS แบบ preview ไม่เขียนทับรายการ |
| POST | /admin/holidays/:year/import | นำเข้ารายการที่เลือกของปีนั้น |
| POST | /admin/holidays | เพิ่มวันหยุดพิเศษ |
| PATCH | /admin/holidays/:id | เปลี่ยนชื่อ/เปิดปิดวันหยุด |
| POST | /admin/holidays/:year/confirm | ยืนยันปฏิทินพร้อม source |
| GET | /admin/audit | 200 กิจกรรมล่าสุด |
| GET | /health (นอก /api) | ตรวจว่า API ต่อ MySQL ได้ ไม่ต้องมี token |

ตัวอย่าง payload คำขอลา:

```json
{
  "leave_type":"annual",
  "start_date":"2027-02-08",
  "end_date":"2027-02-09",
  "reason":"ธุระครอบครัว",
  "team_discussed":false,
  "notified_klao":false,
  "exception_requested":false,
  "exception_reason":""
}
```

Preview ใช้ JSON `{ "input": { ...payload... }, "has_certificate": false }` ส่วนการส่งจริงใช้ multipart field ชื่อ `payload` เป็นข้อความ JSON และ field `certificate` เป็นไฟล์ ไม่ใช้ has_certificate จาก client แทนไฟล์จริง

Result เงื่อนไขมี ok, errors, warnings, days, chargedDays, maxConsecutive, blocks, requiresException และ certificateRequired การส่งไม่ผ่านได้ HTTP 422, input ผิด 400, ไม่ login 401, ไม่มีสิทธิ์ 403, ไม่พบ 404, สถานะเปลี่ยน/ข้อมูลขัดกัน 409

## SQL ตรวจข้อมูลอย่างปลอดภัย

ใช้ใน phpMyAdmin SQL tab ของฐานข้อมูลที่ต้องการ:

```sql
SELECT id,name,email,role,status FROM users ORDER BY id;

SELECT user_id,valid_from,weekly_off FROM work_schedules
ORDER BY user_id,valid_from;

SELECT year,confirmed,source FROM holiday_years ORDER BY year;

SELECT r.id,u.name,r.leave_type,r.start_date,r.end_date,r.status,
       COUNT(d.day) AS charged_days
FROM leave_requests r
JOIN users u ON u.id=r.user_id
LEFT JOIN leave_days d ON d.request_id=r.id
GROUP BY r.id,u.name,r.leave_type,r.start_date,r.end_date,r.status
ORDER BY r.id DESC;

SELECT d.day,COUNT(DISTINCT d.user_id) AS people
FROM leave_days d JOIN leave_requests r ON r.id=d.request_id
WHERE r.status IN ('pending','approved')
GROUP BY d.day ORDER BY d.day;

SELECT request_id,bytes,mime,created_at FROM certificates;
```

ไม่เปิด password_hash, session token_hash หรือ ciphertext ไปแสดงในรายงานทั่วไป และไม่แก้สถานะคำขอโดย SQL ตรง เพราะจะข้าม audit/กติกาของ API
