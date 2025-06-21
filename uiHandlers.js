// This file will contain functions for DOM manipulation,
// rendering UI components, and managing UI interactions like modals.
console.log("uiHandlers.js loaded");

// --- Data Rendering ---

async function renderHomeRoomCards() {
    const cardsContainer = document.getElementById('home-room-cards');
    if (!cardsContainer) return;

    const user = window.currentUser;
    const userRole = window.currentUserRole;
    const userData = window.currentUserData;

    if (!user) {
        cardsContainer.innerHTML = `<p class="text-center text-red-400 col-span-full">กรุณาเข้าสู่ระบบเพื่อดูข้อมูล</p>`;
        return;
    }

    try {
        let allBills = await loadFromFirebase();
        if (!allBills || allBills.length === 0) {
            cardsContainer.innerHTML = '<p class="text-center text-gray-400 col-span-full">ยังไม่มีข้อมูลห้องพัก</p>';
            return;
        }

        let displayableBills = [];
        if (userRole === 'admin' || (userRole === 'user' && hasPermission('canViewAllRooms'))) {
            displayableBills = allBills;
        } else if (userRole === '1' && userData && userData.managedRooms) {
            displayableBills = allBills.filter(bill => userData.managedRooms.includes(bill.room));
        } else if (userRole === 'level1_tenant' && userData && userData.accessibleRooms) {
            displayableBills = allBills.filter(bill => userData.accessibleRooms.includes(bill.room));
        } else {
            if (!hasPermission('canViewAllRooms')) {
                 cardsContainer.innerHTML = `<p class="text-center text-red-400 col-span-full">คุณไม่มีสิทธิ์ดูข้อมูลห้อง</p>`;
                 return;
            }
            displayableBills = allBills;
        }

        if (displayableBills.length === 0) {
            cardsContainer.innerHTML = '<p class="text-center text-gray-400 col-span-full">ไม่พบข้อมูลห้องพักที่คุณมีสิทธิ์เข้าถึง</p>';
            return;
        }

        const rooms = {};
        displayableBills.forEach(bill => {
            if (bill && typeof bill.room !== 'undefined' && bill.room !== null && String(bill.room).trim() !== '') {
                if (bill.date && typeof bill.date === 'string' && bill.date.split('/').length === 3) {
                    // Ensure date is valid for comparison by trying to parse it
                    const billDateObj = new Date(bill.date.split('/').reverse().join('-'));
                    let existingRoomDateObj = null;
                    if (rooms[bill.room] && rooms[bill.room].date && typeof rooms[bill.room].date === 'string' && rooms[bill.room].date.split('/').length === 3) {
                        existingRoomDateObj = new Date(rooms[bill.room].date.split('/').reverse().join('-'));
                    }

                    if (!isNaN(billDateObj.getTime())) { // Check if billDateObj is a valid date
                        if (!rooms[bill.room] || (existingRoomDateObj && !isNaN(existingRoomDateObj.getTime()) && billDateObj > existingRoomDateObj)) {
                            rooms[bill.room] = bill;
                        } else if (!existingRoomDateObj || isNaN(existingRoomDateObj.getTime())) { // If existing room has invalid date, overwrite
                            rooms[bill.room] = bill;
                        }
                    } else if (!rooms[bill.room]) { // If current bill has invalid date, but no entry for room exists
                        rooms[bill.room] = bill;
                         console.warn('Bill added to rooms object but its date is invalid:', bill);
                    } else {
                        console.warn('Skipping bill due to invalid date and an existing entry (possibly with valid date):', bill);
                    }
                } else {
                    if (!rooms[bill.room]) {
                        rooms[bill.room] = bill;
                        console.warn('Bill added to rooms object but date is invalid or missing format:', bill);
                    } else {
                         console.warn('Skipping bill due to invalid/missing date format (existing room entry present):', bill);
                    }
                }
            } else {
                console.warn('Skipping bill due to missing or invalid room identifier in displayableBills.forEach:', bill);
            }
        });

        const sortedRooms = Object.values(rooms).sort((a, b) => {
            if (a.room && b.room) {
                return String(a.room).localeCompare(String(b.room));
            } else if (a.room) {
                return -1;
            } else if (b.room) {
                return 1;
            }
            return 0;
        });

        cardsContainer.innerHTML = sortedRooms.map(roomData => {
            const totalAmount = Number(roomData.total || 0);
            const amountColor = getAmountColor(totalAmount);
            const dueDateInfo = getDueDateInfo(roomData.dueDate);
            const isPaymentConfirmed = roomData.paymentConfirmed === true;

            if (!roomData || typeof roomData.room === 'undefined') {
                console.warn('Skipping card rendering for roomData because roomData.room is undefined:', roomData);
                return '';
            }

            return `
            <div class="bg-slate-800 rounded-2xl shadow-lg p-5 flex flex-col justify-between hover:bg-slate-700/50 transition-all border border-slate-700 hover:border-blue-500">
                <div>
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-3xl font-bold text-blue-400">${roomData.room}</span>
                            ${hasPermission('canEditAllBills') ?
                                `<button onclick="openEditRoomNameModal('${roomData.room}', '${roomData.name || ''}')" class="text-yellow-400 hover:text-yellow-300 transition-colors" title="แก้ไขชื่อห้อง">
                                    <i class="fas fa-edit text-sm"></i>
                                </button>` : ''
                            }
                        </div>
                        <div class="text-xs text-gray-400 text-right">
                            <span>อัปเดตล่าสุด</span><br>
                            <span>${roomData.date || 'N/A'}</span>
                        </div>
                    </div>
                    <p class="text-lg text-white font-semibold mt-2 truncate">${roomData.name || 'ไม่มีชื่อ'}</p>
                    ${isPaymentConfirmed ?
                        `<div class="mt-2 flex items-center gap-2 text-emerald-400">
                            <i class="fas fa-check-circle"></i>
                            <span class="text-sm font-medium">ยืนยันการชำระเงินแล้ว</span>
                        </div>` : ''
                    }
                </div>
                <div class="mt-4 pt-4 border-t border-slate-700 space-y-2">
                     <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-400">จำนวนหน่วย:</span>
                        <span class="text-white font-semibold">${roomData.units || 'N/A'} หน่วย</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-400">หน่วยละ:</span>
                        <span class="text-white font-semibold">${Number(roomData.rate || 0).toFixed(2)} ฿</span>
                    </div>
                </div>
                <div class="mt-4 pt-4 border-t border-slate-700 space-y-2">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-400">ค่าน้ำ (หน่วย):</span>
                        <span class="text-cyan-400 font-semibold">${roomData.waterUnits || '-'} หน่วย</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-400">ค่าน้ำ (บาท):</span>
                        <span class="text-sky-400 font-semibold">฿${Number(roomData.waterTotal || 0).toLocaleString()}</span>
                    </div>
                </div>
                 <div class="mt-4 pt-4 border-t border-slate-700 text-center">
                    <p class="text-sm text-gray-300">ค่าไฟล่าสุด</p>
                    <p class="text-4xl font-bold ${amountColor}">฿${totalAmount.toLocaleString()}</p>
                </div>
                ${dueDateInfo.show ? `
                <div class="mt-4 pt-2 border-t border-slate-700/50 text-center">
                    <div class="flex items-center justify-center gap-2 ${dueDateInfo.color}">
                        <i class="fas fa-clock"></i>
                        <span class="text-sm font-medium">${dueDateInfo.text}</span>
                    </div>
                </div>` : ''}
                <div class="mt-4 pt-4 border-t border-slate-700 flex gap-2">
                    <button onclick="viewRoomHistory('${roomData.room}')" class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1">
                        <i class="fas fa-history"></i> ประวัติ
                    </button>
                    ${hasPermission('canDeleteBills') ?
                        `<button onclick="openDeleteRoomConfirmModal('${roomData.room}')" class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center" title="ลบห้อง">
                            <i class="fas fa-trash"></i>
                        </button>` : ''
                    }
                </div>
            </div>
        `}).join('');

    } catch (error) {
        console.error("Error rendering room cards:", error);
        if (cardsContainer) {
            cardsContainer.innerHTML = '<p class="text-center text-red-400 col-span-full">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
        }
    }
}

