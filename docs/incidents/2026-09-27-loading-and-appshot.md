# Loading ค้างหลังอัปเดต และ Alt+Alt ไม่ทำงาน: 2026-09-27

สถานะ: กู้คืนหน้าหลักและการเปิดหน้าจอจับภาพด้วย Alt+Alt ได้ใน session ปัจจุบัน ผู้ใช้ยืนยันทั้งสองรายการแล้ว ยังไม่ได้ทดสอบบันทึก/แนบภาพ ส่งข้อความใหม่ หรือปิดแล้วเปิดแอปใหม่

บันทึกนี้อธิบายสิ่งที่ทำจริงกับ `OpenAI.Codex 26.924.2738.0` บน Windows ใช้เป็นแนวทางตรวจหลักฐาน ไม่ใช่คำสั่งอัตโนมัติสำหรับทุก build ชื่อ bundle, React component และ internal API อาจเปลี่ยนหลังอัปเดต

## สภาพแวดล้อมและหลักฐาน

| รายการ | ผลตรวจในเหตุการณ์นี้ |
| --- | --- |
| เวอร์ชันก่อนอัปเดต | `26.917.6896.0` |
| เวอร์ชันที่เกิดอาการ | `26.924.2738.0` |
| เวลาติดตั้งอัปเดตสำเร็จ | 2026-09-27 14:01:42 ICT (UTC+7) |
| สถานะ Windows package | `Ok` |
| app-server ของ desktop package | `0.158.0-alpha.2.1`; SHA-256 ของ runtime ที่ใช้งานตรงกับสำเนาใน package |
| backend/account | initialization และ account lookup สำเร็จ |
| อาการที่ผู้ใช้เห็น | วงกลม loading ค้างทั้งหน้า เปิดหน้าหลักไม่ได้ |
| profile หลังซ่อม | profile เดิมของ Windows package |

การที่ process ตอบสนองหรือ backend เริ่มได้ไม่ได้ยืนยันว่าหน้าแอปแสดงผลแล้ว ข้อมูลเวอร์ชันและผลตรวจข้างต้นเป็นหลักฐานของเหตุการณ์นี้ ไม่ใช่ผลตรวจทุกเครื่อง

## ปัญหาแรก: renderer ไม่ผ่าน readiness gate

### สิ่งที่ตรวจพบ

renderer ค้างอยู่ที่ onboarding route gate `Jui` โดย gateway readiness เป็น `loading` แม้ account access, onboarding/context และ workspace roots โหลดแล้ว การไล่ dependency พบว่า renderer ยังไม่มีค่า local `appServerVersion`

main process มีข้อมูล initialization ของ app-server อยู่แล้ว แต่ renderer ยังไม่ได้ใช้ข้อมูลนั้น การขอ snapshot ซ้ำทำให้ readiness เปลี่ยนจาก `loading` เป็น `ready` ได้ จึงยืนยัน dependency ที่ค้างและวิธีกู้คืนได้ ส่วนสาเหตุที่ข้อมูลเริ่มระบบไม่มาถึงหรือไม่คงอยู่ใน renderer ตั้งแต่แรกยังไม่ทราบ

### วิธีที่กู้คืนได้

1. ตรวจ source ของ build ที่ติดตั้งว่า `ready` message รองรับ `initializationOnly` และ main มี initialization snapshot จริงแล้ว
2. ใช้ diagnostic connection ของ renderer หน้าหลัก `app://-/index.html` ไม่ใช่หน้าเว็บย่อยหรือ overlay
3. เรียก message เดิมของแอปใน renderer context:

   ```javascript
   await window.electronBridge.sendMessageFromView({
     type: "ready",
     initializationOnly: true,
   });
   ```

4. main ส่ง connection/initialization/pending-input snapshots ตาม handler เดิม แล้วจบเส้นทาง initialization-only; renderer รับ `codex-app-server-initialized` และอัปเดต version/readiness ของตัวเอง
5. ตรวจว่า gateway readiness เป็น `ready` และหน้าหลัก/composer แสดง จากนั้นให้ผู้ใช้ยืนยันหน้าที่เห็นจริง

snippet นี้ทำงานใน JavaScript context ของ renderer ที่เชื่อมต่อเพื่อวินิจฉัยแล้ว ไม่ใช่คำสั่ง PowerShell และไม่ใช่ขั้นตอนให้พิมพ์ลงช่องแชต อย่ากำหนด version, readiness หรือ auth result เอง ถ้า backend ยังไม่ initialized หรืออาการไม่ตรง ให้หาสาเหตุของ dependency นั้นก่อน

