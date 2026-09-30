# เครื่องมือและวิธีตรวจ

ใช้ PowerShell 7 (`pwsh`) บน Windows เครื่องที่มีปัญหา ตรวจ package version และอาการจริงก่อนใช้ตัวกู้คืนทุกครั้ง รายการนี้แยกคำสั่งอ่านสถานะออกจากคำสั่งที่เปลี่ยนสถานะ

## คำสั่งอ่านสถานะ

`Get-AppxPackage -Name OpenAI.Codex | Select-Object Name,Version,Status` แสดง Desktop package ที่ติดตั้ง

`codex --version` และ `codex app-server daemon version` แสดง CLI และ daemon ที่เลือก คำสั่ง `version` ของ daemon รายงาน `running` หรือสถานะอื่นเป็น JSON; CLI `0.157.1` ไม่มี subcommand `status`

`codex --no-daemon doctor --summary --no-color --ascii` ใช้ตรวจ CLI เมื่อ daemon installer ยังล้มเหลว ผล doctor เป็นข้อมูลวินิจฉัย ไม่ใช่หลักฐานว่า Desktop ส่งข้อความได้

ก่อนแชร์ผลคำสั่ง ให้ลบ path ที่ระบุตัวผู้ใช้, account identifier และข้อมูลใน log ที่เกี่ยวข้องกับแชต

PowerShell catch ของตัวเปิดและ Appshot helper แทนที่ user-profile path และอีเมลใน error message ก่อนเขียนลง stderr โดยไม่พิมพ์ source path ของสคริปต์ การปิดข้อมูลนี้ไม่ครอบคลุม raw log หรือข้อมูลทุกชนิด จึงยังต้องตรวจ output ก่อนแชร์

## Desktop launcher

ไฟล์: [Start-Codex-Recovery.cmd](../Start-Codex-Recovery.cmd), [recover-codex.ps1](../scripts/recover-codex.ps1)

ทดสอบกับ `OpenAI.Codex 26.924.2738.0` เท่านั้น ต้องมี `pwsh` 7 และ Node.js 24 อยู่แล้ว ไม่ติดตั้ง dependency เพิ่ม

1. บันทึกเวลาและอาการก่อนกู้ แล้ว Quit Codex Desktop ให้ process เดิมออกจริง การกด X อาจเหลือ process
2. ดับเบิลคลิก `Start-Codex-Recovery.cmd` หรือจาก repo รัน:

   `pwsh -NoLogo -NoProfile -File .\scripts\recover-codex.ps1`

3. รอผล `recovered` หรือ `already-ready` แล้วตรวจหน้าหลัก, composer, การส่งข้อความ และ Alt+Alt แยกกัน
4. ถ้าตัวเปิดรายงาน `unverified`, `unsupported` หรือ error ให้เก็บข้อความและหยุด ไม่ข้ามตัวตรวจ package/process/readiness

ตัวเปิดใช้ diagnostic listener ที่ `127.0.0.1:9337` และตรวจว่าเป็น process ของ package ที่ถูกต้อง listener อยู่จน Quit แอป ไม่แก้ signed binary, profile หรือ shortcut ปกติ ถ้า build เปลี่ยน ตัวเปิดจะปฏิเสธการทำงาน อย่าปลด version gate เพื่อทดลองกับ build ใหม่

รายละเอียดการกู้และ fallback ของ Appshot อยู่ใน [incident 27 ก.ย.](incidents/2026-09-27-loading-recurrence.md)

## CLI daemon ที่ติด `os error 5`

ผล 28 ก.ย. อยู่ใน [incident 28 ก.ย.](incidents/2026-09-28-desktop-sandbox-cli.md) `codex --no-daemon` เป็นทางใช้ CLI ระหว่าง daemon เสีย การซ่อมครั้งนั้นใช้แพ็กเกจ CLI `0.157.1` ที่มีอยู่ ตรวจ manifest, path, SHA256 ของไฟล์ 45 รายการ และผล `--version` ก่อนเลือก release แล้วให้ผู้ใช้ทดสอบ `codex` จริง

repo นี้จงใจไม่มีคำสั่ง copy/junction แบบ version-agnostic เพราะยังไม่รู้ syscall ที่ทำให้ installer ล้มเหลวและโครงสร้างแพ็กเกจอาจเปลี่ยนเมื่ออัปเดต หากเกิดซ้ำ ให้เก็บ error/trace ก่อน ตรวจ source package และ target ปัจจุบัน แล้วทำแผนกู้ที่ย้อนคืนได้สำหรับ version นั้น

## Windows sandbox setup

ในเหตุการณ์ 28 ก.ย. config เดิม `sandbox_mode = "danger-full-access"` ทำให้ setup ส่ง `only managed permission profiles can be enforced by the Windows sandbox` การเปลี่ยนเป็น `workspace-write` ชั่วคราวทำให้ setup ผ่าน จากนั้นคืนค่าเดิมและทดสอบ cold launch กับการส่งข้อความอีกครั้ง

การเปลี่ยน config เป็นขั้นตอนเฉพาะเหตุการณ์ ต้องสำรองไฟล์ก่อน เปลี่ยนเพียง key ที่ทดสอบ และตรวจว่าการคืนค่าไม่ทับค่าที่แอปเขียนใหม่ระหว่าง setup อย่าตั้ง registry/service state ด้วยการเดา

## ทดสอบตัวเปิดหลังแก้โค้ด

จาก root ของ repo:

`node --test .\tests\recovery.test.mjs .\tests\appshot-recovery.test.mjs`

`pwsh -NoLogo -NoProfile -File .\tests\recovery-safety.tests.ps1`

`pwsh -NoLogo -NoProfile -File .\tests\privacy.tests.ps1` ตรวจข้อความ error และ exit code ใน child process โดยไม่เปิด Codex

ผล test ของสคริปต์ไม่แทนการตรวจ UI จริง: ให้ผู้ใช้ยืนยันหน้าหลัก, การส่งข้อความ, Alt+Alt และ cold launch ตามขอบเขตงาน