async function renderHistoryTable(room) {
    const historyBody = document.getElementById('history-body');
    const noHistory = document.getElementById('no-history');
    const historySection = document.getElementById('history-section');

    if (!historyBody || !noHistory || !historySection) return;

    if (!hasPermission('canViewHistory', room)) {
        historyBody.innerHTML = '';
        noHistory.innerHTML = `<p class="text-center text-red-400">คุณไม่มีสิทธิ์ดูประวัติของห้อง ${room}</p>`;
        noHistory.classList.remove('hidden');
        historySection.style.display = 'none';
        const billForm = document.getElementById('bill-form');
        if (billForm) billForm.style.display = 'none';
        return;
    }

    try {
        const bills = await loadFromFirebase(room);

        if (!bills || bills.length === 0) {
            historyBody.innerHTML = '';
            noHistory.classList.remove('hidden');
            noHistory.innerHTML = `<p class="text-center text-gray-400">ไม่พบประวัติสำหรับห้อง ${room}</p>`;
            historySection.style.display = 'none';
            return;
        }

        noHistory.classList.add('hidden');
        historySection.style.display = '';

        const totalPages = Math.ceil(bills.length / ITEMS_PER_PAGE);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginatedData = bills.slice(startIndex, endIndex);

        historyBody.innerHTML = paginatedData.map(bill => {
            const isPaymentConfirmed = bill.paymentConfirmed === true;
            const canConfirmPayment = hasPermission('canConfirmPayment', room) && bill.evidenceUrl && !isPaymentConfirmed;
            const canDeleteEvidence = hasPermission('canUploadEvidence', room) && bill.evidenceUrl && !isPaymentConfirmed; // Corrected permission check
            const canDeleteRow = hasPermission('canDeleteBills', room) && (!isPaymentConfirmed || window.currentUserRole === 'admin' || window.currentUserRole === '1');

            const billJson = JSON.stringify(bill).replace(/"/g, '&quot;');

            const actionsHtml = `
                <div class="flex items-center justify-center gap-4">
                    ${hasPermission('canGenerateQRCode', room) ? `
                        <button onclick='generateQRCode(${billJson})' class="text-purple-400 hover:text-purple-300 transition-colors" title="สร้าง QR Code ชำระเงิน">
                            <i class="fas fa-qrcode fa-lg"></i>
                        </button>
                    ` : ''}

                    ${!bill.evidenceUrl && hasPermission('canUploadEvidence', room) ? `
                        <button onclick="openEvidenceModal('${bill.key}')" class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold shadow-md transition-all" title="แนบหลักฐาน">
                            <i class="fas fa-upload"></i>
                            <span>แนบหลักฐาน</span>
                        </button>
                    ` : ''}

                    ${bill.evidenceUrl ? `
                        <button onclick="viewEvidence('${bill.evidenceUrl}', '${bill.evidenceFileName || 'หลักฐาน'}')" class="text-blue-400 hover:text-blue-300 transition-colors" title="ดูหลักฐาน">
                            <i class="fas fa-eye fa-lg"></i>
                        </button>
                    ` : ''}

                    ${canConfirmPayment ? `
                        <button onclick="confirmPayment('${bill.key}')" class="text-emerald-400 hover:text-emerald-300 transition-colors" title="ยืนยันการชำระเงิน">
                            <i class="fas fa-check-circle fa-lg"></i>
                        </button>
                    ` : ''}

                    ${isPaymentConfirmed ? `
                        <span class="text-emerald-500" title="ยืนยันการชำระเงินแล้ว โดย ${bill.paymentConfirmedBy || 'แอดมิน'} เมื่อ ${bill.paymentConfirmedAt ? new Date(bill.paymentConfirmedAt).toLocaleString() : ''}">
                            <i class="fas fa-check-double fa-lg"></i>
                        </span>
                    ` : ''}

                    <div class="relative inline-block text-left">
                        <button onclick='openActionsMenu(event, ${billJson})' class="text-slate-400 hover:text-white transition-colors h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-700">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </div>
            `;

            return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 px-3 text-center border-r border-slate-700 align-middle">${bill.date || ''}</td>
                <td class="py-3 px-3 text-center text-yellow-400 font-semibold align-middle">${bill.units || '-'}</td>
                <td class="py-3 px-3 text-center align-middle">${Number(bill.rate || 0).toFixed(2)}</td>
                <td class="py-3 px-3 text-center text-green-400 font-bold border-r border-slate-700 align-middle">${Number(bill.total || 0).toLocaleString()}</td>
                <td class="py-3 px-3 text-center text-cyan-400 font-semibold align-middle">${bill.waterUnits || '-'}</td>
                <td class="py-3 px-3 text-center align-middle">${Number(bill.waterRate || 0).toFixed(2)}</td>
                <td class="py-3 px-3 text-center text-sky-400 font-bold border-r border-slate-700 align-middle">${Number(bill.waterTotal || 0).toLocaleString()}</td>
                <td class="py-3 px-3 text-center align-middle">
                    ${actionsHtml}
                </td>
            </tr>
        `}).join('');

        updatePaginationUI(bills.length, totalPages); // Renamed to avoid conflict

    } catch (error) {
        console.error('Error rendering history table:', error);
        historyBody.innerHTML = `<tr><td colspan="8" class="text-center text-red-400 py-4">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
    }
}


// --- UI & Utility ---

function updatePaginationUI(totalItems, totalPages) { // Renamed
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer || totalPages <= 1) {
        if(paginationContainer) paginationContainer.innerHTML = '';
        return;
    }
    // Actual pagination UI logic will be implemented here or called from here
    // For now, just a placeholder
    let paginationHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `<button class="px-3 py-1 rounded ${i === currentPage ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}" onclick="changePage(${i})">${i}</button>`;
    }
    paginationContainer.innerHTML = paginationHTML;
}

// This function will be part of appLogic.js to handle page changes
// function changePage(page) {
//     currentPage = page;
//     const params = new URLSearchParams(window.location.search);
//     const room = params.get('room');
//     renderHistoryTable(room);
// }


async function updatePreviousReadingFromDB(room) {
    if (!room) return;
    try {
        const bills = await loadFromFirebase(room); // Assumes loadFromFirebase is globally available
        const previousReadingInput = document.getElementById('previous-reading');
        if (previousReadingInput) {
            previousReadingInput.value = bills.length > 0 && bills[0].current ? bills[0].current : '';
        }
        const previousWaterReadingInput = document.getElementById('previous-water-reading');
        if (previousWaterReadingInput) {
            previousWaterReadingInput.value = bills.length > 0 && bills[0].currentWater ? bills[0].currentWater : '';
        }
    } catch (error) {
        console.error("Error updating previous reading from DB:", error);
        // Optionally show an error to the user
    }
}


// --- Helper Functions for Home Cards (UI Specific) ---
function getAmountColor(amount) {
    if (amount <= 1500) return 'text-green-400';
    if (amount <= 2500) return 'text-yellow-400';
    if (amount <= 4000) return 'text-orange-400';
    return 'text-red-500';
}

function getDueDateInfo(dueDateStr) {
    if (!dueDateStr) return { show: false };

    const parts = dueDateStr.split('/');
    if (parts.length !== 3) return { show: false };

    const dueDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { show: true, text: `เกินกำหนด ${Math.abs(diffDays)} วัน`, color: 'text-red-500 animate-pulse' };
    }
    if (diffDays === 0) {
        return { show: true, text: `ครบกำหนดวันนี้`, color: 'text-red-400 font-bold' };
    }
    if (diffDays <= 7) {
        return { show: true, text: `ครบกำหนดใน ${diffDays} วัน`, color: 'text-yellow-400' };
    }
    return { show: true, text: `ครบกำหนดวันที่ ${dueDateStr}`, color: 'text-gray-400' };
}

