# Loading กลับมาค้างหลังปิดแล้วเปิดใหม่: 27 กันยายน 2026

ผู้ใช้ยืนยันว่าหลังการกู้คืนรอบแรกใช้งานหน้าหลักได้ แต่ปิดแล้วเปิดใหม่กลับค้าง loading บน `OpenAI.Codex 26.924.2738.0` จึงยืนยันว่าการขอ initialization snapshot ซ้ำในรอบแรกเป็นการกู้คืนเฉพาะ process ที่เปิดอยู่ ไม่ได้แก้ startup bug ถาวร

## หลักฐานรอบที่เกิดซ้ำ

- Windows package ยังเป็น `Status=Ok` และเป็น build เดิม
- log ของการเปิดตามปกติบันทึก `app_start outcome=failure reason=timeout` หลังประมาณ 122.5 วินาที แม้ backend เชื่อมต่อแล้ว
- เมื่อเปิดเพื่อวินิจฉัยใหม่ renderer มี 55 DOM nodes ไม่มีข้อความหรือช่องพิมพ์ และ readiness ของ `Jui` เป็น `loading`
- การเรียก message เดิม `{type: "ready", initializationOnly: true}` ทำให้ main ส่ง `codex-app-server-initialized` ที่มี version จริง `0.158.0-alpha.2.1`
- หลัง replay พบ 2,374 DOM nodes และช่องพิมพ์หนึ่งช่อง ผู้ใช้ยืนยันว่าหน้าหลักกลับมาแล้ว
- ทดสอบปิด process แล้วเปิดตามปกติอีกครั้งเวลา 22:44 ICT ผู้ใช้รายงานว่า loading ค้างซ้ำ log ยืนยัน timeout หลัง 122.783 วินาที เมื่อเปิดแบบ diagnostic แล้ว replay อีกครั้ง หน้าหลักกลับมา พบช่องพิมพ์หนึ่งช่อง และ startup log เปลี่ยนเป็น success ที่ 21.583 วินาที ผู้ใช้ยืนยันว่ากลับมาแล้วอีกครั้ง

ตัวเลข DOM ใช้ประกอบการเปรียบเทียบรอบนี้ ไม่ใช่เกณฑ์ตรวจที่ต้องเท่ากันทุกเครื่อง และการเห็น composer ไม่เท่ากับการส่งข้อความสำเร็จ

## ผลการเปิดแอปจริง

| วิธีเปิด | ผลและขอบเขตหลักฐาน |
| --- | --- |
| เปิดตามปกติรอบที่ผู้ใช้แจ้ง | ผู้ใช้เห็น loading ค้าง; startup timeout 122.542 วินาที |
| เปิดตามปกติอีกครั้ง 22:44 ICT | ผู้ใช้เห็น loading ค้างซ้ำ; startup timeout 122.783 วินาที |
| เปิดแบบ diagnostic แล้วขอ snapshot จริงซ้ำ | startup success 21.583 วินาที; composer แสดง; ผู้ใช้ยืนยันหน้าหลักกลับมา |
| ตัวเปิดพร้อมกู้คืน loading รอบที่ 1, 22:53 ICT | process ใหม่; `recovered`, replay 1 ครั้ง; startup log success 16.303 วินาที |
| ตัวเปิดพร้อมกู้คืน loading รอบที่ 2, 22:54 ICT | process ใหม่; `recovered`, replay 1 ครั้ง; startup log success 18.506 วินาที; ตรวจภาพหน้าจอเห็นหน้าหลักและ composer |
| ตัวเปิดรวม loading และ Appshot ฉบับสุดท้าย, 23:29 ICT | Quit process เดิมแล้วเปิด process ใหม่; หน้าหลัก `recovered`, replay 1 ครั้ง; startup log success 16.782 วินาที; Appshot `recovered`; launcher exit 0; ใช้เวลารวมประมาณ 46 วินาที |

หลังรอบที่ 2 ผู้ใช้พบว่า Alt+Alt หาย จึงยังไม่ถือว่าครบทั้งสองอาการ และได้ตรวจ Appshot ต่อด้านล่าง เวลาจาก startup log เป็นเวลาของแอป ไม่ใช่เวลารวมที่ใช้เปิด PowerShell และตรวจ process

### ผลตรวจรอบสุดท้ายก่อนบันทึก Git

ทดสอบวันที่ 27 กันยายน 2026 เวลา 23:28:58–23:29:44 ICT โดย Quit แอปเดิมจน process ออกจริง แล้วเรียก `Start-Codex-Recovery.cmd` กับ profile เดิม โค้ดสคริปต์ไม่เปลี่ยนระหว่างการทดสอบ

