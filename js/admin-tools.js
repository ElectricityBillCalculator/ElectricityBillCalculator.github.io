/*
    Additional utilities and helper functions for the Electricity Bill Calculator
*/

/**
 * Add addon input field for room settings
 */
export function addAddonInput() {
    const addonsContainer = document.getElementById('addons-container');
    if (!addonsContainer) return;

    const addonIndex = addonsContainer.children.length;
    const addonDiv = document.createElement('div');
    addonDiv.className = 'flex gap-2 items-center addon-item';
    addonDiv.innerHTML = `
        <input type="text" placeholder="ชื่อรายการ" class="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white">
        <input type="number" placeholder="ราคา" class="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" step="0.01">
        <button type="button" onclick="removeAddonInput(this)" class="text-red-400 hover:text-red-300">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    addonsContainer.appendChild(addonDiv);
}

/**
 * Remove addon input field
 * @param {HTMLElement} button - Remove button element
 */
export function removeAddonInput(button) {
    const addonItem = button.closest('.addon-item');
    if (addonItem) {
        addonItem.remove();
    }
}

/**
 * Add bulk data entry button functionality
 */
export function addBulkDataEntryButton() {
    const bulkEntryBtn = document.getElementById('bulk-entry-btn');
    if (bulkEntryBtn) {
        bulkEntryBtn.addEventListener('click', openBulkDataModal);
    }
}

/**
 * Open bulk data entry modal
 */
function openBulkDataModal() {
    if (!hasPermission('canAddNewBills')) {
        showAlert('คุณไม่มีสิทธิ์เพิ่มข้อมูลจำนวนมาก', 'error');
        return;
    }
    
    const modal = document.getElementById('bulk-data-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

/**
 * Close bulk data entry modal
 */
export function closeBulkDataModal() {
    const modal = document.getElementById('bulk-data-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Process bulk data entry
 */
export async function processBulkData() {
    const csvData = document.getElementById('bulk-csv-data')?.value;
    if (!csvData || csvData.trim() === '') {
        showAlert('กรุณาใส่ข้อมูล CSV', 'error');
        return;
    }

    try {
        // Parse CSV data
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        // Validate headers
        const requiredHeaders = ['room', 'date', 'current', 'previous', 'rate'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        
        if (missingHeaders.length > 0) {
            showAlert(`ข้อมูลไม่ครบถ้วน ขาดคอลัมน์: ${missingHeaders.join(', ')}`, 'error');
            return;
        }

        const { saveToFirebase } = await import('./firebase-data.js');
        let successCount = 0;
        let errorCount = 0;

        // Process each row
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const rowData = {};
            
            headers.forEach((header, index) => {
                rowData[header] = values[index];
            });

            // Validate and convert data
            const billData = {
                room: rowData.room,
                name: rowData.name || '',
                date: rowData.date,
                current: parseFloat(rowData.current) || 0,
                previous: parseFloat(rowData.previous) || 0,
                rate: parseFloat(rowData.rate) || 0,
                dueDate: rowData.dueDate || '',
                createdAt: new Date().toISOString(),
                createdBy: auth.currentUser?.uid || 'unknown'
            };

            // Calculate totals
            billData.units = billData.current - billData.previous;
            billData.total = billData.units * billData.rate;

            // Add water data if available
            if (rowData.waterCurrent) {
                billData.currentWater = parseFloat(rowData.waterCurrent) || 0;
                billData.previousWater = parseFloat(rowData.waterPrevious) || 0;
                billData.waterRate = parseFloat(rowData.waterRate) || 0;
                billData.waterUnits = billData.currentWater - billData.previousWater;
                billData.waterTotal = billData.waterUnits * billData.waterRate;
            }

            try {
                await saveToFirebase(billData);
                successCount++;
            } catch (error) {
                console.error(`Error saving row ${i}:`, error);
                errorCount++;
            }
        }

        showAlert(`บันทึกข้อมูลเรียบร้อย: สำเร็จ ${successCount} รายการ, ล้มเหลว ${errorCount} รายการ`, 'success');
        
        if (successCount > 0) {
            // Refresh the UI
            const { renderHomeRoomCards } = await import('./ui-rendering.js');
            renderHomeRoomCards();
        }

        closeBulkDataModal();

    } catch (error) {
        console.error('Error processing bulk data:', error);
        showAlert('เกิดข้อผิดพลาดในการประมวลผลข้อมูล', 'error');
    }
}

/**
 * Download sample CSV template
 */
export function downloadSampleCSV() {
    const csvContent = `room,name,date,current,previous,rate,dueDate,waterCurrent,waterPrevious,waterRate
101,John Doe,01/01/2024,150,100,6.50,15/01/2024,25,20,18.00
102,Jane Smith,01/01/2024,200,150,6.50,15/01/2024,30,25,18.00`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sample_bill_data.csv';
    link.click();
}

/**
 * Open assessment modal for equipment evaluation
 * @param {string} roomId - Room ID
 */
export function openAssessmentModal(roomId) {
    if (!hasPermission('canManageRooms', roomId)) {
        showAlert('คุณไม่มีสิทธิ์ประเมินอุปกรณ์ของห้องนี้', 'error');
        return;
    }

    console.log('Opening assessment modal for room:', roomId);
    
    // Implementation for equipment assessment
    // This would typically open a modal with assessment form
    const assessmentUrl = `assessment.html?room=${encodeURIComponent(roomId)}`;
    window.open(assessmentUrl, '_blank');
}

/**
 * Open room settings modal
 * @param {string} roomId - Room ID
 */
export function openRoomSettingsModal(roomId) {
    if (!hasPermission('canManageRooms', roomId)) {
        showAlert('คุณไม่มีสิทธิ์จัดการการตั้งค่าห้องนี้', 'error');
        return;
    }

    console.log('Opening room settings modal for room:', roomId);
    
    // Load room data and show settings modal
    loadRoomSettings(roomId);
}

/**
 * Load room settings data
 * @param {string} roomId - Room ID
 */
async function loadRoomSettings(roomId) {
    try {
        const { getRoomData } = await import('./firebase-data.js');
        const roomData = await getRoomData(roomId);
        
        const modal = document.getElementById('room-settings-modal');
        const roomIdSpan = document.getElementById('settings-room-id');
        const tenantNameInput = document.getElementById('settings-tenant-name');
        const roomSizeInput = document.getElementById('settings-room-size');
        const rentInput = document.getElementById('settings-rent');
        
        if (modal && roomIdSpan) {
            roomIdSpan.textContent = roomId;
            
            if (roomData) {
                if (tenantNameInput) tenantNameInput.value = roomData.tenantName || '';
                if (roomSizeInput) roomSizeInput.value = roomData.roomSize || '';
                if (rentInput) rentInput.value = roomData.rent || '';
            }
            
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        
    } catch (error) {
        console.error('Error loading room settings:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดการตั้งค่าห้อง', 'error');
    }
}

/**
 * Save room settings
 */
export async function saveRoomSettings() {
    const roomId = document.getElementById('settings-room-id')?.textContent;
    if (!roomId) {
        showAlert('ไม่พบรหัสห้อง', 'error');
        return;
    }

    const tenantName = document.getElementById('settings-tenant-name')?.value || '';
    const roomSize = document.getElementById('settings-room-size')?.value || '';
    const rent = parseFloat(document.getElementById('settings-rent')?.value) || 0;

    try {
        const { updateRoomData } = await import('./firebase-data.js');
        
        const updateData = {
            tenantName,
            roomSize,
            rent,
            updatedAt: new Date().toISOString(),
            updatedBy: auth.currentUser?.uid || 'unknown'
        };

        await updateRoomData(roomId, updateData);
        
        showAlert('บันทึกการตั้งค่าห้องเรียบร้อยแล้ว', 'success');
        
        // Close modal
        const { closeModal } = await import('./modal-controls.js');
        closeModal('room-settings-modal');
        
        // Refresh room cards
        const { renderHomeRoomCards } = await import('./ui-rendering.js');
        renderHomeRoomCards();
        
    } catch (error) {
        console.error('Error saving room settings:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า', 'error');
    }
}

/**
 * Close actions menu
 */
export function closeActionsMenu() {
    const menu = document.getElementById('global-actions-menu');
    if (menu) {
        menu.classList.add('hidden');
    }
}

/**
 * Open actions menu
 * @param {Event} event - Click event
 * @param {Object} billData - Bill data for actions
 */
export function openActionsMenu(event, billData) {
    event.stopPropagation();
    
    const menu = document.getElementById('global-actions-menu');
    if (!menu) return;
    
    // Position menu near click
    const rect = event.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    
    // Update menu actions based on bill data and permissions
    updateActionsMenu(billData);
    
    menu.classList.remove('hidden');
}

/**
 * Update actions menu based on bill data
 * @param {Object} billData - Bill data
 */
function updateActionsMenu(billData) {
    const menu = document.getElementById('global-actions-menu');
    if (!menu || !billData) return;
    
    const canEdit = hasPermission('canEditAllBills', billData.room);
    const canDelete = hasPermission('canDeleteBills', billData.room) && 
                     (!billData.paymentConfirmed || window.currentUserRole === 'admin' || window.currentUserRole === '1');
    const canDeleteEvidence = hasPermission('canUploadEvidence', billData.room) && 
                             billData.evidenceUrl && !billData.paymentConfirmed;
    
    menu.innerHTML = `
        ${canEdit ? `<button onclick="openEditModal('${billData.id}')" class="block w-full text-left px-4 py-2 text-sm hover:bg-slate-700">แก้ไข</button>` : ''}
        ${canDelete ? `<button onclick="openDeleteConfirmModal('${billData.id}')" class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700">ลบ</button>` : ''}
        ${canDeleteEvidence ? `<button onclick="deleteEvidence('${billData.id}')" class="block w-full text-left px-4 py-2 text-sm text-orange-400 hover:bg-slate-700">ลบหลักฐาน</button>` : ''}
        <button onclick="generateQRCode(${JSON.stringify(billData).replace(/"/g, '&quot;')})" class="block w-full text-left px-4 py-2 text-sm hover:bg-slate-700">QR Code</button>
    `;
}
