# Codex Windows recovery runbook

คู่มือนี้ใช้ตรวจและกู้คืน Codex/ChatGPT desktop บน Windows เมื่อเกิดอาการจอว่างหรือ Integrations หายหลังอัปเดต โดยเก็บหลักฐานก่อนเปลี่ยนแปลงข้อมูลผู้ใช้

ตรวจครั้งล่าสุด: 2026-09-19

## ขอบเขตปัญหาที่พบ

### 1. หน้าต่างเปิด แต่หน้าจอว่าง

อาการ:

- process `ChatGPT.exe` ยังตอบสนอง
- ไม่มี sidebar, conversation และ composer
- renderer รับ click ได้เพียง `body > div#root`
- package, account request และฐานข้อมูลอาจยังปกติ

ข้อสรุปจากหลักฐาน:

- package ไม่เสียหาย และ SQLite ผ่าน `quick_check`
- renderer bootstrap หยุดก่อน app shell แสดงผล
- bundle มี readiness gates และ global `Suspense fallback={null}` ซึ่งสามารถทำให้หน้าจอว่างขณะ dependency ยัง pending
- React Router warning เรื่อง route `/` ไม่มี element พบทั้งตอนเสียและตอนเปิดสำเร็จ จึงไม่ใช่หลักฐานเพียงพอที่จะระบุสาเหตุตัวเดียว
- telemetry ที่มีไม่บอก readiness input ตัวที่ค้าง จึงยังระบุสาเหตุระดับโค้ดที่แน่นอนไม่ได้

สิ่งที่ช่วยกู้คืนในเหตุการณ์ที่ผ่านมา:

- เปิด `codex://skills` หรือ existing task deep link ช่วยได้ในบาง build
- ปิดแล้วเปิดแอปใหม่ช่วยได้ในบางครั้งบน build เดิม
- เมื่อมี signed Store build ใหม่ การอัปเดตผ่านปุ่ม Update ในแอปทำให้กลับมาเปิดได้

การเปิดได้อีกครั้งเป็นหลักฐานการกู้คืนของ launch นั้น ไม่ใช่หลักฐานว่า product bug ถูกแก้ถาวร

### 2. Integrations หายหลังอัปเดต

อาการที่พบเมื่อ 2026-09-17:

- Computer Use, Appshots หรือ Browser หายหรือเปิดไม่ได้
- bundled plugin cache ยังเป็น version เก่า ขณะที่ desktop package เป็น version ใหม่
- `config.toml` ชี้ไปยัง `node_repl.exe` ที่ไม่มีอยู่
- log มี `os error 3`, `Access is denied` และ `The directory is not empty` ระหว่าง plugin reconciliation

ข้อสรุป:

- update ordering ทำให้ desktop package, bundled plugin cache และ copied runtime ไม่ตรงกันชั่วคราว
- เมื่อ reconciliation รอบถัดไปสำเร็จ plugin version และ runtime path ถูกปรับให้ตรงกันโดยไม่ต้องลบ profile
- account ที่ต่างกันไม่ใช่หลักฐานว่าเป็น account-specific bug

### 3. Plugins ถูกถอนแล้วติดตั้งกลับระหว่าง startup

หลักฐานเมื่อ 2026-09-19 บน `OpenAI.Codex 26.915.3509.0`:

1. startup เริ่มขณะ feature state ยังไม่พร้อม
2. bundled marketplace ถูกเขียนจาก 7 เหลือ 3 plugins
3. ระบบขอถอน `browser`, `unified-computer-use`, `chrome` และ `computer-use` เพราะไม่อยู่ในรายชื่อชั่วคราว
4. remote plugin catalog request ล้มเหลวในรอบเดียวกัน
5. เมื่อ external plugin state พร้อม ระบบเขียน marketplace กลับเป็น 7 plugins และติดตั้ง 6 plugins
6. `node_repl` เปลี่ยนเป็น `ready`

นี่เป็น startup/reconciliation ordering defect ตัว plugin อาจหายชั่วคราวแล้วกลับมาเองหลัง reconciliation รอบถัดไป

### 4. Appshots หาย แต่ Computer Use และ Browser ยังอยู่

หลักฐานเมื่อ 2026-09-19:

```text
Appshot hotkey inactive configured=true enabled=false platform=win32
Windows Appshot hotkey registration failed
Appshot capture deadline expired
```

Appshots ไม่ปรากฏใน `codex plugin list` แบบเดียวกับ `computer-use` หรือ `browser` เพราะเป็น native integration ที่ใช้ Windows capture bridge และ hotkey แยกต่างหาก การที่ plugin อื่นอยู่ครบจึงไม่ยืนยันว่า Appshots ใช้งานได้

ข้อสรุปที่รองรับได้คือ native capture bridge ไม่ตอบทัน deadline ระหว่างลงทะเบียน hotkey ส่วนสาเหตุที่ทำให้ bridge timeout ยังไม่ปรากฏใน log

