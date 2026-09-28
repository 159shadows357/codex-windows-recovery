# Desktop setup และ CLI daemon หลังอัปเดต: 28 กันยายน 2026

เวลาที่ระบุเป็น ICT (UTC+7) เหตุการณ์นี้ต่อจาก [loading เกิดซ้ำ 27 ก.ย.](2026-09-27-loading-recurrence.md) ใช้ Desktop `OpenAI.Codex 26.924.2738.0`, Desktop app-server `0.158.0-alpha.2.1` และ CLI `0.157.1` บน Windows เครื่องเดียวกัน

## ผลล่าสุดบนเครื่อง

- ผู้ใช้ยืนยันว่า Desktop ส่งข้อความและได้รับคำตอบหลังคืน `sandbox_mode = "danger-full-access"` และไม่มี Windows setup banner กลับมา
- `codex app-server daemon version` รายงาน `running` โดย CLI/app-server/managed binary เป็น `0.157.1`
- ผู้ใช้ยืนยันว่าเปิด `codex` ใน terminal ใหม่ได้โดยไม่ใช้ `--no-daemon`
- ตัวเปิด Desktop ยังเป็นวิธีที่ใช้กู้ loading ในรอบนี้ ยังไม่มีหลักฐานว่า shortcut ปกติเปิดได้ถาวรหลัง cold launch

## Timeline ของเหตุการณ์

| ลำดับ | สิ่งที่พบหรือทำ | ผล |
| --- | --- | --- |
| 1 | ถอนและติดตั้ง Desktop build `26.924.2738.0` ใหม่ หลังเปิดตามปกติยังหมุนค้าง | reinstall build เดิมไม่แก้อาการ loading |
| 2 | เปิดด้วย [ตัวกู้คืน](../../Start-Codex-Recovery.cmd) ซึ่งตรวจ package/process และขอ initialization snapshot จริง | หน้าหลักและ Integrations โหลดได้; ตัวเปิดรายงาน `recovered`, replay 1 ครั้ง และ Appshot `active` |
| 3 | ส่งข้อความจาก Desktop | พบ `Unable to send message`, `Update Agent sandbox to continue` และ `Windows setup didn't finish / Setup stopped` |
| 4 | ตรวจ log และ config เวลาประมาณ 09:45 | `windowsSandbox/setupCompleted` ตอบ `only managed permission profiles can be enforced by the Windows sandbox` ขณะ `sandbox_mode` เป็น `danger-full-access` |
| 5 | สำรอง config แล้วเปลี่ยนเฉพาะ `sandbox_mode` เป็น `workspace-write` ชั่วคราว จากนั้นเปิดด้วยตัวกู้คืนและกด setup | UI แจ้ง `Windows setup is complete`; sandbox log บันทึก setup/ACL run เสร็จโดย `errors=[]`; ผู้ใช้ส่งข้อความและได้รับคำตอบ |
| 6 | Quit Desktop คืนเฉพาะ `sandbox_mode` เป็น `danger-full-access` โดยรักษาค่าที่แอปเขียนระหว่าง setup แล้ว cold launch ผ่านตัวกู้คืน | ผู้ใช้ส่งข้อความและได้รับคำตอบอีกครั้ง ไม่มี setup banner |
| 7 | ทดสอบ `codex app-server daemon start` จาก CLI `0.157.1` | installer ขึ้น `Access is denied. (os error 5)`; ไม่มี release ใหม่หลังการล้มเหลว |
| 8 | เก็บ Windows File I/O trace ระหว่างทำซ้ำเวลาประมาณ 10:09 | staged `codex.exe --version` ถูกเรียกจริง; trace พบ `STATUS_ACCESS_DENIED` สอง event ขณะโปรเซสนี้เปิดโฟลเดอร์ `app-server-daemon\releases` |
| 9 | ทดสอบคัดลอกแพ็กเกจเต็ม, รัน `--version` แบบ redirected/hidden และ rename ภายใต้ `releases` | ผ่านทั้งหมด รวมการ rename ไปชื่อ release จริง จึงไม่พบการปฏิเสธ ACL แบบทั่วไปในขั้นตอนจำลอง |
| 10 | กู้ daemon release จาก standalone package เดิม ตรวจ SHA256 ตรงกันครบ 45 ไฟล์ สร้าง `current` junction และสั่ง start | daemon `running`; ผู้ใช้เปิด `codex` ปกติได้ |

## ข้อสรุปที่ยืนยันได้

### Desktop loading

บน build นี้ การขอ initialization snapshot จริงซ้ำทำให้ renderer ผ่าน readiness gate และแสดง composer ได้ตาม incident 27 ก.ย. การติดตั้ง build เดิมใหม่ยังค้าง และตัวกู้คืนยังจำเป็นในรอบที่ตรวจ จึงยังไม่ใช่ product fix สาเหตุที่ event ไม่มาถึงหรือไม่คงอยู่ใน renderer ระหว่าง startup ยังไม่มี timing trace ยืนยัน

### Windows sandbox setup

