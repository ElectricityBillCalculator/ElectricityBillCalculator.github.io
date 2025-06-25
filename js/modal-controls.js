/*
    Modal Controls for the Electricity Bill Calculator
*/

import { setKeyForEvidence, setKeyToDelete, keyForEvidence, keyToDelete } from './constants.js';
import { compressImage, FILE_UPLOAD_CONFIG } from './constants.js';

/**
 * Close a modal by ID
 * @param {string} modalId - Modal element ID
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with id '${modalId}' not found`);
        return;
    }

    // Remove active class to trigger transition
    modal.classList.remove('active');
    
    // Wait for transition to complete before hiding
    const onTransitionEnd = () => {
        modal.style.display = 'none';
        modal.style.visibility = 'hidden';
        modal.removeEventListener('transitionend', onTransitionEnd);
        
        // Re-enable body scroll
        document.body.classList.remove('modal-open');
    };
    
    modal.addEventListener('transitionend', onTransitionEnd);
    
    // Fallback: if transition doesn't fire, hide after a delay
    setTimeout(() => {
        if (modal.style.display !== 'none') {
            onTransitionEnd();
        }
    }, 300);
}

/**
 * Open a modal by ID
 * @param {string} modalId - Modal element ID
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with id '${modalId}' not found`);
        return;
    }

    // Show modal
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    
    // Disable body scroll
    document.body.classList.add('modal-open');
    
    // Add active class after a brief delay to trigger transition
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

/**
 * View evidence image in modal
 * @param {string} url - Image URL
 * @param {string} fileName - File name
 */
export function viewEvidence(url, fileName = 'หลักฐานการชำระเงิน') {
    console.log('=== viewEvidence started ===');
    console.log('Evidence URL:', url);
    console.log('File name:', fileName);
    
    if (!url) {
        showAlert('ไม่พบ URL ของหลักฐาน', 'error');
        return;
    }
    
    // Show evidence in modal instead of new tab
    const modal = document.getElementById('evidence-view-modal');
    const container = document.getElementById('evidence-view-container');
    const downloadBtn = document.getElementById('download-evidence-btn');
    
    if (!modal || !container) {
        console.error('Evidence view modal elements not found');
        return;
    }
    
    // Clear previous content
    container.innerHTML = '';
    
    // Create image element
    const img = document.createElement('img');
    img.src = url;
    img.alt = fileName;
    img.className = 'max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    
    // Add loading state
    img.onload = function() {
        console.log('Evidence image loaded successfully');
    };
    
    img.onerror = function() {
        container.innerHTML = '<p class="text-red-400 text-center">ไม่สามารถโหลดรูปภาพได้</p>';
        console.error('Failed to load evidence image');
    };
    
    // Add image to container
    container.appendChild(img);
    
    // Set up download button
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
        };
    }
    
    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    console.log('=== viewEvidence ended ===');
}

/**
 * Close evidence view modal
 */
export function closeEvidenceViewModal() {
    const modal = document.getElementById('evidence-view-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Open evidence upload modal
 * @param {string} key - Bill key for evidence upload
 */
export function openEvidenceModal(key) {
    console.log('=== openEvidenceModal started ===');
    console.log('Key parameter:', key);
    
    if (!hasPermission('canUploadEvidence')) {
        showAlert('คุณไม่มีสิทธิ์อัปโหลดหลักฐาน', 'error');
        return;
    }
    
    setKeyForEvidence(key);
    console.log('keyForEvidence set to:', key);
    
    // Reset modal state
    const preview = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const errorMsg = document.getElementById('evidence-error');
    const saveBtn = document.getElementById('evidence-save-btn');
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    const progressContainer = document.getElementById('upload-progress-container');
    const uploadStatus = document.getElementById('upload-status');
    
    console.log('Modal elements found:', {
        preview: !!preview,
        placeholder: !!placeholder,
        errorMsg: !!errorMsg,
        saveBtn: !!saveBtn,
        fileInput: !!fileInput,
        cameraInput: !!cameraInput,
        progressContainer: !!progressContainer,
        uploadStatus: !!uploadStatus
    });
    
    // Clear file inputs
    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
    
    // Clear preview and show placeholder
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
        saveBtn.textContent = 'บันทึกหลักฐาน';
    }
    
    // Clear error message
    if (errorMsg) {
        errorMsg.textContent = '';
        errorMsg.style.display = 'none';
    }
    
    // Hide progress indicators
    if (progressContainer) progressContainer.style.display = 'none';
    if (uploadStatus) uploadStatus.textContent = '';

    const modal = document.getElementById('evidence-modal');
    console.log('Modal element found:', !!modal);
    
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        console.error('Evidence modal not found');
    }
    
    console.log('=== openEvidenceModal ended ===');
}

/**
 * Close evidence upload modal
 */