## ขั้นตอนตรวจแบบไม่ทำลายข้อมูล

เปิด PowerShell 7 แล้วรันจากบัญชี Windows ของผู้ใช้คนนั้น

### 1. เก็บ package และ health summary

```powershell
Get-AppxPackage -Name OpenAI.Codex |
  Select-Object Name, Version, Status, InstallLocation

codex doctor --summary --no-color --ascii
```

จดเวลาที่เกิดอาการและสถานะที่มองเห็นจริง แยกเป็น:

- UI ว่างทั้งหน้า
- UI ปกติ แต่ Integrations บางรายการหาย
- รายการอยู่ แต่เรียกใช้แล้ว error

### 2. ตรวจ bundled plugins

```powershell
$pluginState = codex plugin list --json | ConvertFrom-Json
$pluginState.installed |
  Where-Object name -in @(
    'browser',
    'chrome',
    'computer-use',
    'unified-computer-use'
  ) |
  Select-Object name, version, installed, enabled
```

ทั้ง 4 รายการควรเป็น version ชุดเดียวกันและมี `installed=True`, `enabled=True`

### 3. ตรวจ copied runtime

```powershell
$configPath = Join-Path $env:USERPROFILE '.codex\config.toml'
$commandLine = Select-String -LiteralPath $configPath -Pattern '^command = .*node_repl\.exe' |
  Select-Object -First 1 -ExpandProperty Line

$nodeReplPath = ($commandLine -split "'", 3)[1]
[pscustomobject]@{
  NodeRepl = $nodeReplPath
  Exists   = Test-Path -LiteralPath $nodeReplPath
}
```

ถ้า `Exists=False` ให้เก็บ log ก่อน อย่าแก้ path ด้วยการเดา เพราะ runtime hash เปลี่ยนตาม build

### 4. ตรวจ desktop log

```powershell
$logRoot = Join-Path $env:LOCALAPPDATA `
  'Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\Codex\Logs'

$latestLog = Get-ChildItem -LiteralPath $logRoot -File -Recurse |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

rg -n -i `
  'appshot|bundled_plugins_reconcile|plugin_marketplace|node_repl|os error|access is denied|directory is not empty' `
  $latestLog.FullName
```

ก่อนส่ง log ให้ผู้อื่น ให้ลบ token, account identifier, query parameter, task/thread ID และข้อความสนทนา

## ขั้นตอนกู้คืนที่แนะนำ

### กรณี UI ว่าง

1. เก็บ package version, `codex doctor`, desktop log และ renderer Sentry scope ก่อน restart
2. ลองเปิด `codex://skills`
3. ถ้ายังว่าง ให้เปิด existing task ผ่าน `codex://threads/<task-id>` โดยไม่เผยแพร่ task ID
4. ถ้ายังว่าง ให้ปิดและเปิดแอปใหม่ แล้วบันทึกว่าเป็น recovery บน build เดิมหรือ build ใหม่
5. ถ้ามี signed desktop update ให้ใช้ปุ่ม Update ในแอปหรือ Microsoft Store
6. หลังเปิดใหม่ ตรวจ sidebar, conversation, composer และ Integrations ด้วยตา

อย่าลบ cache หรือ profile เพียงเพราะ process ยังตอบสนอง และอย่าสรุปว่า GPU เป็นสาเหตุหากยังไม่มีหลักฐานตรง

### กรณี Computer Use หรือ Browser หาย

1. ตรวจ plugin versions และ `node_repl.exe`
2. ตรวจ log ว่ามี `bundled_plugins_reconcile_completed`
3. ถ้า log แสดง feature state ยังไม่พร้อม ให้รอ reconciliation รอบถัดไปหลัง network/account state พร้อม แล้วเปิดแอปใหม่หนึ่งครั้ง
4. ตรวจอีกครั้งว่าทั้ง 4 plugins เป็น version เดียวกันและ runtime path มีอยู่จริง
5. ทดสอบ Computer Use แบบอ่านสถานะหนึ่งครั้ง และ Browser โดยเปิด public page หนึ่งหน้า

อย่าลบ `.codex\.tmp\bundled-marketplaces` ขณะแอปทำงาน เพราะอาจทำให้ cache และ installed state ไม่ตรงกันมากขึ้น

### กรณี Appshots หาย

1. ตรวจ log สำหรับ `Appshot hotkey inactive` และ `Appshot capture deadline expired`
2. ตรวจว่า Computer Use และ Browser ทำงานแยกกันได้หรือไม่
3. เปิดแอปใหม่หนึ่งครั้งเพื่อให้ native capture bridge ลงทะเบียนใหม่
4. ถ้ายังหายและมี signed desktop build ใหม่ ให้ใช้ Update ในแอป
5. หลัง update ต้องทดสอบจับ Appshot จริงหนึ่งครั้ง การเห็นเมนูอย่างเดียวไม่เพียงพอ