// --- Modal Controls (UI Specific) ---
function closeModal() { // Specifically for edit-modal, might need to be more generic or duplicated if other modals have simple close
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

function viewEvidence(url, fileName = 'หลักฐานการชำระเงิน') {
    // This function depends on showAlert, which should also be in this file or globally available
    console.log('=== viewEvidence started ===');
    console.log('Evidence URL:', url);
    console.log('File name:', fileName);

    if (!url) {
        showAlert('ไม่พบหลักฐานที่ต้องการดู', 'error'); // showAlert needs to be defined or moved
        return;
    }

    const modal = document.getElementById('evidence-view-modal');
    const container = document.getElementById('evidence-view-container');
    const downloadBtn = document.getElementById('download-evidence-btn');

    if (!modal || !container) {
        console.error('Evidence view modal elements not found');
        showAlert('เกิดข้อผิดพลาดในการแสดงรูปภาพ', 'error'); // showAlert
        return;
    }

    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = fileName;
    img.className = 'max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';

    img.onload = () => console.log('Image loaded successfully');
    img.onerror = () => {
        console.error('Failed to load image');
        container.innerHTML = `<div class="text-center text-red-400"><i class="fas fa-exclamation-triangle text-4xl mb-2"></i><p>ไม่สามารถโหลดรูปภาพได้</p></div>`;
    };

    container.appendChild(img);

    if (downloadBtn) {
        downloadBtn.onclick = function() {
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || 'evidence.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('=== viewEvidence ended ===');
}

function closeEvidenceViewModal() {
    const modal = document.getElementById('evidence-view-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function openEvidenceModalUI(keyPassedToAppLogic) { // Renamed to avoid conflict, appLogic will call this
    // keyForEvidence will be managed by appLogic.js
    // const permissionCheck = hasPermission('canUploadEvidence'); // This check should be done in appLogic before calling this UI function
    // if (!permissionCheck) {
    //     showAlert('คุณไม่มีสิทธิ์แนบหลักฐาน', 'error');
    //     return;
    // }
    // keyForEvidence = keyPassedToAppLogic; // Managed by appLogic

    const preview = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const errorMsg = document.getElementById('evidence-error');
    const saveBtn = document.getElementById('evidence-save-btn');
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    const progressContainer = document.getElementById('upload-progress-container');
    const uploadStatus = document.getElementById('upload-status');

    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
    if (placeholder) placeholder.classList.remove('hidden');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; }
    if (errorMsg) errorMsg.textContent = '';
    if (progressContainer) progressContainer.classList.add('hidden');
    if (uploadStatus) uploadStatus.classList.add('hidden');

    const modal = document.getElementById('evidence-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        const modalTitle = modal.querySelector('h2');
        if (modalTitle) modalTitle.textContent = 'แนบหลักฐานการชำระเงิน (ใหม่)';
    } else {
        console.error('Evidence modal element not found!');
    }
}

function closeEvidenceModal() {
    // keyForEvidence = null; // Managed by appLogic
    const modal = document.getElementById('evidence-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function openDeleteConfirmModalUI() { // keyToDelete will be managed by appLogic
    // Permission checks and setting keyToDelete should happen in appLogic
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeDeleteConfirmModal() {
    // keyToDelete = null; // Managed by appLogic
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.remove('flex'); // ensure flex is also removed
    }
}


function closeQrCodeModal() {
    const modal = document.getElementById('qr-code-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function showConfirmModal({ title, text, confirmButtonText = 'ยืนยัน', cancelButtonText = 'ยกเลิก', confirmButtonClass = 'bg-red-600 hover:bg-red-700', onConfirm }) {
    let modal = document.getElementById('global-confirm-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'global-confirm-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-lg text-center transform transition-all scale-95 opacity-0">
            <h2 class="text-xl font-bold text-white mb-2">${title}</h2>
            <p class="text-slate-400 mb-6">${text}</p>
            <div class="flex justify-center gap-4">
                <button id="confirm-modal-cancel" class="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors">
                    ${cancelButtonText}
                </button>
                <button id="confirm-modal-confirm" class="flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors ${confirmButtonClass}">
                    ${confirmButtonText}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => {
        const modalContent = modal.querySelector('.transform');
        if (modalContent) {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }
    }, 10);

    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    const closeModalFunc = () => { // Renamed to avoid conflict
        const modalContent = modal.querySelector('.transform');
        if (modalContent) modalContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => modal.remove(), 200);
    };

    confirmBtn.onclick = () => {
        if (typeof onConfirm === 'function') onConfirm();
        closeModalFunc();
    };
    cancelBtn.onclick = closeModalFunc;
}

function openEditRoomNameModalUI(roomNumber, currentName) {
    // Permission check in appLogic
    let modal = document.getElementById('edit-room-name-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-room-name-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-white">แก้ไขชื่อห้อง</h2>
                    <button class="text-2xl text-slate-400 hover:text-white transition-colors" onclick="closeEditRoomNameModal()">×</button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">เลขห้อง</label>
                        <input type="text" id="edit-room-number-modal-input" readonly class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white cursor-not-allowed">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">ชื่อผู้เช่า</label>
                        <input type="text" id="edit-room-name-modal-input" class="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-white" placeholder="กรอกชื่อผู้เช่า">
                    </div>
                </div>
                <div class="flex gap-3 mt-6">
                    <button onclick="closeEditRoomNameModal()" class="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors">
                        ยกเลิก
                    </button>
                    <button onclick="saveRoomNameEdit()" class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                        บันทึก
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const roomNumInput = document.getElementById('edit-room-number-modal-input'); // Changed ID to be unique
    const roomNameInput = document.getElementById('edit-room-name-modal-input'); // Changed ID to be unique
    if(roomNumInput) roomNumInput.value = roomNumber;
    if(roomNameInput) roomNameInput.value = currentName;

    if(modal) modal.classList.remove('hidden');
}

function closeEditRoomNameModal() {
    const modal = document.getElementById('edit-room-name-modal');
    if (modal) modal.classList.add('hidden');
}

function openDeleteRoomConfirmModalUI(roomNumber) {
    // Permission check in appLogic
    let modal = document.getElementById('delete-room-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'delete-room-confirm-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-lg text-center">
                <div class="text-red-500 mb-4"><i class="fas fa-exclamation-triangle fa-3x"></i></div>
                <h2 class="text-xl font-bold text-white mb-2">ยืนยันการลบห้อง</h2>
                <p class="text-slate-400 mb-4">คุณแน่ใจหรือไม่ว่าต้องการลบห้อง <span id="delete-room-number-modal-display" class="font-bold text-white"></span> และข้อมูลทั้งหมดที่เกี่ยวข้อง?</p>
                <p class="text-red-400 text-sm mb-6">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
                <div class="flex justify-center gap-4">
                    <button onclick="closeDeleteRoomConfirmModal()" class="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors">ยกเลิก</button>
                    <button onclick="confirmDeleteRoom()" class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors">ยืนยันการลบ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const roomNumDisplay = document.getElementById('delete-room-number-modal-display'); // Changed ID
    if(roomNumDisplay) roomNumDisplay.textContent = roomNumber;
    // window.roomToDelete will be managed by appLogic
    if(modal) modal.classList.remove('hidden');
}

function closeDeleteRoomConfirmModal() { // This one is fine as is, but there are two of them in script.js
    const modal = document.getElementById('delete-room-confirm-modal');
    if (modal) modal.classList.add('hidden');
    // window.roomToDelete = null; // Managed by appLogic
}

function openActionsMenu(event, bill) {
    // This function needs access to hasPermission, which should be in auth.js or passed around.
    // For now, assuming hasPermission is global.
    // The bill data is passed, which is good.
    // The room param fetching might be better if room is passed directly or obtained consistently.
    event.stopPropagation();
    closeActionsMenu();

    const currentRoomFromURL = new URLSearchParams(window.location.search).get('room');
    // It's better if the `room` context for permissions is explicitly passed or part of the `bill` object if consistent.
    // Using bill.room for permission checks is more robust if available and accurate.
    const roomForPermission = bill.room || currentRoomFromURL;


    const isPaymentConfirmed = bill.paymentConfirmed === true;
    // Ensure roomForPermission is valid before using in hasPermission
    const canEdit = roomForPermission ? hasPermission('canEditAllBills', roomForPermission) : hasPermission('canEditAllBills');
    const canDeleteEv = roomForPermission ? hasPermission('canUploadEvidence', roomForPermission) : hasPermission('canUploadEvidence');
    const canDelBill = roomForPermission ? hasPermission('canDeleteBills', roomForPermission) : hasPermission('canDeleteBills');


    const canDeleteEvidence = canDeleteEv && bill.evidenceUrl && !isPaymentConfirmed;
    const canDeleteRow = canDelBill && (!isPaymentConfirmed || window.currentUserRole === 'admin' || window.currentUserRole === '1');

    let menuItems = '';
    if (canEdit) { // Corrected permission usage
        menuItems += `
            <a href="#" onclick="event.preventDefault(); openEditModalWrapper('${bill.key}')" class="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700" role="menuitem">
                <i class="fas fa-edit fa-fw"></i>
                <span>แก้ไข</span>
            </a>
        `;
    }
    // openEditModalWrapper will be in appLogic.js

    if (canDeleteEvidence) {
        menuItems += `
            <a href="#" onclick="event.preventDefault(); deleteEvidenceWrapper('${bill.key}')" class="flex items-center gap-3 px-4 py-2 text-sm text-orange-400 hover:bg-slate-700 hover:text-orange-300" role="menuitem">
                <i class="fas fa-file-excel fa-fw"></i>
                <span>ลบหลักฐาน</span>
            </a>
        `;
    }
    // deleteEvidenceWrapper will be in appLogic.js

    if (canDeleteRow) {
         menuItems += `
            <a href="#" onclick="event.preventDefault(); handleDeleteBillWrapper('${bill.key}')" class="flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300" role="menuitem">
                <i class="fas fa-trash fa-fw"></i>
                <span>ลบบิลนี้</span>
            </a>
        `;
    }
    // handleDeleteBillWrapper will be in appLogic.js

    if (!menuItems.trim()) return;

    const menu = document.createElement('div');
    menu.id = 'global-actions-menu';
    menu.className = 'origin-top-right absolute mt-2 w-48 rounded-md shadow-lg bg-slate-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-30 border border-slate-700';
    menu.innerHTML = `<div class="py-1" role="menu" aria-orientation="vertical">${menuItems}</div>`;

    document.body.appendChild(menu);

    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.position = 'fixed';

    let top = rect.bottom + 4;
    let left = rect.right - menu.offsetWidth;

    if (left < 0) left = rect.left;
    if (top + menu.offsetHeight > window.innerHeight) {
        top = rect.top - menu.offsetHeight - 4;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

function closeActionsMenu() {
    const menu = document.getElementById('global-actions-menu');
    if (menu) menu.remove();
}

// A generic showAlert. If SweetAlert or similar is used, this can be a wrapper.
// For now, a simple browser alert.
function showAlert(message, type = 'info') { // type can be 'info', 'success', 'error', 'warning'
    console.log(`Alert (${type}): ${message}`);
    // Replace with a more sophisticated UI alert if available, e.g., a toast notification or styled modal
    alert(`${type.toUpperCase()}: ${message}`);
}

// Wrapper for openEditModal, to be called from HTML. AppLogic will have the main openEditModal.
function openEditModalWrapper(key) {
    if (typeof openEditModal === 'function') { // Check if the appLogic version is loaded
        openEditModal(key);
    } else {
        console.error("openEditModal function not found. Ensure appLogic.js is loaded and defines it.");
    }
}
// Similar wrappers for other functions called from dynamically generated HTML:
function deleteEvidenceWrapper(key) {
    if (typeof deleteEvidence === 'function') {
        deleteEvidence(key);
    } else {
        console.error("deleteEvidence function not found.");
    }
}

function handleDeleteBillWrapper(key) {
     if (typeof handleDeleteBill === 'function') {
        handleDeleteBill(key);
    } else {
        console.error("handleDeleteBill function not found.");
    }
}
