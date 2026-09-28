# Codex Windows recovery

คู่มือนี้รวบรวมเครื่องมือกู้คืนและบันทึกเหตุการณ์ของ Codex บน Windows เครื่องที่ตรวจจริง ใช้ [board](docs/BOARD.md) ดูปัญหาที่ยังติดตามอยู่ และใช้ [timeline](docs/TIMELINE.md) ดูลำดับเหตุการณ์ก่อนเลือกวิธีตรวจ

ตรวจสถานะล่าสุด: 28 กันยายน 2026 (ICT)

## สถานะล่าสุด

| ส่วน | ผลที่ตรวจได้ | ขอบเขต |
| --- | --- | --- |
| Desktop `26.924.2738.0` | เปิดผ่านตัวกู้คืนแล้วส่งข้อความและได้รับคำตอบ | การเปิดผ่าน shortcut ปกติหลังแก้ setup ยังไม่ได้ยืนยันว่าหายค้างถาวร |
| Windows sandbox setup | ผ่านหลังทดสอบ `workspace-write` ชั่วคราว; คืน `danger-full-access` แล้วส่งข้อความได้ ไม่มี setup banner | ค่าที่คืนไว้เป็นค่าเดิมของเครื่องที่ตรวจ |
| CLI `0.157.1` | daemon รายงาน `running`; ผู้ใช้เปิด `codex` โดยไม่ใส่ `--no-daemon` ได้ | กู้แพ็กเกจ daemon แบบ manual; ตัวติดตั้งอัตโนมัติยังมีข้อผิดพลาดที่ระบุ syscall ต้นเหตุไม่ได้ |
| Appshot | ตัวกู้คืนรายงาน `active` หลังเปิด Desktop | ผลกด Alt+Alt หลังการกู้ครั้งล่าสุดยังไม่ได้ทดสอบแยก |

ผลล่าสุดและหลักฐานอยู่ใน [เหตุการณ์ 28 ก.ย.](docs/incidents/2026-09-28-desktop-sandbox-cli.md) การใช้งานได้หลัง recovery เป็นผลของเครื่องและ build ที่ระบุ ไม่ใช่หลักฐานว่าการอัปเดตครั้งต่อไปจะผ่าน

## เริ่มจากอาการ

| อาการ | อ่านก่อน | เครื่องมือหรือจุดตรวจ |
| --- | --- | --- |
| Desktop หมุนค้างหรือไม่มีหน้าหลัก | [loading เกิดซ้ำ 27 ก.ย.](docs/incidents/2026-09-27-loading-recurrence.md) | [ตัวเปิดพร้อมกู้คืน](docs/TOOLS.md#desktop-launcher) |
| `Windows setup didn't finish` หรือส่งข้อความไม่ได้ | [เหตุการณ์ 28 ก.ย.](docs/incidents/2026-09-28-desktop-sandbox-cli.md) | ตรวจ `sandbox_mode`, setup log และการส่งข้อความจริง |
| `codex` ขึ้น `Access is denied. (os error 5)` | [เหตุการณ์ 28 ก.ย.](docs/incidents/2026-09-28-desktop-sandbox-cli.md) | `codex app-server daemon version` และ `codex --no-daemon` |
| Alt+Alt ไม่เปิด Appshot | [Appshot 27 ก.ย.](docs/incidents/2026-09-27-loading-and-appshot.md) | ตัวเปิดตรวจ Appshot แยกจากหน้าหลัก |
| Integrations หรือ plugin หาย | [คู่มือเดิม ณ 27 ก.ย.](docs/archive/README-2026-09-27.md) | ตรวจ plugin, runtime และ reconciliation log |

## เครื่องมือ

`Start-Codex-Recovery.cmd` ใช้กับ Desktop build `26.924.2738.0` ที่ทดสอบแล้ว ต้องมี PowerShell 7 และ Node.js 24 และ Quit แอปเดิมก่อน ตัวเปิดตรวจ package, process และ listener ที่ `127.0.0.1` ก่อนขอ initialization snapshot จริง ไม่แก้ signed package หรือ profile ดูคำสั่งและข้อจำกัดใน [คู่มือเครื่องมือ](docs/TOOLS.md)

repo นี้ยังไม่มีสคริปต์ซ่อม CLI daemon แบบทั่วไป การกู้ครั้งล่าสุดตรวจไฟล์ทั้งชุดและสถานะเครื่องก่อนสร้าง release; ห้ามนำคำสั่งนั้นไปใช้กับ version ใหม่โดยไม่ตรวจหลักฐานอีกครั้ง

## สำหรับ agent ที่เข้ามาช่วย

1. อ่าน [board](docs/BOARD.md), [timeline](docs/TIMELINE.md) และ incident ที่ตรงกับอาการ
2. ตรวจ version, Git status, log และอาการที่ผู้ใช้เห็นจริงก่อนแก้ไข
3. แยก `ยืนยันแล้ว`, `ข้อสันนิษฐาน` และ `ยังไม่ได้ทดสอบ` ทุกครั้ง
4. เพิ่ม incident หรือเสนอแก้ผ่าน GitHub issue/PR โดยไม่อัปโหลด raw log, ETL trace, token, cookie, chat หรือข้อมูลบัญชี

วิธีบันทึกเหตุการณ์และกติกาการอัปเดต board อยู่ใน [BOARD.md](docs/BOARD.md) และมี [GitHub issue form](.github/ISSUE_TEMPLATE/windows-incident.yml) สำหรับรับผลตรวจใหม่ โค้ดตัวเปิดและชุดทดสอบอยู่ใน `scripts/` และ `tests/`

## ข้อจำกัด

ตัวเปิด Desktop เป็น workaround ที่ตรวจเฉพาะ build; การแก้ถาวรต้องอยู่ในผลิตภัณฑ์ ส่วน CLI ที่กู้แบบ manual อาจต้องตรวจใหม่เมื่อ CLI อัปเดต ห้ามสรุปว่า cache, GPU, บัญชี หรือ security product เป็นสาเหตุเพียงจากอาการ `Access is denied`