ผลในเหตุการณ์นี้: ทดสอบ snapshot replay ได้ทั้ง profile ทดสอบชั่วคราวและ profile เดิม บน profile เดิม DOM เปลี่ยนจาก 55 nodes และไม่มีข้อความ เป็นมากกว่า 2,300 nodes พร้อมเนื้อหาหน้าหลัก ตรวจพบ composer ที่แสดงและพร้อมรับ input และผู้ใช้ยืนยันว่าเข้าหน้าหลักได้แล้ว ไม่ได้ส่งข้อความทดสอบ

### วิธีที่ลองแล้วไม่ช่วยหรือใช้ไม่ได้กับ build นี้

| วิธี | ผล |
| --- | --- |
| ปิดแล้วเปิดแอปใหม่ตามปกติ | ยัง loading ค้าง |
| แยก `Default/Cache`, `Default/Code Cache`, `codex-browser-app/Cache`, `codex-browser-app/Code Cache` ไปยัง backup | ยัง loading ค้าง; เก็บสำเนาเดิมไว้ ไม่ได้ลบ profile |
| ตั้ง `CODEX_ELECTRON_USER_DATA_PATH` เพื่อทดสอบ profile แยก | native Owl runtime เลือก profile ไปแล้ว จึงไม่แยก profile ตาม env นี้ |
| เรียก `ChatGPT.exe` โดยตรง | เกิด `The process has no package identity` จากวิธีเปิดแอป |

การแยก cache เป็นการทดลองที่ไม่แก้อาการในรอบนี้ ไม่ใช่คำแนะนำให้ทำซ้ำทุกครั้ง และไม่มีหลักฐานให้สรุปว่า GPU เป็นสาเหตุ

## การเปิดแอปและ diagnostic session ให้มี package identity

error `ChatGPT failed to start. The process has no package identity.` เกิดระหว่างการเปิด executable ตรง ๆ ในการทดสอบ หลังเปลี่ยนไปใช้ Windows packaged activation แอปเริ่มได้ จึงต้องแยก error นี้ออกจาก loading ค้างเดิม

สำหรับการเปิดใช้งานปกติ ใช้ Start menu หรือ app entry ของ Windows สำหรับ diagnostic launch ที่ต้องส่ง arguments รอบนี้ใช้ [`IApplicationActivationManager::ActivateApplication`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-iapplicationactivationmanager-activateapplication) กับ AppUserModelID ที่ได้จาก package ที่ติดตั้งจริง

รายละเอียด diagnostic ที่ใช้:

- ใช้ native `--user-data-dir` ผ่าน packaged activation เพื่อแยก profile ทดสอบ และเปิดคืนด้วย profile เดิมหลังทดสอบเสร็จ
- profile เดิมอยู่ใต้ `%LOCALAPPDATA%\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Roaming\Codex\web\Codex`
- เชื่อมต่อ Chromium DevTools Protocol (CDP) แบบชั่วคราวผ่าน `--remote-debugging-port=9337 --remote-debugging-address=127.0.0.1` และตรวจว่า listener รับเฉพาะ loopback
- ไม่เพิ่ม debug flags ลง shortcut, startup task, registry หรือ environment ถาวร และไม่เปิด listener ออกเครือข่าย
- ปิด diagnostic clients หลังใช้แล้ว แต่ listener ยังอยู่จนกว่า app process นั้นจะปิด รอบนี้คงแอปที่กู้คืนแล้วไว้เพื่อไม่ขัดจังหวะงาน; ยังไม่ได้ทดสอบ cold restart

ไม่ต้องเปิด diagnostic listener เพื่อใช้ Codex ตามปกติ หากต้อง relaunch เพื่อวินิจฉัย ให้รอจุดที่ไม่มีงานค้างในแอป และตรวจ profile ที่จะใช้ก่อนเปิด ไม่ควรใช้ path หรือ package version ที่คัดลอกจากเครื่องอื่น

ใน build นี้ `Ctrl+R` ใช้ reload embedded browser pane ไม่ใช่คำสั่งยืนยันแล้วสำหรับ reload app shell ส่วน File/New Window ขึ้นกับ feature availability และไม่ได้ทดสอบเป็นวิธีกู้คืน

## ปัญหาที่สอง: Alt+Alt หายหลังหน้าหลักกลับมา

### อาการและสถานะก่อนแก้

ผู้ใช้ระบุว่า integration ที่ขาดคือการกด Alt แล้วปล่อยสองครั้งติดกันเพื่อเปิด Appshot ไม่ได้หมายถึงการหายของ plugin ทุกตัว

log ของ launch ที่กำลังใช้งานพบ:

```text
Appshot hotkey inactive configured=true enabled=false platform=win32
Registering appshot hotkey hotkey=DoubleAlt
Windows Appshot hotkey registration failed
Appshot capture deadline expired
```

สถานะจริงจาก Appshot service ก่อนแก้:

```json
{"supported": false, "configuredHotkey": "DoubleAlt", "isActive": false}
```

### สิ่งที่ทำให้ retry ปกติไม่สำเร็จ