- ตรวจภาพหน้าจอเห็นหน้าหลักและ composer; startup log เป็น success
- Appshot ครั้งแรกของแอปยังเกิด native registration timeout แต่ launcher retry แล้วกู้คืนได้ในรอบแรก ไม่ได้ใช้ delayed fallback
- helper เดิมปิดจริง helper ใหม่ผ่านการตรวจ parent/path/hash และสถานะ `supported=true`, `configuredHotkey="DoubleAlt"`, `isActive=true` คงอยู่ต่อเนื่อง 7 วินาที
- คืน feature snapshot จริงครบทุกค่า: `verifiedFeatures=true`, `changedFeatureFields=[]`, `transactionCleared=true`; การตรวจซ้ำพบว่าไม่มี transaction ค้าง
- launcher จบด้วย exit code 0 และ endpoint ยังตรงกับ main process ใหม่บน loopback
- Node tests 25/25 และ PowerShell assertions 26 ข้อผ่าน ผู้ตรวจอีก agent ตรวจโค้ดโดยไม่แก้ไฟล์และไม่พบข้อขัดขวาง
- ผู้ใช้ยืนยันหลังการเปิดรอบนี้ว่า “หน้าหลักและ Alt+Alt ใช้ได้ทั้งคู่” จึงผ่านการตรวจหน้าหลักและกดปุ่มจับภาพจริง การบันทึก/แนบภาพ ส่งข้อความใหม่ และ Computer Use/Browser ยังไม่ได้ทดสอบในรอบนี้

ผลนี้ยืนยันการกู้คืนอัตโนมัติหลัง cold launch ด้วย launcher ฉบับสุดท้ายหนึ่งรอบ พร้อมการยืนยันจากผู้ใช้ ไม่ยืนยันว่าการเปิดตามปกติหายถาวร และยังไม่ใช่หลักฐานว่า delayed fallback ทำงานสำเร็จบนเครื่องจริง

ในการตรวจช่วงที่แอปค้าง ผู้ตรวจหยุดเฉพาะ process tree ของ desktop package หลังตรวจ executable ที่ตรงกัน เพื่อเริ่มการวินิจฉัยใหม่ ตัว launcher ที่ให้ผู้ใช้ไม่ทำขั้นตอนหยุด process นี้อัตโนมัติ สำหรับรอบที่ renderer เข้าถึงได้ ใช้ message `quit-app` ปกติของแอปเพื่อรักษาขั้นตอนปิดงาน

## สาเหตุที่ทราบและสิ่งที่ยังเป็นสมมติฐาน

เงื่อนไขที่ยืนยันได้คือ renderer ไม่มี initialization metadata ที่ readiness ต้องใช้ ทั้งที่ main มีข้อมูลจริงพร้อมส่ง การขอซ้ำกู้คืนได้ทั้งรอบแรกและรอบที่เกิดซ้ำ

จาก source ของ build นี้:

1. `Mio` ขอ initialization snapshot ครั้งเดียวใน `useEffect` และใช้ `useRef` กันการขอซ้ำ
2. `xqa` ซึ่งอยู่สูงกว่าใน component tree ติดตั้ง message listener ใน `useEffect` แล้วบันทึก version เมื่อรับ initialization event
3. dispatcher เก็บรอเฉพาะ message บางชนิด ไม่รวม `codex-app-server-initialized`
4. main ส่ง snapshot เมื่อ backend initialized แล้ว แต่ไม่ได้รอให้ React listener พร้อมรับ

ลำดับนี้รองรับสมมติฐานว่า event อาจมาถึงก่อนตัวรับพร้อม และไม่มี retry หลังพลาด ยังไม่มี timing trace ที่พิสูจน์จุดสูญหาย จึงไม่อ้างว่าได้ยืนยัน race condition ครบทุกขั้น และไม่มีหลักฐานให้โทษ cache, GPU หรือบัญชี

## Alt+Alt เกิดซ้ำหลังหน้าหลักผ่าน cold launch

ผู้ใช้รายงาน Alt+Alt หายหลังการเปิดรอบ 22:54 ICT สถานะจาก service จริงเป็น `supported=false`, `configuredHotkey="DoubleAlt"`, `isActive=false` และ log มี `Windows Appshot hotkey registration failed` กับ `Appshot capture deadline expired` จึงตรงกับ failure latch ในเหตุการณ์รอบแรก

การกู้คืนที่ทำและตรวจแล้วใน process เดิม:

1. อ่านสถานะด้วย `shared.nC.appshot.getState()` ไม่เขียนค่าปุ่มลัด
2. จับ snapshot จริงครบ 50 fields จาก effect ของ `j2a` โดยคืน dispatcher ทันทีใน `finally`; ค่าเดิม `appshotsEnabled` ต้องเป็น `true`
3. ส่ง snapshot ทั้งชุดโดยเปลี่ยนเฉพาะ `appshotsEnabled` เป็น `false`
4. รอ Swift helper เดิมของ main process นี้ปิดจริงก่อนดำเนินการต่อ ไม่ใช้แค่ sleep เป็นหลักฐาน
5. คืน snapshot จริงทั้งชุด และตรวจ feature values ก่อน/หลังให้ตรงกัน