ถ้า timeout เกิดซ้ำบน build ล่าสุด ให้เก็บ log ที่ผ่านการลบข้อมูลอ่อนไหวแล้วส่ง OpenAI Support ปัญหานี้อยู่ที่ capture bridge/hotkey startup ไม่ใช่หลักฐานว่า plugin cache เสีย

## สำรองข้อมูลก่อน reset, uninstall หรือเปลี่ยน profile

ก่อนทำขั้นตอนที่กระทบข้อมูล ให้สำรองอย่างน้อย:

- `%USERPROFILE%\.codex\sessions`
- `%USERPROFILE%\.codex\archived_sessions`
- `%USERPROFILE%\.codex\memories`
- `%USERPROFILE%\.codex\skills`
- SQLite databases ใต้ `%USERPROFILE%\.codex`
- `.codex-global-state.json`, backup ของไฟล์นี้, `session_index.jsonl` และ `config.toml`

ใช้ SQLite backup API หรือวิธี transaction-consistent แล้วรัน `PRAGMA quick_check` กับสำเนา ตรวจจำนวนไฟล์ของ directories ให้ตรงกับต้นทาง

ห้ามนำ `auth.json`, token, cookie database หรือ credential store ขึ้น Git

## สิ่งที่ไม่ควรทำ

- อย่าแก้ `WindowsApps`, `app.asar` หรือ signed assets
- อย่าลบ `.codex`, Local Storage, IndexedDB, cookies หรือ package profile ก่อนมี verified backup และอนุมัติชัดเจน
- อย่า reinstall build เดิมเมื่อ package integrity ปกติ เพราะ renderer code ไม่เปลี่ยน
- อย่าใช้ path ของ staged package จากเครื่องอื่นหรือ version เก่า
- อย่าใช้ `Add-AppxPackage -Register` เป็นขั้นตอนมาตรฐาน Build รุ่นใหม่อาจมี packaged service และคืน `0x80073D28` เพราะต้องใช้ administrator privileges
- อย่ารายงานว่าแก้ถาวรจากการเปิดสำเร็จเพียงครั้งเดียว

## เกณฑ์ตรวจหลังแก้

ตรวจแต่ละข้อแยกกัน:

- `Get-AppxPackage` แสดง version ที่คาดและ `Status=Ok`
- executable signature ถูกต้อง และ package integrity ผ่านถ้ามีการตรวจ block map
- SQLite databases ผ่าน `quick_check`
- sidebar, conversation และ composer แสดงครบ
- Computer Use ทำ read-only smoke test ได้
- Browser เปิด public page ได้
- Appshots จับภาพจริงได้
- Plugins ทั้ง 4 รายการเป็น version เดียวกันและ enabled
- log ไม่มี reconciliation หรือ runtime error ที่ยังเกิดซ้ำหลัง startup เสร็จ

## สรุป root cause

เหตุการณ์ที่พบไม่ได้มาจากสาเหตุเดียว:

| อาการ | Root-cause class ที่มีหลักฐาน | สิ่งที่ยังไม่ทราบ |
| --- | --- | --- |
| UI ว่าง | renderer bootstrap fail-closed ก่อน app shell mount | readiness input ตัวที่ pending |
| Integrations หายหลัง update | desktop bundle, plugin cache และ copied runtime reconcile ไม่พร้อมกัน | เงื่อนไข timing ที่ทำให้เกิดทุกครั้ง |
| Plugins หายชั่วคราวใน startup | marketplace ถูกลดจาก 7 เหลือ 3 ระหว่าง feature state/remote catalog ยังไม่พร้อม แล้วติดตั้งกลับ | เหตุใดระบบจึงถอน plugin แทนที่จะรักษา last-known-good state |
| Appshots หาย | native Windows capture bridge timeout ระหว่างลงทะเบียน hotkey | สาเหตุภายใน bridge ที่ไม่ตอบทัน deadline |
| Update staged แต่ไม่ติดตั้ง | Store queue รอ user action (`BlockedOnUser`) | ไม่เกี่ยวกับ renderer ที่ว่างใน build เดิม |

การแก้ถาวรต้องเกิดในผลิตภัณฑ์ ได้แก่ loading timeout ที่มี error/retry UI, readiness telemetry, atomic plugin reconciliation ที่รักษา last-known-good state และ capture bridge startup ที่ retry ได้

## Prompt สำหรับ Codex เครื่องอื่น

```text
อ่าน README.md นี้ก่อนดำเนินการ เก็บหลักฐาน package, codex doctor, plugin list, runtime path และ desktop log ก่อน restart ห้ามลบหรือ reset .codex, package profile, cache, cookies หรือ auth data ระบุให้ชัดว่าอาการเป็น UI ว่าง, Integrations หาย หรือ Appshots timeout แล้วใช้ขั้นตอนกู้คืนเฉพาะกรณี ตรวจผลทุก integration แยกกัน และบันทึกสิ่งที่ยังพิสูจน์ไม่ได้
```
