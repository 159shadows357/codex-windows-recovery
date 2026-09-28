# Problem board

หน้านี้เป็นดัชนีสำหรับ agent และผู้ช่วยที่เข้ามาตรวจเครื่องเดียวกัน สถานะเป็นผลล่าสุดที่มีหลักฐานใน repo ไม่ใช่สถานะของผลิตภัณฑ์ทุกเครื่อง ตรวจ [timeline](TIMELINE.md) และ incident ก่อนเปลี่ยนสถานะ ใช้ [issue form](../.github/ISSUE_TEMPLATE/windows-incident.yml) รับเหตุการณ์ใหม่เมื่อ GitHub Issues เปิดใช้งาน

ปรับปรุงล่าสุด: 28 กันยายน 2026

| ID | เรื่อง | สถานะบนเครื่องที่ตรวจ | หลักฐานและงานที่ยังเปิด |
| --- | --- | --- | --- |
| WIN-01 | Desktop loading ค้างหลังอัปเดต | กู้คืนเฉพาะ launch ด้วยตัวเปิด | [เกิดซ้ำหลัง cold launch](incidents/2026-09-27-loading-recurrence.md); ยังไม่ทราบว่า initialization event หายตรงขั้นใด |
| WIN-02 | Appshot `DoubleAlt` timeout | กู้คืนใน launch ที่ทดสอบ | [Appshot](incidents/2026-09-27-loading-and-appshot.md); ผล Alt+Alt หลังการกู้ครั้งล่าสุดยังไม่ทดสอบ |
| WIN-03 | Windows sandbox setup หยุด | ผ่านบนเครื่องที่ตรวจ | [เหตุการณ์ 28 ก.ย.](incidents/2026-09-28-desktop-sandbox-cli.md); ทดสอบด้วย `workspace-write` ชั่วคราว คืนค่าเดิมและส่งข้อความผ่าน |
| WIN-04 | CLI daemon install `os error 5` | CLI ใช้ได้หลังซ่อม local package | [เหตุการณ์ 28 ก.ย.](incidents/2026-09-28-desktop-sandbox-cli.md); syscall/filter ที่ทำให้ auto installer ล้มเหลวยังไม่ยืนยัน |
| WIN-05 | Integrations/plugin หายระหว่าง reconcile | กลับมาหลัง reconciliation ในเหตุการณ์เดิม | [คู่มือเดิม](archive/README-2026-09-27.md); ตรวจซ้ำเมื่อมีอัปเดตใหม่ |

ยังไม่ได้ส่ง raw trace หรือ incident ไปยัง OpenAI จาก repo นี้ การเปิด issue ภายนอกต้องคัดกรองข้อมูลในหลักฐานก่อน

## วิธีเพิ่มผลตรวจ

1. ตรวจ `git status`, package/CLI version และเวลาที่เกิดอาการก่อนใช้ข้อมูลเก่า
2. ถ้าเป็นเหตุการณ์ใหม่ ให้เพิ่มไฟล์ `docs/incidents/YYYY-MM-DD-topic.md` โดยระบุอาการ, เวลาตาม ICT, version, หลักฐานก่อนแก้, ขั้นตอนที่ทำ, ผลทดสอบจริง และสิ่งที่ยังไม่ทราบ
3. เพิ่มแถวตามวันที่ใน [TIMELINE.md](TIMELINE.md) แล้วแก้สถานะใน board เมื่อมีหลักฐานใหม่ อย่าเขียนทับผลเก่าที่ต่าง version
4. แยกการเห็นเมนู, การเปิด UI, การส่งข้อความ, Alt+Alt, การบันทึกภาพ และการเปิดใหม่เป็นผลทดสอบคนละข้อ
5. เสนอแก้โค้ดผ่าน PR หรือบันทึกปัญหาใน GitHub issue พร้อมลิงก์ incident ที่ตัดข้อมูลส่วนตัวแล้ว ให้การเปลี่ยนสคริปต์มีการทดสอบและขอบเขต build ชัดเจน

## ข้อมูลที่ไม่ใส่ใน Git

ไม่ commit raw `.etl`, SQLite, desktop log, feature snapshot รายบัญชี, token, cookie, `auth.json`, ข้อความแชต, account identifier, host/domain ภายในองค์กร หรือ path ที่ระบุตัวผู้ใช้ ใช้ `%USERPROFILE%` และ `%LOCALAPPDATA%` ในคำอธิบายที่จำเป็นต้องมี path

ก่อนสรุปสาเหตุ ให้ติดป้ายในข้อความว่า **ยืนยันแล้ว**, **สอดคล้องกับหลักฐานแต่ยังไม่พิสูจน์**, หรือ **ยังไม่ทราบ** การกู้คืนได้ไม่เท่ากับการแก้บั๊กถาวร
