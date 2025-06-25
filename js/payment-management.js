/*
    Payment Confirmation and Evidence Management for the Electricity Bill Calculator
*/

/**
 * Confirm payment for a bill
 * @param {string} key - Bill key
 */
export async function confirmPayment(key) {
    if (!hasPermission('canConfirmPayment')) {
        showAlert('คุณไม่มีสิทธิ์ยืนยันการชำระเงิน', 'error');
        return;
    }

    try {
        // Get bill data first
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const billData = snapshot.val();
        
        if (!billData) {
            showAlert('ไม่พบข้อมูลบิล', 'error');
            return;
        }

        // Check if evidence exists
        if (!billData.evidenceUrl) {
            showAlert('ไม่พบหลักฐานการชำระเงิน กรุณาแนบหลักฐานก่อน', 'error');
            return;
        }

        // Check if already confirmed
        if (billData.paymentConfirmed === true) {
            showAlert('การชำระเงินถูกยืนยันแล้ว', 'info');
            return;
        }

        // Show confirmation dialog
        const confirmResult = confirm(`ยืนยันการชำระเงินสำหรับห้อง ${billData.room} วันที่ ${billData.date}?`);
        if (!confirmResult) return;

        // Update bill record
        const updateData = {
            paymentConfirmed: true,
            paymentConfirmedAt: new Date().toISOString(),
            paymentConfirmedBy: auth.currentUser?.uid || 'unknown'
        };

        await db.ref(`electricityData/${key}`).update(updateData);

        showAlert('ยืนยันการชำระเงินเรียบร้อยแล้ว', 'success');

        // Refresh the UI
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            const { renderHistoryTable } = await import('./ui-rendering.js');
            renderHistoryTable(room);
        } else {
            const { renderHomeRoomCards } = await import('./ui-rendering.js');
            renderHomeRoomCards();
        }

    } catch (error) {
        console.error('Error confirming payment:', error);
        showAlert('เกิดข้อผิดพลาดในการยืนยันการชำระเงิน', 'error');
    }
}

/**
 * Delete evidence for a bill
 * @param {string} key - Bill key
 */
export async function deleteEvidence(key) {
    if (!hasPermission('canUploadEvidence')) {
        showAlert('คุณไม่มีสิทธิ์ลบหลักฐาน', 'error');
        return;
    }

    try {
        // Get bill data first
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const billData = snapshot.val();
        
        if (!billData) {
            showAlert('ไม่พบข้อมูลบิล', 'error');
            return;
        }

        // Check if payment is confirmed
        if (billData.paymentConfirmed === true) {
            showAlert('ไม่สามารถลบหลักฐานได้ เนื่องจากการชำระเงินถูกยืนยันแล้ว', 'error');
            return;
        }

        // Check if evidence exists
        if (!billData.evidenceUrl) {
            showAlert('ไม่พบหลักฐานที่จะลบ', 'error');
            return;
        }

        // Show confirmation dialog
        const confirmResult = confirm('คุณแน่ใจหรือไม่ว่าต้องการลบหลักฐานการชำระเงิน?');
        if (!confirmResult) return;

        // Delete from Firebase Storage
        try {
            const storageRef = storage.refFromURL(billData.evidenceUrl);
            await storageRef.delete();
        } catch (storageError) {
            console.warn('Could not delete file from storage:', storageError);
            // Continue even if storage deletion fails
        }

        // Update bill record to remove evidence
        const updateData = {
            evidenceUrl: null,
            evidenceFileName: null,
            evidenceUploadedAt: null,
            evidenceUploadedBy: null
        };

        await db.ref(`electricityData/${key}`).update(updateData);

        showAlert('ลบหลักฐานเรียบร้อยแล้ว', 'success');

        // Refresh the UI
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            const { renderHistoryTable } = await import('./ui-rendering.js');
            renderHistoryTable(room);
        } else {
            const { renderHomeRoomCards } = await import('./ui-rendering.js');
            renderHomeRoomCards();
        }

    } catch (error) {
        console.error('Error deleting evidence:', error);
        showAlert('เกิดข้อผิดพลาดในการลบหลักฐาน', 'error');
    }
}

/**
 * Show confirmation modal
 * @param {Object} options - Modal options
 */
export function showConfirmModal({ 
    title, 
    text, 
    confirmButtonText = 'ยืนยัน', 
    cancelButtonText = 'ยกเลิก', 
    confirmButtonClass = 'bg-red-600 hover:bg-red-700', 
    onConfirm 
}) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const textEl = document.getElementById('confirm-modal-text');
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

    if (!modal || !titleEl || !textEl || !confirmBtn || !cancelBtn) {
        console.error('Confirm modal elements not found');
        return;
    }

    // Set content
    titleEl.textContent = title;
    textEl.textContent = text;
    confirmBtn.textContent = confirmButtonText;
    cancelBtn.textContent = cancelButtonText;

    // Set button classes
    confirmBtn.className = `px-4 py-2 rounded-lg font-semibold text-white transition-colors ${confirmButtonClass}`;

    // Set up event handlers
    const handleConfirm = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        if (onConfirm) onConfirm();
    };

    const handleCancel = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Setup evidence modal listeners
 */
export function setupEvidenceModalListeners() {
    // File input change handlers
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');

    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    if (cameraInput) {
        cameraInput.addEventListener('change', handleFileSelect);
    }

    // Drag and drop handlers
    const dropZone = document.getElementById('evidence-drop-zone');
    if (dropZone) {
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('drop', handleDrop);
        dropZone.addEventListener('click', () => fileInput?.click());
    }
}

/**
 * Handle file selection for evidence
 * @param {Event} event - File input change event
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processEvidenceFile(file);
    }
}

/**
 * Handle drag over event
 * @param {Event} event - Drag over event
 */
function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
}

/**
 * Handle drop event
 * @param {Event} event - Drop event
 */
function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processEvidenceFile(files[0]);
    }
}

/**
 * Process evidence file
 * @param {File} file - File to process
 */
function processEvidenceFile(file) {
    const preview = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const saveBtn = document.getElementById('evidence-save-btn');
    const errorMsg = document.getElementById('evidence-error');

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        if (errorMsg) {
            errorMsg.textContent = 'กรุณาเลือกไฟล์รูปภาพ (JPEG, PNG, GIF, WebP)';
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        if (errorMsg) {
            errorMsg.textContent = 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)';
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Clear error message
    if (errorMsg) {
        errorMsg.style.display = 'none';
    }

    // Show preview
    if (preview && placeholder) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
            
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Clear evidence selection
 */
export function clearEvidenceSelection() {
    const preview = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const saveBtn = document.getElementById('evidence-save-btn');
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    const errorMsg = document.getElementById('evidence-error');

    // Clear file inputs
    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';

    // Reset preview
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (placeholder) {
        placeholder.style.display = 'block';
    }

    // Reset save button
    if (saveBtn) {
        saveBtn.disabled = true;
    }

    // Clear error message
    if (errorMsg) {
        errorMsg.style.display = 'none';
    }
}