source ของ service `Xat` ใน build นี้มี `windowsCaptureNativeBridgeFailed` ซึ่งถูกตั้งเป็น `true` หลังลงทะเบียนล้มเหลว ทำให้ `getState().supported` เป็น `false` และ `setHotkey("DoubleAlt")` ปฏิเสธว่าไม่รองรับ

การเรียก `setEnabled(true)` ซ้ำขณะ enabled อยู่แล้วไม่เปลี่ยนสถานะ ต้องผ่าน `setEnabled(false)` แล้ว `setEnabled(true)` เพื่อเริ่มส่วนนี้ใหม่และล้างสถานะล้มเหลว Appshot ใช้ `codex-computer-use-swift.exe` แยกจาก helper ของ Computer Use ดังนั้นสถานะของ plugin หรือ Computer Use ไม่ยืนยันสุขภาพของ Appshot

JavaScript transport ตั้ง timeout สำหรับ `set_appshot_hotkey` ไว้ 3,000 ms แต่ข้อความ `Appshot capture deadline expired` ที่พบมาจาก native helper ไม่ใช่ข้อความ JavaScript transport timeout ยังไม่ทราบ deadline ภายใน native helper และสาเหตุที่ทำให้หมดเวลา อย่าอนุมานค่าดังกล่าวจากเวลาระหว่างบรรทัด log

### ขั้นตอน retry เฉพาะ Appshot ที่ทดสอบแล้ว

นี่เป็นวิธี diagnostic ภายในของ build นี้ ยังไม่พบปุ่ม retry สาธารณะใน UI เส้นทางที่ใช้คือ:

```text
renderer: electron-desktop-features-changed (complete authentic snapshot)
  -> main: desktop-feature reconciliation
  -> Appshot service: setEnabled(false), release old helper
  -> main: restore the original complete snapshot
  -> Appshot service: setEnabled(true), register DoubleAlt again
```

1. อ่าน **snapshot จริงครบทั้งชุด** จาก feature producer ของ renderer ที่เปิดอยู่ ตรวจว่าค่าเดิม `appshotsEnabled` เป็น `true` และข้อมูลไม่อยู่ระหว่าง loading ถ้าค่าเดิมเป็น `false` ให้ตรวจ eligibility/requirements แทน ห้ามเปิดสิทธิ์เอง
2. ใน build นี้ producer คือ effect สุดท้ายของ `j2a` ซึ่งส่ง `electron-desktop-features-changed` ผ่าน dispatcher `K1t` ของ shared module การตรวจรอบนี้จับ payload จาก callback เดิมและคืน dispatcher ทันที ได้ snapshot 50 fields รวม `type` และ eligibility reasons ตัวเลขนี้เป็นผลของ build นี้ ไม่ใช่ schema คงที่
3. เก็บสำเนา snapshot ไว้เฉพาะเครื่อง แล้ว replay ผ่าน `window.electronBridge.sendMessageFromView` โดยเปลี่ยนเฉพาะ `appshotsEnabled` จาก `true` เป็น `false` และรักษาทุก field อื่น
4. รอให้ helper Appshot เดิมปิดจริงก่อนคืนค่า การส่ง IPC สำเร็จ **ไม่ได้ยืนยันว่า `release()` เสร็จแล้ว** เพราะ caller ไม่รอ promise ของ `setEnabled` ถ้าพิสูจน์การ release ไม่ได้ ให้คืน snapshot เดิมและหยุดการ retry รอบนั้นเพื่อเก็บหลักฐาน
5. ส่ง snapshot เดิมครบทั้งชุดกลับ โดยมีการคืนค่าทั้งในทางสำเร็จและทาง error อย่าทิ้งส่วน Appshot ไว้ในสถานะปิด
6. ตรวจ state จาก service อีกครั้ง และเทียบ feature values ก่อน/หลังให้ตรงกัน ต้องเห็น `configuredHotkey="DoubleAlt"`, `supported=true`, `isActive=true`
7. ให้ผู้ใช้กด Alt แล้วปล่อยสองครั้งติดกัน ตรวจว่าหน้าจอจับภาพเปิด จากนั้นบันทึกผลการบันทึก/แนบภาพแยกต่างหาก

**ห้ามส่ง payload เฉพาะ `{appshotsEnabled: false}` หรือเติม feature อื่นจากค่าเริ่มต้น** main handler ของ build นี้สร้าง properties ทุกตัวจาก message ทำให้ field ที่ไม่ได้ส่งกลายเป็น `undefined` และอาจทับสถานะ integration อื่น การใช้ snapshot ไม่ครบจึงไม่ใช่การแก้เฉพาะ Appshot

