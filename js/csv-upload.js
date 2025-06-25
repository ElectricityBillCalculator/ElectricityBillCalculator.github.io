/*
    CSV Upload functionality for the Electricity Bill Calculator
*/

import { saveToFirebase } from './firebase-data.js';
import { renderHomeRoomCards } from './ui-rendering.js';
import { openModal, closeModal } from './modal-controls.js';

/**
 * Setup CSV upload functionality
 */
export function setupCSVUpload() {
    const uploadBtn = document.getElementById('btn-upload-csv');
    const modal = document.getElementById('csv-upload-modal');
    const closeBtn = document.getElementById('close-csv-modal');
    const cancelBtn = document.getElementById('cancel-csv-upload');
    const dropzone = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    const downloadTemplateBtn = document.getElementById('download-csv-template');
    const processBtn = document.getElementById('process-csv-upload');
    
    let csvData = null;
    let csvHeaders = null;

    // Open modal
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            openModal('csv-upload-modal');
        });
    }

    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal('csv-upload-modal');
            resetCSVUpload();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeModal('csv-upload-modal');
            resetCSVUpload();
        });
    }

    // Download template
    if (downloadTemplateBtn) {
        downloadTemplateBtn.addEventListener('click', downloadCSVTemplate);
    }

    // File input change
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Dropzone events
    if (dropzone) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', handleDragOver);
        dropzone.addEventListener('drop', handleDrop);
        dropzone.addEventListener('dragleave', handleDragLeave);
    }

    // Process upload
    if (processBtn) {
        processBtn.addEventListener('click', processCSVUpload);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('border-blue-400', 'bg-blue-400/10');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('border-blue-400', 'bg-blue-400/10');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('border-blue-400', 'bg-blue-400/10');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                fileInput.files = files;
                handleFileSelect();
            } else {
                showAlert('กรุณาเลือกไฟล์ CSV เท่านั้น', 'error');
            }
        }
    }

    function handleFileSelect() {
        const file = fileInput.files[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            showAlert('กรุณาเลือกไฟล์ CSV เท่านั้น', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const csvText = e.target.result;
                const result = parseCSV(csvText);
                
                if (result.success) {
                    csvData = result.data;
                    csvHeaders = result.headers;
                    showCSVPreview();
                    processBtn.disabled = false;
                } else {
                    showAlert('ไม่สามารถอ่านไฟล์ CSV ได้: ' + result.error, 'error');
                }
            } catch (error) {
                showAlert('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + error.message, 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    function parseCSV(csvText) {
        try {
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) {
                return { success: false, error: 'ไฟล์ CSV ต้องมีข้อมูลอย่างน้อย 2 บรรทัด (หัวข้อและข้อมูล)' };
            }

            const headers = lines[0].split(',').map(h => h.trim());
            const requiredHeaders = ['room', 'name', 'date', 'current', 'previous', 'rate'];
            
            // Check required headers
            for (const required of requiredHeaders) {
                if (!headers.includes(required)) {
                    return { success: false, error: `ไม่พบคอลัมน์ที่จำเป็น: ${required}` };
                }
            }

            const data = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length !== headers.length) {
                    return { success: false, error: `บรรทัดที่ ${i + 1} มีจำนวนคอลัมน์ไม่ตรงกับหัวข้อ` };
                }

                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                data.push(row);
            }

            return { success: true, headers, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    function showCSVPreview() {
        const previewSection = document.getElementById('csv-preview-section');
        const previewDiv = document.getElementById('csv-preview');
        const validationDiv = document.getElementById('csv-validation');

        if (!previewSection || !previewDiv || !validationDiv) return;

        previewSection.classList.remove('hidden');

        // Create preview table
        let previewHTML = '<div class="overflow-x-auto"><table class="w-full text-xs">';
        
        // Headers
        previewHTML += '<thead class="bg-slate-700"><tr>';
        csvHeaders.forEach(header => {
            previewHTML += `<th class="px-2 py-1 text-left">${header}</th>`;
        });
        previewHTML += '</tr></thead>';

        // Data (show first 5 rows)
        previewHTML += '<tbody class="divide-y divide-slate-600">';
        csvData.slice(0, 5).forEach(row => {
            previewHTML += '<tr>';
            csvHeaders.forEach(header => {
                previewHTML += `<td class="px-2 py-1">${row[header] || ''}</td>`;
            });
            previewHTML += '</tr>';
        });
        previewHTML += '</tbody></table></div>';

        if (csvData.length > 5) {
            previewHTML += `<p class="text-slate-400 text-xs mt-2">แสดง 5 แถวแรกจากทั้งหมด ${csvData.length} แถว</p>`;
        }

        previewDiv.innerHTML = previewHTML;

        // Validation
        const validation = validateCSVData();
        let validationHTML = '';
        
        if (validation.errors.length > 0) {
            validationHTML += '<div class="text-red-400 mb-2"><strong>พบข้อผิดพลาด:</strong></div>';
            validation.errors.forEach(error => {
                validationHTML += `<div class="text-red-400 text-xs">• ${error}</div>`;
            });
        }

        if (validation.warnings.length > 0) {
            validationHTML += '<div class="text-yellow-400 mb-2 mt-3"><strong>คำเตือน:</strong></div>';
            validation.warnings.forEach(warning => {
                validationHTML += `<div class="text-yellow-400 text-xs">• ${warning}</div>`;
            });
        }

        if (validation.errors.length === 0 && validation.warnings.length === 0) {
            validationHTML = '<div class="text-green-400 text-xs">✓ ข้อมูลถูกต้อง สามารถอัพโหลดได้</div>';
        }

        validationDiv.innerHTML = validationHTML;
    }

    function validateCSVData() {
        const errors = [];
        const warnings = [];

        csvData.forEach((row, index) => {
            const rowNum = index + 2; // +2 because index starts at 0 and we skip header

            // Required fields validation
            if (!row.room || row.room.trim() === '') {
                errors.push(`แถวที่ ${rowNum}: ไม่มีเลขห้อง`);
            }

            if (!row.name || row.name.trim() === '') {
                errors.push(`แถวที่ ${rowNum}: ไม่มีชื่อผู้เช่า`);
            }

            if (!row.date || row.date.trim() === '') {
                errors.push(`แถวที่ ${rowNum}: ไม่มีวันที่`);
            }

            // Number validation
            const current = parseFloat(row.current);
            const previous = parseFloat(row.previous);
            const rate = parseFloat(row.rate);

            if (isNaN(current) || current < 0) {
                errors.push(`แถวที่ ${rowNum}: มิเตอร์ไฟปัจจุบันไม่ถูกต้อง`);
            }

            if (isNaN(previous) || previous < 0) {
                errors.push(`แถวที่ ${rowNum}: มิเตอร์ไฟก่อนหน้าไม่ถูกต้อง`);
            }

            if (isNaN(rate) || rate <= 0) {
                errors.push(`แถวที่ ${rowNum}: อัตราค่าไฟไม่ถูกต้อง`);
            }

            if (current < previous) {
                errors.push(`แถวที่ ${rowNum}: มิเตอร์ไฟปัจจุบันน้อยกว่าก่อนหน้า`);
            }

            // Water validation (optional)
            if (row.waterCurrent && row.waterPrevious) {
                const waterCurrent = parseFloat(row.waterCurrent);
                const waterPrevious = parseFloat(row.waterPrevious);
                const waterRate = parseFloat(row.waterRate);

                if (isNaN(waterCurrent) || waterCurrent < 0) {
                    warnings.push(`แถวที่ ${rowNum}: มิเตอร์น้ำปัจจุบันไม่ถูกต้อง`);
                }

                if (isNaN(waterPrevious) || waterPrevious < 0) {
                    warnings.push(`แถวที่ ${rowNum}: มิเตอร์น้ำก่อนหน้าไม่ถูกต้อง`);
                }

                if (waterCurrent < waterPrevious) {
                    warnings.push(`แถวที่ ${rowNum}: มิเตอร์น้ำปัจจุบันน้อยกว่าก่อนหน้า`);
                }

                if (waterRate && (isNaN(waterRate) || waterRate <= 0)) {
                    warnings.push(`แถวที่ ${rowNum}: อัตราค่าน้ำไม่ถูกต้อง`);
                }
            }

            // Date format validation
            if (row.date && !isValidDateFormat(row.date)) {
                warnings.push(`แถวที่ ${rowNum}: รูปแบบวันที่ไม่ถูกต้อง (ควรเป็น DD/MM/YYYY)`);
            }

            if (row.dueDate && !isValidDateFormat(row.dueDate)) {
                warnings.push(`แถวที่ ${rowNum}: รูปแบบวันครบกำหนดไม่ถูกต้อง (ควรเป็น DD/MM/YYYY)`);
            }
        });

        return { errors, warnings };
    }

    function isValidDateFormat(dateStr) {
        const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
        if (!dateRegex.test(dateStr)) return false;
        
        const parts = dateStr.split('/');
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
    }

    function downloadCSVTemplate() {
        const csvContent = `room,name,date,current,previous,rate,dueDate,waterCurrent,waterPrevious,waterRate,rent,size
101,สมชาย ใจดี,25/12/2024,12345,12000,4.5,31/12/2024,1234,1200,15.5,5000,30 ตร.ม.
102,สมหญิง รักดี,25/12/2024,15678,15000,4.5,31/12/2024,1567,1500,15.5,5500,35 ตร.ม.
103,สมศักดิ์ มั่นคง,25/12/2024,18901,18000,4.5,31/12/2024,1890,1800,15.5,6000,40 ตร.ม.
104,สมปอง สุขใจ,25/12/2024,22134,21000,4.5,31/12/2024,2213,2100,15.5,6500,45 ตร.ม.
105,สมพร ดีงาม,25/12/2024,25367,24000,4.5,31/12/2024,2536,2400,15.5,7000,50 ตร.ม.`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'rooms_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function processCSVUpload() {
        if (!csvData || csvData.length === 0) {
            showAlert('ไม่มีข้อมูลที่จะอัพโหลด', 'error');
            return;
        }

        const validation = validateCSVData();
        if (validation.errors.length > 0) {
            showAlert('กรุณาแก้ไขข้อผิดพลาดก่อนอัพโหลด', 'error');
            return;
        }

        const processBtn = document.getElementById('process-csv-upload');
        const originalText = processBtn.innerHTML;
        processBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังอัพโหลด...';
        processBtn.disabled = true;
        

        try {
            let successCount = 0;
            let errorCount = 0;
            let errorMessages = [];

            for (let i = 0; i < csvData.length; i++) {
                const row = csvData[i];
                console.log(`Processing row ${i + 1}:`, row);
                try {
                    const billData = {
                        room: row.room.trim(),
                        name: row.name.trim(),
                        date: row.date.trim(),
                        current: parseFloat(row.current),
                        previous: parseFloat(row.previous),
                        units: parseFloat(row.current) - parseFloat(row.previous),
                        rate: parseFloat(row.rate),
                        total: (parseFloat(row.current) - parseFloat(row.previous)) * parseFloat(row.rate),
                        timestamp: Date.now()
                    };
                    let usrData = window.currentUserData;
                    

                    const newRoomData = {
                        rent: row.rent ? row.rent.trim() : '',
                        roomSize: row.size ? row.size.trim() : '',
                        tenantName: row.name.trim(),
                        status: 'occupied',
                        createdAt: new Date().toISOString(),
                        createdBy: window.auth?.currentUser?.uid || 'unknown',
                        addons: [],
                        assessmentFormUrl: ''
                    };

                    // Update user's managed rooms if they're not admin
                    if (window.currentUserRole !== 'admin' && usrData && Array.isArray(usrData.managedRooms)) {
                        if (!usrData.managedRooms.includes(row.room.trim())) {
                            usrData.managedRooms.push(row.room.trim());
                            await window.db.ref(`users/${window.auth?.currentUser?.uid}`).update({
                                managedRooms: usrData.managedRooms
                            });
                        }
                    }

                    console.log(`New room data for ${row.room.trim()}:`, newRoomData);

                    const roomRef = window.db.ref(`rooms/${row.room.trim()}`);
                    await roomRef.set(newRoomData);

                    // Optional fields
                    if (row.dueDate && row.dueDate.trim()) {
                        billData.dueDate = row.dueDate.trim();
                    }

                    if (row.rent && !isNaN(parseFloat(row.rent))) {
                        billData.rent = parseFloat(row.rent);
                    }

                    if (row.size && row.size.trim()) {
                        billData.size = row.size.trim();
                    }

                    // Water data
                    if (row.waterCurrent && row.waterPrevious && row.waterRate) {
                        const waterCurrent = parseFloat(row.waterCurrent);
                        const waterPrevious = parseFloat(row.waterPrevious);
                        const waterRate = parseFloat(row.waterRate);

                        if (!isNaN(waterCurrent) && !isNaN(waterPrevious) && !isNaN(waterRate) && waterCurrent >= waterPrevious) {
                            billData.waterCurrent = waterCurrent;
                            billData.waterPrevious = waterPrevious;
                            billData.waterUnits = waterCurrent - waterPrevious;
                            billData.waterRate = waterRate;
                            billData.waterTotal = (waterCurrent - waterPrevious) * waterRate;
                        }
                    }

                    // Add building code if user is admin
                    const userData = window.currentUserData;
                    if (window.currentUserRole === 'admin' && userData && userData.buildingCode) {
                        billData.buildingCode = userData.buildingCode;
                    }

                    // Get addons from room and add to billData before save
                    try {
                        const roomAddonsSnap = await window.db.ref(`rooms/${billData.room}/addons`).once('value');
                        const roomAddons = roomAddonsSnap.val();
                        billData.addons = Array.isArray(roomAddons) ? roomAddons : (roomAddons ? Object.values(roomAddons) : []);
                    } catch (e) {
                        billData.addons = [];
                    }

                    await saveToFirebase(billData);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    errorMessages.push(`แถวที่ ${i + 2}: ${error.message}`);
                }
            }

            let message = `อัพโหลดสำเร็จ ${successCount} รายการ`;
            if (errorCount > 0) {
                message += ` (มีข้อผิดพลาด ${errorCount} รายการ)`;
            }

            showAlert(message, errorCount > 0 ? 'warning' : 'success');
            
            if (errorCount > 0) {
                console.error('CSV Upload Errors:', errorMessages);
            }

            closeModal('csv-upload-modal');
            resetCSVUpload();
            renderHomeRoomCards();

        } catch (error) {
            showAlert('เกิดข้อผิดพลาดในการอัพโหลด: ' + error.message, 'error');
        } finally {
            processBtn.innerHTML = originalText;
            processBtn.disabled = false;
        }
    }

    function resetCSVUpload() {
        csvData = null;
        csvHeaders = null;
        
        if (fileInput) fileInput.value = '';
        if (processBtn) processBtn.disabled = true;
        
        const previewSection = document.getElementById('csv-preview-section');
        if (previewSection) previewSection.classList.add('hidden');
        
        const previewDiv = document.getElementById('csv-preview');
        if (previewDiv) previewDiv.innerHTML = '';
        
        const validationDiv = document.getElementById('csv-validation');
        if (validationDiv) validationDiv.innerHTML = '';
    }
}

// Global function for window access
window.setupCSVUpload = setupCSVUpload;