ข้อความ error ตรงกับ config `danger-full-access` ซึ่งไม่เป็น managed permission profile ที่ Windows sandbox setup บังคับใช้ได้ใน core build นี้ การเปลี่ยน `sandbox_mode` ชั่วคราวเป็น `workspace-write` ทำให้ setup ผ่าน แล้วคืนค่าเดิมก่อนทดสอบส่งข้อความอีกครั้ง [โค้ดเงื่อนไขของ Windows sandbox](https://github.com/openai/codex/blob/0d9c7cbfa6cf1489f55a8a9542b75ddd2c061807/codex-rs/windows-sandbox-rs/src/resolved_permissions.rs#L63-L80)

ผลนี้ยืนยันสาเหตุของ setup error รอบที่จับ log ได้ ไม่ยืนยันว่า config เดียวกันเป็นสาเหตุของ loading ตั้งแต่เริ่มต้น หรือเป็นสาเหตุของ CLI daemon install

### CLI daemon installer

ตัวติดตั้ง `0.157.1` สร้าง staging package, ตรวจเนื้อหา, เรียก staged executable เพื่ออ่าน version แล้วจึง rename เป็น release [โค้ดตัวติดตั้ง](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/app-server-daemon/src/prepare_install.rs#L217-L260) Trace จับการเรียก staged `codex.exe --version` และ File I/O completion ที่คืน `STATUS_ACCESS_DENIED` สำหรับโฟลเดอร์ `releases` ได้ [รูปแบบ File I/O completion](https://learn.microsoft.com/en-us/windows/win32/etw/fileio-opend)

ยังไม่พิสูจน์ว่า event สองรายการนั้นเป็น syscall ที่ parent ส่ง error กลับ หรือ filter/นโยบายใดเป็นผู้ปฏิเสธ การคัดลอกและ rename แบบจำลองผ่านด้วย token ปกติ จึงไม่สรุปว่า owner ACL, Defender หรือ security product ตัวใดเป็นต้นเหตุ

## การแก้และการตรวจรับ

| รายการ | ผล |
| --- | --- |
| `config.toml` | สำรองก่อนทดสอบ; คืน `sandbox_mode` เดิมแล้ว; รักษาค่าที่แอปเขียนใหม่ระหว่าง setup |
| Desktop main/Integrations | ผู้ใช้เห็นว่ากลับมา |
| ส่งข้อความจาก Desktop หลัง setup และหลังคืน config | ผู้ใช้ยืนยันทั้งสองรอบ |
| Windows setup banner หลังคืน config | ผู้ใช้ยืนยันว่าไม่กลับมา |
| Appshot หลังเปิดครั้งล่าสุด | ตัวเปิดรายงาน `active`; ผู้ใช้ยังไม่ได้ทดสอบ Alt+Alt รอบนี้ |
| CLI daemon package | ตรวจ SHA256 ครบ 45 ไฟล์กับ standalone source; `current` เป็น junction ไป release `0.157.1` |
| CLI daemon | `version` รายงาน `running` และ CLI/app-server เป็น `0.157.1` |
| เปิด `codex` แบบปกติ | ผู้ใช้ยืนยันว่าใช้งานได้ |
| repo | ไม่มีการแก้สคริปต์กู้ Desktop ในเหตุการณ์นี้ |

## ข้อจำกัดและการตรวจเมื่ออัปเดตครั้งหน้า

- ตัวเปิด Desktop ตรวจ version `26.924.2738.0` โดยตรง ถ้า Desktop เปลี่ยน build ให้เก็บหลักฐานใหม่ก่อนแก้ version gate
- daemon ที่กู้แบบ manual เลือก release `0.157.1` และไม่ได้ตั้ง auto-update marker ของ daemon เมื่อ CLI เปลี่ยน version ต้องตรวจความเข้ากันได้และสถานะ daemon อีกครั้ง
- เก็บ ETL สองชุดไว้เฉพาะเครื่อง ไม่ commit ใน Git ชุด File I/O มี dropped events จึงใช้ยืนยันได้เฉพาะ event ที่พบ ชุด Minifilter ไม่มีคำเตือน dropped events แต่ยังไม่ได้วิเคราะห์ครบพอระบุ filter ที่ปฏิเสธ
- หลังอัปเดตใหม่ ให้บันทึก package/CLI version, เวลาและอาการ, startup/setup log, `codex app-server daemon version`, ผลส่งข้อความ, Alt+Alt และ cold launch แยกกัน ก่อนใช้ workaround
- raw ETL และ log อาจมี path หรือข้อมูลส่วนตัว ต้องคัดกรองก่อนส่งให้บุคคลภายนอก

มีอย่างน้อยสามเส้นทางที่ต้องแก้ต่างกัน: renderer readiness, Windows sandbox setup และ CLI daemon install การกลับมาใช้งานได้ในวันที่ 28 ก.ย. เป็นการกู้สถานะเครื่อง โดยข้อบกพร่องของการเปิด Desktop และ auto installer ยังต้องตรวจในผลิตภัณฑ์