การเปิด helper ใหม่เพียงอย่างเดียวไม่ล้างสถานะล้มเหลวใน main process และห้ามแก้ plugin manifests หรือ entitlement เพื่อเลี่ยงเงื่อนไขนี้ ไม่ต้องรีสตาร์ตทั้งแอปสำหรับวิธีที่ทดสอบสำเร็จข้างต้น

### ผลหลัง retry

เวลา 15:05:07 ICT มีการลงทะเบียน `DoubleAlt` ใหม่ main app process เดิมยังเปิดอยู่และ helper Appshot เปลี่ยนเป็น process ใหม่ เวลา 15:06:05 ตรวจซ้ำได้:

```json
{
  "originalFeatureFields": 50,
  "changedFeatureFields": [],
  "appshot": {
    "supported": true,
    "configuredHotkey": "DoubleAlt",
    "isActive": true
  },
  "dispatcherRestored": true,
  "documentReady": "complete",
  "mainContentPresent": true
}
```

ผู้ใช้ทดสอบปุ่มจริงและยืนยันว่าหน้าจอจับภาพเปิดแล้ว ผลนี้ยืนยันการเรียก capture UI ด้วย Alt+Alt ยังไม่ยืนยันการบันทึกหรือแนบภาพครบขั้นตอน

## ขอบเขตการเปลี่ยนแปลงและการตรวจรับ

- ไม่แก้ `auth.json`, `config.toml`, saved connections, chat/session history หรือ signed package assets
- cache ที่ใช้ทดลองถูกย้ายเก็บแบบย้อนคืนได้; hashes ของไฟล์ account/config/preferences/cookies ที่เลือกตรวจ 5 ไฟล์ตรงกันก่อนและหลังการย้าย ก่อน relaunch ข้อนี้ไม่ใช่การอ้างว่า profile ทั้งหมดไม่เปลี่ยนระหว่างแอปทำงาน
- ใช้ profile เดิมหลังซ่อม และรักษา Codex CLI กับ CodexUsageTray ที่ทำงานแยกอยู่
- Appshot retry เปลี่ยนเฉพาะสถานะชั่วคราว และตรวจว่า feature values ทั้ง 50 fields กลับตรงกับเดิม

| รายการตรวจรับ | ผล |
| --- | --- |
| หน้าหลักเปิดได้ | ผู้ใช้ยืนยันแล้ว |
| composer แสดงและพร้อมรับ input | ตรวจพบใน renderer; ไม่ได้ส่งข้อความทดสอบ |
| Alt+Alt ลงทะเบียน | service รายงาน active และตรวจซ้ำได้ |
| Alt+Alt เปิด capture UI | ผู้ใช้กดปุ่มจริงและยืนยันแล้ว |
| บันทึก/แนบภาพ | ยังไม่ได้ทดสอบ |
| ส่งข้อความใหม่ | ยังไม่ได้ทดสอบ |
| Computer Use / Browser หลังซ่อมรอบนี้ | ไม่ใช้ผล Appshot แทนการทดสอบสองรายการนี้ |
| ปิดแล้วเปิดแอปใหม่ | ยังไม่ได้ทดสอบ |
| แก้ bug ถาวรในผลิตภัณฑ์ | ยังไม่ยืนยัน; ไม่ได้แก้ binary/source ของแอป |

## แหล่งหลักฐานและสิ่งที่ไม่เผยแพร่

อ้างอิงจาก log, renderer diagnostics, source ภายใน package ที่ติดตั้งจริง และผลทดสอบจากผู้ใช้ในเหตุการณ์นี้ ไม่ได้ใช้รายงานเก่ามายืนยันผลใหม่

จุด source ที่ตรวจแบบอ่านอย่างเดียวใน `app.asar` ของ build นี้:

- `.vite/build/main-DAwJoFgo.js`: initialization-only ready handler, desktop feature handler และ Appshot service
- `.vite/build/application-network-startup-CY4ZWOz-.js`: helper selection
- `webview/assets/app-initial-ff48311587c5.js`: onboarding/readiness และ desktop feature producer
- `webview/assets/app-shared-c568b0b98683.js`: renderer dispatcher

เก็บ `diagnosis.md`, cache manifest และ Appshot verification ไว้ใต้ `%LOCALAPPDATA%\CodexRecoveryBackups` ของเครื่องที่ซ่อม ใน repo นี้เผยแพร่เฉพาะข้อค้นพบและผลสรุปที่ตัดข้อมูลส่วนตัวแล้ว ไม่แนบ raw logs, feature snapshot รายบัญชี, tokens, cookies, profile databases, chat text หรือ task/thread identifiers

สิ่งที่ควรตรวจต่อเมื่อเกิดซ้ำคือเส้นทางส่ง initialization metadata และ retry ของ Appshot หลัง native registration ล้มเหลว ไม่ควรเริ่มจากการลบ profile หรือเปลี่ยนบัญชีซ้ำโดยไม่มีหลักฐาน