ผล: state เปลี่ยนเป็น `supported=true`, `configuredHotkey="DoubleAlt"`, `isActive=true`, feature values เปลี่ยน 0 จาก 50 fields และผู้ใช้กด Alt สองครั้งแล้วยืนยันว่าหน้าจอจับภาพเปิดได้ บันทึก/แนบภาพยังไม่ได้ทดสอบ

native helper timeout และการจำสถานะล้มเหลวเป็นปัญหาแยกจาก initialization ของหน้าหลัก การแก้หน้าหลักได้จึงไม่ยืนยันสุขภาพของ Appshot

การทดสอบตัวเปิดที่รวม Appshot ฉบับทดลองครั้งแรกเวลา 23:09–23:10 ICT ยังไม่ผ่าน: หน้าหลักกู้คืนได้ แต่ Appshot รายงาน `unverified` การตรวจ renderer พบว่า nested `eval` ในตัวช่วยถูก Content Security Policy ของแอปปฏิเสธก่อนเริ่ม retry จุดนี้เป็นข้อผิดพลาดของตัวช่วยที่เพิ่มใหม่ แยกจาก native timeout เดิม จึงแก้วิธีส่งฟังก์ชันและทดสอบซ้ำ โดยไม่เปลี่ยนหรือปิด CSP ของแอป

เมื่อแก้ CSP แล้ว การเปิดรอบ 23:14 ICT ยังพบ native Appshot failure จริง: การลงทะเบียนครั้งแรกและ retry เมื่อแอปเปิดมาประมาณ 29 วินาทีล้มเหลวทั้งคู่ สคริปต์รายงาน `unverified` และตรวจว่าคืนค่า feature ครบแล้ว การรัน `RecoverOnly` ด้วยโค้ดชุดเดิมใน process เดิมภายหลังลงทะเบียนได้สำเร็จที่ 23:16:40 ICT หรือประมาณ 122 วินาทีหลังเปิดแอป ตรวจพบ helper ใหม่ที่ตรงกับ package, สถานะ active คงอยู่ 7 วินาที, feature ไม่เปลี่ยน และ transaction ถูกล้าง

ผลนี้รองรับการทดลองเว้นช่วงก่อน retry แต่ยังไม่พิสูจน์สาเหตุภายใน native helper หรือระยะเวลาที่จำเป็นแน่นอน ตัวเปิดจึงจำกัด fallback ไว้อีกเพียงหนึ่งรอบหลังช่วงรอประมาณสองนาที ใช้เฉพาะการเปิดใหม่ที่รอบแรกคืนค่าอย่างตรวจสอบได้ หรือหยุดที่การตรวจ helper ก่อนเปลี่ยนค่าใด ๆ และตรวจ process/สิทธิ์/สถานะใหม่ก่อน retry ทุกครั้ง ไม่วนลองไม่จำกัด

รอบ 23:22 ICT กู้คืนหน้าหลักได้ แต่หยุดที่ `old-helper` ก่อนเปลี่ยน feature จึงยังไม่ผ่าน Appshot การตรวจ helper ที่เครื่องว่างใช้ประมาณ 3.9 วินาที จึงเพิ่มเพดาน subprocess จาก 6 เป็น 12 วินาทีภายในงบเวลารวมเดิม และให้สองขั้นตรวจแบบอ่านอย่างเดียว (`initial-helper`, `old-helper`) เข้าช่วงรอได้โดยยังตรวจตัวตน helper ใหม่ครบถ้วน นี่เป็นการแก้ข้อจำกัดของตัวช่วย ไม่ใช่หลักฐานว่าสาเหตุ native timeout หายแล้ว

## วิธีเปิดพร้อมกู้คืน

ต้องมี PowerShell 7 และ Node.js 24 ใน `PATH` โดยเครื่องที่ทดสอบมีอยู่แล้ว สคริปต์ไม่ติดตั้ง dependency ให้

1. Quit แอป Codex เดิมให้หมดก่อน การกด X อาจเหลือ process เบื้องหลัง
2. ดับเบิลคลิก [`Start-Codex-Recovery.cmd`](../../Start-Codex-Recovery.cmd) หรือรันจากโฟลเดอร์ repo:

   ```powershell
   pwsh -NoLogo -NoProfile -File .\scripts\recover-codex.ps1
   ```