export function closeEvidenceModal() {
    setKeyForEvidence(null);
    const modal = document.getElementById('evidence-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Open delete confirmation modal
 * @param {string} key - Bill key to delete
 */
export function openDeleteConfirmModal(key) {
    // Fetch the bill data to check which room it belongs to for permission check
    db.ref(`electricityData/${key}`).once('value').then(snapshot => {
        const billData = snapshot.val();
        if (!billData) {
            showAlert('ไม่พบข้อมูลที่ต้องการลบ', 'error');
            return;
        }

        if (!hasPermission('canDeleteBills', billData.room)) {
            showAlert(`คุณไม่มีสิทธิ์ลบข้อมูลของห้อง ${billData.room}`, 'error');
            return;
        }

        setKeyToDelete(key);
        const modal = document.getElementById('delete-confirm-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }).catch(error => {
        console.error('Error fetching bill data for delete:', error);
        showAlert('เกิดข้อผิดพลาดในการตรวจสอบข้อมูล', 'error');
    });
}

/**
 * Close delete confirmation modal
 */
export function closeDeleteConfirmModal() {
    setKeyToDelete(null);
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Close QR code modal
 */
export function closeQrCodeModal() {
    const modal = document.getElementById('qr-code-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Handle evidence file upload
 */
export async function handleEvidenceUpload() {
    console.log('=== handleEvidenceUpload started ===');
    
    if (!keyForEvidence) {
        console.error('No keyForEvidence set');
        showAlert('เกิดข้อผิดพลาด: ไม่พบ ID ของบิล', 'error');
        return;
    }

    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    
    // Check which input has a file
    let selectedFile = null;
    let inputType = '';
    
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        inputType = 'file';
    } else if (cameraInput && cameraInput.files && cameraInput.files.length > 0) {
        selectedFile = cameraInput.files[0];
        inputType = 'camera';
    }

    if (!selectedFile) {
        showAlert('กรุณาเลือกไฟล์หลักฐาน', 'error');
        return;
    }

    console.log('Selected file:', selectedFile.name, 'Type:', inputType, 'Size:', selectedFile.size);

    // Validate file type
    if (!FILE_UPLOAD_CONFIG.allowedTypes.includes(selectedFile.type)) {
        showAlert('กรุณาเลือกไฟล์รูปภาพ (JPEG, PNG, GIF, WebP)', 'error');
        return;
    }

    // Validate file size
    if (selectedFile.size > FILE_UPLOAD_CONFIG.maxSize) {
        showAlert(`ไฟล์มีขนาดใหญ่เกินไป (สูงสุด ${FILE_UPLOAD_CONFIG.maxSize / 1024 / 1024}MB)`, 'error');
        return;
    }

    try {
        // Show progress
        const progressContainer = document.getElementById('upload-progress-container');
        const uploadStatus = document.getElementById('upload-status');
        const saveBtn = document.getElementById('evidence-save-btn');
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (uploadStatus) uploadStatus.textContent = 'กำลังบีบอัดรูปภาพ...';
        if (saveBtn) saveBtn.disabled = true;

        // Compress image
        const compressedFile = await compressImage(
            selectedFile,
            FILE_UPLOAD_CONFIG.maxWidth,
            FILE_UPLOAD_CONFIG.maxHeight,
            FILE_UPLOAD_CONFIG.quality
        );

        console.log('Compressed file size:', compressedFile.size);

        if (uploadStatus) uploadStatus.textContent = 'กำลังอัปโหลด...';

        // Upload to Firebase Storage
        const fileName = `evidence_${keyForEvidence}_${Date.now()}.jpg`;
        const storageRef = storage.ref(`evidence/${fileName}`);
        
        const uploadTask = storageRef.put(compressedFile);

        uploadTask.on('state_changed',
            (snapshot) => {
                // Progress tracking
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (uploadStatus) uploadStatus.textContent = `กำลังอัปโหลด... ${Math.round(progress)}%`;
                console.log('Upload progress:', progress);
            },
            (error) => {
                // Error handling
                console.error('Upload error:', error);
                showAlert('เกิดข้อผิดพลาดในการอัปโหลด', 'error');
                if (progressContainer) progressContainer.style.display = 'none';
                if (saveBtn) saveBtn.disabled = false;
            },
            async () => {
                // Success handling
                try {
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                    console.log('Upload successful, download URL:', downloadURL);

                    // Update bill record with evidence URL
                    await db.ref(`electricityData/${keyForEvidence}`).update({
                        evidenceUrl: downloadURL,
                        evidenceFileName: selectedFile.name,
                        evidenceUploadedAt: new Date().toISOString(),
                        evidenceUploadedBy: auth.currentUser?.uid || 'unknown'
                    });

                    showAlert('อัปโหลดหลักฐานสำเร็จ', 'success');
                    closeEvidenceModal();

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
                    console.error('Error updating bill record:', error);
                    showAlert('อัปโหลดสำเร็จ แต่เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
                }
            }
        );

    } catch (error) {
        console.error('Error in handleEvidenceUpload:', error);
        showAlert('เกิดข้อผิดพลาดในการประมวลผลไฟล์', 'error');
        
        // Hide progress and re-enable button
        const progressContainer = document.getElementById('upload-progress-container');
        const saveBtn = document.getElementById('evidence-save-btn');
        if (progressContainer) progressContainer.style.display = 'none';
        if (saveBtn) saveBtn.disabled = false;
    }

    console.log('=== handleEvidenceUpload ended ===');
}

/**
 * Handle bill deletion
 * @param {string} key - Bill key to delete
 */
export async function handleDeleteBill(key) {
    if (!key) {
        showAlert('ไม่พบ ID ของบิลที่ต้องการลบ', 'error');
        return;
    }

    try {
        const { deleteBill } = await import('./firebase-data.js');
        await deleteBill(key);
        closeDeleteConfirmModal();
    } catch (error) {
        console.error('Error in handleDeleteBill:', error);
        showAlert('เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
    }
}
