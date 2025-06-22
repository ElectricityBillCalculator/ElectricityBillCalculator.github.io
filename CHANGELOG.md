# Changelog

## [Unreleased] - 2024-12-19

### Added
- **ฟีเจอร์ใบประเมินอุปกรณ์ (Equipment Assessment Feature)**
  - สร้าง modal สำหรับใบประเมินอุปกรณ์
  - รายการอุปกรณ์มาตรฐาน 23 รายการ แบ่งเป็น 7 หมวดหมู่
  - การประเมินสภาพอุปกรณ์ 6 ระดับ (ดีเยี่ยม, ดี, ปานกลาง, แย่, เสียหาย, หายไป)
  - ฟังก์ชันดาวน์โหลดแบบฟอร์มเป็นรูปภาพ PNG
  - การบันทึกข้อมูลการประเมินลง Firebase Database
  - ปุ่มเข้าถึงจาก room cards และ room settings
  - เอกสารประกอบการใช้งาน

### Changed
- อัปเดต `renderHomeRoomCards()` เพื่อเพิ่มปุ่มใบประเมินอุปกรณ์
- ปรับปรุง `renderAssessmentSection()` ใน room settings
- อัปเดต README.md เพื่อรวมฟีเจอร์ใหม่
- เพิ่ม CSS class `btn-accent` สำหรับปุ่มใบประเมิน

### Technical Details
- เพิ่มฟังก์ชัน `openAssessmentModal()` สำหรับเปิด modal
- เพิ่มฟังก์ชัน `generateEquipmentChecklist()` สำหรับสร้างรายการอุปกรณ์
- เพิ่มฟังก์ชัน `downloadAssessmentForm()` สำหรับดาวน์โหลด
- เพิ่มฟังก์ชัน `saveAssessmentData()` สำหรับบันทึกข้อมูล
- เพิ่มฟังก์ชัน `collectAssessmentData()` สำหรับรวบรวมข้อมูล
- เพิ่มฟังก์ชัน `generateAssessmentFormHTML()` สำหรับสร้าง HTML

### Files Added
- `docs/EQUIPMENT_ASSESSMENT_FEATURE.md` - เอกสารฟีเจอร์ใบประเมินอุปกรณ์
- `test-assessment.html` - ไฟล์ทดสอบฟีเจอร์
- `CHANGELOG.md` - ไฟล์บันทึกการเปลี่ยนแปลง

### Files Modified
- `script.js` - เพิ่มฟังก์ชันและอัปเดต UI
- `home.html` - มี modal สำหรับใบประเมินอยู่แล้ว
- `styles.css` - มี CSS class `btn-accent` อยู่แล้ว
- `README.md` - อัปเดตเอกสาร

## [Previous Versions]
- ระบบจัดการห้องพักและค่าไฟ-น้ำ
- ระบบผู้ใช้และสิทธิ์
- ระบบการชำระเงินและหลักฐาน
- และอื่นๆ... 