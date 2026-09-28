# Timeline

เวลาทั้งหมดเป็นเวลาไทย (ICT, UTC+7) วันที่เป็นวันที่เกิดเหตุ ไม่ใช่วันที่เขียนเอกสาร แถวหนึ่งอาจมีหลายอาการ จึงต้องเปิด incident ก่อนนำวิธีกู้ไปใช้

| วันที่ | เหตุการณ์และหลักฐาน | ผลที่ตรวจได้ | บันทึก |
| --- | --- | --- | --- |
| 3 ก.ย. 2026 | Desktop เปิดหน้าว่าง; package และ process ยังทำงาน แต่ route `/` ไม่มี element ใน launch ที่เสีย | deep link ช่วยกู้บาง launch; ยังไม่ใช่การแก้ถาวร | [คู่มือเดิม](archive/README-2026-09-27.md) |
| 4 ก.ย. 2026 | บน build ต่อมา renderer หยุดที่ `div#root` แม้ package/SQLite ผ่านการตรวจ | จัดเป็น renderer bootstrap ที่ค้าง; input ที่ค้างไม่ถูกจับได้ | [คู่มือเดิม](archive/README-2026-09-27.md) |
| 17 ก.ย. 2026 | Integrations หายหลังอัปเดต; desktop bundle, plugin cache และ copied runtime ไม่ตรงกันระหว่าง reconcile | กลับมาหลัง reconciliation รอบต่อไป | [คู่มือเดิม](archive/README-2026-09-27.md) |
| 19 ก.ย. 2026 | plugin list ลดชั่วคราวระหว่าง startup; Appshot ลงทะเบียน `DoubleAlt` ไม่สำเร็จ | plugin ติดตั้งกลับ; Appshot เป็น native path ที่ต้องตรวจแยก | [คู่มือเดิม](archive/README-2026-09-27.md) |
| 27 ก.ย. 2026 | หลังอัปเดตเป็น Desktop `26.924.2738.0`, loading ค้างทั้งที่ backend พร้อม; renderer ไม่มี `appServerVersion` | ขอ initialization snapshot จริงซ้ำแล้วหน้าหลักกลับมา แต่ normal cold launch ค้างซ้ำ | [loading และ Appshot](incidents/2026-09-27-loading-and-appshot.md), [การเกิดซ้ำ](incidents/2026-09-27-loading-recurrence.md) |
| 27 ก.ย. 2026 | Appshot native registration timeout และจำสถานะล้มเหลวไว้ | ตัวเปิดกู้หน้าหลักและ Appshot ได้ใน cold launch ที่ทดสอบ; ผู้ใช้กด Alt+Alt ยืนยัน | [การเกิดซ้ำ](incidents/2026-09-27-loading-recurrence.md) |
| 28 ก.ย. 2026 | ติดตั้ง Desktop build เดิมใหม่แล้วยังหมุนค้าง; ตัวเปิดกู้หน้าหลัก/Integrations ได้ แต่การส่งข้อความติด Windows setup | ทดสอบ `workspace-write` ชั่วคราวจน setup ผ่าน; คืน `danger-full-access` แล้วส่งข้อความได้ ไม่มี banner | [Desktop, sandbox และ CLI](incidents/2026-09-28-desktop-sandbox-cli.md) |
| 28 ก.ย. 2026 | CLI `0.157.1` ติดตั้ง app-server daemon อัตโนมัติแล้วขึ้น `Access is denied. (os error 5)` | กู้ release จากแพ็กเกจเดิมและสร้าง junction หลังตรวจ SHA256 ครบ 45 ไฟล์; daemon `running` และผู้ใช้เปิด `codex` ปกติได้ | [Desktop, sandbox และ CLI](incidents/2026-09-28-desktop-sandbox-cli.md) |

## ขอบเขตของข้อสรุป

- เหตุการณ์ 27–28 ก.ย. มีอย่างน้อยสามเส้นทางแยกกัน: renderer readiness, Windows sandbox setup และ CLI daemon installer
- setup error มีข้อความและเงื่อนไข config ที่จับคู่กันได้; การกู้ Desktop และ CLI ยังไม่พิสูจน์สาเหตุภายในผลิตภัณฑ์ครบทุกขั้น
- การเปิดสำเร็จหนึ่งรอบไม่ปิด incident ที่เกิดซ้ำหลังอัปเดต ใช้ [board](BOARD.md) ดูสถานะที่ติดตามอยู่