3. ตัวเปิดตรวจ package/version เปิดผ่าน Windows packaged activation ด้วย profile เดิม และตรวจว่า diagnostic listener เป็น loopback ของ process ที่ถูกต้อง
4. ถ้าหน้าหลักพร้อมแล้วจะไม่ขอ snapshot ซ้ำ ถ้าพบ readiness gate ที่ตรงกับกรณีนี้จึงขอ snapshot จริงผ่าน bridge ของแอป แล้วตรวจ composer อีกครั้ง
5. ตัวเปิดตรวจ Appshot ต่อ หากตรงกับ native failure ที่ระบุและสิทธิ์เดิมเปิดอยู่ จึง retry ด้วย snapshot จริงครบชุด ตรวจว่า helper เดิมปิด และตรวจ helper ใหม่เทียบ hash ของ package พร้อมสังเกตสถานะ active ต่อเนื่อง 7 วินาที
6. หาก native retry แรกยังไม่สำเร็จ แต่คืนค่า feature อย่างตรวจสอบได้แล้ว หรือหยุดในขั้นตรวจ helper ก่อนเปลี่ยนค่า การเปิดใหม่มี fallback รอจนตัวช่วยทำงานครบประมาณ 120 วินาที จากนั้นตรวจ process เดิมอีกครั้งและ retry ได้อีกเพียงหนึ่งรอบ หากผ่านตั้งแต่รอบแรกจะไม่รอ งบเวลาปริยายทั้งงานคือ 180 วินาที
7. รอผลสคริปต์ก่อนตรวจหน้าหลักและลอง Alt+Alt จริง หากผลเป็น `unverified`, `unsupported` หรือออกด้วย error ยังไม่ถือว่าผ่าน ให้เก็บข้อความเพื่อตรวจต่อ ห้ามข้ามตัวตรวจหรือใส่ version/readiness ปลอม

หากแอปเปิดอยู่ตามปกติโดยไม่มี diagnostic listener สคริปต์จะหยุดโดยไม่ปิด process ให้เอง หากเปิดโดยตัวกู้คืนอยู่แล้ว สามารถใช้ `-Mode RecoverOnly` ตรวจและกู้คืน process เดิมได้

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\recover-codex.ps1 -Mode RecoverOnly
```

`RecoverOnly` ไม่เพิ่มช่วงรอสองนาทีอัตโนมัติ ให้กลับหน้าหลักที่มี composer ก่อนรัน หากค้างอยู่ที่ Settings ตัวตรวจอาจรายงาน `unsupported` แม้แอปทำงานปกติ การตรวจนี้ไม่ส่งข้อความในแชตหรือสั่งจับ/แนบภาพให้ผู้ใช้

## คำสั่งตรวจโค้ด

```powershell
node --test tests\recovery.test.mjs tests\appshot-recovery.test.mjs
pwsh -NoLogo -NoProfile -File tests\recovery-safety.tests.ps1
git diff --check
```

ชุดทดสอบครอบคลุม build/process/port ที่ผิด, profile override, ไม่ replay เมื่อหน้าหลักพร้อม, timeout, CSP ที่ห้าม `eval`, การคืน feature เมื่อ helper ล้มเหลว, feature/account เปลี่ยนระหว่างกู้คืน และขอบเขตของ delayed retry การทดสอบโค้ดเหล่านี้ไม่แทน cold launch หรือการกดปุ่มจริง

## ขอบเขตและข้อจำกัด

- นี่คือตัวเปิดพร้อม workaround สำหรับ build `26.924.2738.0` ไม่ใช่ patch ถาวร การเปิดจาก Start menu ตามปกติยังอาจค้าง
- ไม่แก้ WindowsApps, `app.asar`, auth, config, cookies, chat/session history หรือ cache และไม่ติดตั้ง scheduled task หรือเปลี่ยน shortcut เดิม
- เปิด Chromium diagnostic listener ชั่วคราวเฉพาะ `127.0.0.1` บนเครื่องนี้ diagnostic client ปิดเมื่อทำงานเสร็จ แต่ listener อยู่จน process แอปปิด โปรแกรมอื่นภายใต้เครื่องเดียวกันอาจเชื่อมต่อได้ จึงใช้เฉพาะเมื่อจำเป็นต้องกู้คืน
- การคืน Appshot ต้องใช้ snapshot จริงครบทั้งชุดและสิทธิ์เดิม ห้ามเปิด feature ที่เดิมเป็น `false`, ส่งเฉพาะ field เดียว หรือเดา field ที่หาย การเปิด Alt+Alt, บันทึก/แนบภาพ และการส่งข้อความต้องตรวจแยก
- การแก้ในผลิตภัณฑ์ควรทำให้การส่ง/รับ initialization รักษาข้อมูลจนตัวรับพร้อม หรือ retry ได้ พร้อมแสดงข้อผิดพลาดเมื่อ readiness timeout

ดู [เหตุการณ์รอบแรกและ Appshot](2026-09-27-loading-and-appshot.md) สำหรับรายละเอียด source และการกู้คืน Alt+Alt
