// This file will contain core application logic, calculations,
// and orchestration of UI and Firebase services.
console.log("appLogic.js loaded");

// Variables that were previously global, now managed here or locally within functions.
const ITEMS_PER_PAGE = 5; // Used by renderHistoryTable, primarily a UI concern but pagination logic is here.
let currentPage = 1;      // State for pagination.

// State variables that are specific to certain operations, managed locally within relevant functions
// or as module-scoped if multiple functions within appLogic need them directly.
// For example, editingIndex, keyForEvidence, keyToDelete are now effectively local to their workflows.
// let editingIndex = -1; // Example: would be local to saveEdit/openEditModal logic
// let keyForEvidence = null; // Example: would be local to evidence handling functions
// let roomToDelete = null; // Example: local to room deletion functions (was window.roomToDelete)


// --- Initialization and Event Listeners ---
document.addEventListener('DOMContentLoaded', async function() {
    if (document.body.classList.contains('requires-auth')) {
        const user = await checkAuth(); // from auth.js
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        window.currentUser = user; // Ensure currentUser is set globally
        window.currentUserRole = user.role; // Ensure currentUserRole is set globally
        // window.currentUserData is also set in auth.js after getUserData

        updateAuthUI(user); // from auth.js (or could be moved to uiHandlers.js if it's pure UI update)
        initializePageContent();
    }

    // Global click listener for closing action menus (if openActionsMenu is in uiHandlers.js)
    document.addEventListener('click', (event) => {
        if (typeof closeActionsMenu === 'function' &&
            !event.target.closest('#global-actions-menu') &&
            !event.target.closest('[onclick^="openActionsMenu"]')) {
             closeActionsMenu();
        }
    });

    // Initialize Flatpickr for bill date and due date (from index.html inline script)
    if (document.getElementById('bill-date')) {
        flatpickr("#bill-date", {
            dateFormat: "d/m/Y",
            defaultDate: "today",
            theme: "dark" // Assuming Flatpickr dark theme is used
        });
    }
    if (document.getElementById('due-date')) {
        flatpickr("#due-date", {
            dateFormat: "d/m/Y",
            defaultDate: new Date().fp_incr(15), // Default to 15 days from now
            theme: "dark"
        });
    }
    // Initialize Flatpickr for edit modal (from index.html inline script)
    if (document.getElementById('edit-date')) {
        flatpickr("#edit-date", { dateFormat: "d/m/Y", theme: "dark" });
    }
    if (document.getElementById('edit-due-date')) {
        flatpickr("#edit-due-date", { dateFormat: "d/m/Y", theme: "dark" });
    }

    // Event listeners for edit modal input calculations (from index.html inline script)
    const editInputsToWatch = [
        'edit-current', 'edit-previous', 'edit-rate',
        'edit-current-water', 'edit-previous-water', 'edit-water-rate'
    ];
    editInputsToWatch.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', calculateEditTotals);
        }
    });
     // Event listener for calculate rate button in main form (from index.html inline script)
    const calcRateBtn = document.querySelector('button[onclick="calculateRatePerUnit()"]');
    if (calcRateBtn) {
        calcRateBtn.addEventListener('click', calculateRatePerUnit);
        calcRateBtn.removeAttribute('onclick'); // Remove inline handler
    }
    // Event listener for calculate water rate button in main form (from index.html inline script)
    const calcWaterRateBtn = document.querySelector('button[onclick="calculateWaterRatePerUnit()"]');
    if (calcWaterRateBtn) {
        calcWaterRateBtn.addEventListener('click', calculateWaterRatePerUnit);
        calcWaterRateBtn.removeAttribute('onclick');
    }
    // Event listener for main calculate bill button (from index.html inline script)
    const calcBillBtn = document.querySelector('button[onclick="calculateBill()"]');
    if (calcBillBtn){
        calcBillBtn.addEventListener('click', calculateBill);
        calcBillBtn.removeAttribute('onclick');
    }
});

function initializePageContent() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (document.getElementById('home-room-cards') || document.getElementById('level1-owner-tabs-container')) {
        renderHomeRoomCards();

        if (window.currentUserRole === '1') {
            if (typeof initializeLevel1OwnerInterface === 'function') {
                initializeLevel1OwnerInterface(); // Assumes tenantManagement.js is loaded
            } else {
                console.error('initializeLevel1OwnerInterface function not found. Make sure tenantManagement.js is loaded.');
            }
        } else {
            const l1Tabs = document.getElementById('level1-owner-tabs-container');
            if (l1Tabs) l1Tabs.classList.add('hidden');
            const tenantManagementSection = document.getElementById('manage-tenants-content');
            if (tenantManagementSection) tenantManagementSection.classList.add('hidden');
            const myRoomsContent = document.getElementById('my-rooms-content');
            if (myRoomsContent) myRoomsContent.classList.remove('hidden');
        }

        const addRoomBtn = document.getElementById('btn-add-room');
        const closeAddRoomModalBtn = document.getElementById('close-add-room-modal');
        const addRoomModal = document.getElementById('add-room-modal'); // The modal itself
        const addRoomForm = document.getElementById('add-room-form');

        if (addRoomBtn && addRoomModal) { // Check if modal exists too
            if (hasPermission('canAddNewBills')) {
                addRoomBtn.classList.remove('hidden');
                addRoomBtn.addEventListener('click', () => addRoomModal.classList.remove('hidden'));
            } else {
                addRoomBtn.classList.add('hidden');
            }
        }

        if(closeAddRoomModalBtn && addRoomModal) closeAddRoomModalBtn.addEventListener('click', () => addRoomModal.classList.add('hidden'));
        if(addRoomForm) addRoomForm.addEventListener('submit', handleAddRoom); // handleAddRoom is in this file

        if (hasPermission('canUploadEvidence')) { // Permission for current user
            setupEvidenceModalListeners(); // setupEvidenceModalListeners is in this file
        }

    } else if (document.getElementById('history-section')) {
        if (roomParam) {
            document.title = `ประวัติค่าไฟ - ห้อง ${roomParam}`;
            const roomHeader = document.getElementById('room-header');
            if(roomHeader) roomHeader.textContent = `ประวัติค่าไฟ - ห้อง ${roomParam}`;

            renderHistoryTable(roomParam); // from uiHandlers.js
            updatePreviousReadingFromDB(roomParam); // from uiHandlers.js

            if (hasPermission('canUploadEvidence', roomParam)) { // Pass room context for permission
                setupEvidenceModalListeners();
            }
        } else {
            const historySection = document.getElementById('history-section');
            if (historySection) {
                 historySection.innerHTML = `<p class="text-center text-red-400">ไม่พบข้อมูลห้อง</p>`;
            }
        }
    }
}

// --- Bill Calculation Logic ---
function calculateRatePerUnit() { // From index.html inline script
    const totalUnitsInput = document.getElementById('total-units');
    const totalBillInput = document.getElementById('total-all');
    const rateInput = document.getElementById('rate');

    if (!totalUnitsInput || !totalBillInput || !rateInput) return;

    const totalUnits = parseFloat(totalUnitsInput.value);
    const totalBill = parseFloat(totalBillInput.value);

    if(totalUnits > 0 && totalBill > 0) {
        const rate = totalBill / totalUnits;
        rateInput.value = rate.toFixed(4);
    } else {
        rateInput.value = "0"; // Set as string "0" or number 0 based on input type expectation
    }
}

function calculateWaterRatePerUnit() {
    const totalWaterUnitsInput = document.getElementById('total-water-units-household');
    const totalWaterBillInput = document.getElementById('total-water-bill-household');
    const waterRateInput = document.getElementById('water-rate');

    if (!totalWaterUnitsInput || !totalWaterBillInput || !waterRateInput) return;

    const totalWaterUnits = parseFloat(totalWaterUnitsInput.value);
    const totalWaterBill = parseFloat(totalWaterBillInput.value);

    if(totalWaterUnits > 0 && totalWaterBill > 0) {
        const rate = totalWaterBill / totalWaterUnits;
        waterRateInput.value = rate.toFixed(4);
    } else {
        waterRateInput.value = "0";
    }
}

function calculateEditTotals() { // From index.html inline script
    const current = parseFloat(document.getElementById('edit-current').value) || 0;
    const previous = parseFloat(document.getElementById('edit-previous').value) || 0;
    const electricRate = parseFloat(document.getElementById('edit-rate').value) || 0;
    const units = current - previous;
    const total = units * electricRate;

    const currentWater = parseFloat(document.getElementById('edit-current-water').value) || 0;
    const previousWater = parseFloat(document.getElementById('edit-previous-water').value) || 0;
    const waterRate = parseFloat(document.getElementById('edit-water-rate').value) || 0;
    const waterUnits = currentWater - previousWater;
    const waterTotal = waterUnits * waterRate;

    const electricityTotalElement = document.getElementById('edit-electricity-total');
    const waterTotalElement = document.getElementById('edit-water-total');

    if (electricityTotalElement) {
        electricityTotalElement.textContent = `฿${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
    if (waterTotalElement) {
        waterTotalElement.textContent = `฿${waterTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
}

async function calculateBill() {
    const room = new URLSearchParams(window.location.search).get('room');
    if (!hasPermission('canAddNewBills', room)) {
        showAlert('คุณไม่มีสิทธิ์เพิ่มข้อมูลใหม่สำหรับห้องนี้', 'error');
        return;
    }

    const billDate = document.getElementById('bill-date').value;
    const dueDate = document.getElementById('due-date').value;
    const currentReading = parseFloat(document.getElementById('current-reading').value);
    const previousReading = parseFloat(document.getElementById('previous-reading').value);
    const rate = parseFloat(document.getElementById('rate').value);
    const totalAll = parseFloat(document.getElementById('total-all').value) || 0;

    const currentWaterReading = parseFloat(document.getElementById('current-water-reading').value);
    const previousWaterReading = parseFloat(document.getElementById('previous-water-reading').value);
    const totalWaterUnitsHousehold = parseFloat(document.getElementById('total-water-units-household').value) || 0;
    const totalWaterBillHousehold = parseFloat(document.getElementById('total-water-bill-household').value) || 0;
    const waterRate = parseFloat(document.getElementById('water-rate').value);

    if (!billDate || !dueDate || isNaN(currentReading) || isNaN(rate)) {
        showAlert('กรุณากรอกข้อมูลค่าไฟให้ครบถ้วน: วันที่, วันครบกำหนด, เลขมิเตอร์, และเรทค่าไฟ', 'error');
        return;
    }
    if (currentReading < previousReading) {
        showAlert('ค่ามิเตอร์ไฟฟ้าปัจจุบันต้องไม่น้อยกว่าครั้งที่แล้ว', 'error');
        return;
    }

    const waterFieldsEntered = !isNaN(currentWaterReading) || !isNaN(previousWaterReading) || !isNaN(totalWaterUnitsHousehold) || !isNaN(totalWaterBillHousehold) || !isNaN(waterRate);
    if (waterFieldsEntered) {
        if (isNaN(currentWaterReading) || isNaN(waterRate)) {
            showAlert('กรุณากรอกข้อมูลค่าน้ำให้ครบถ้วน: เลขมิเตอร์น้ำปัจจุบัน และ ค่าน้ำ/หน่วย', 'error');
            return;
        }
        if (currentWaterReading < previousWaterReading) {
            showAlert('ค่ามิเตอร์น้ำปัจจุบันต้องไม่น้อยกว่าครั้งที่แล้ว', 'error');
            return;
        }
    }

    const units = currentReading - previousReading;
    const total = units * rate;
    let waterUnits = 0;
    let waterTotal = 0;
    if (waterFieldsEntered && !isNaN(currentWaterReading) && !isNaN(previousWaterReading) && !isNaN(waterRate)) {
        waterUnits = currentWaterReading - previousWaterReading;
        waterTotal = waterUnits * waterRate;
    } else if (waterFieldsEntered && !isNaN(currentWaterReading) && isNaN(previousWaterReading) && !isNaN(waterRate) ) {
         waterUnits = currentWaterReading - 0;
         waterTotal = waterUnits * waterRate;
    }

    const allBills = await loadFromFirebase(); // from firebaseService.js
    const latestEntryForRoom = allBills.find(b => b.room === room) || {};
    const roomName = latestEntryForRoom.name || 'ไม่มีชื่อ';

    const billData = {
        room, name: roomName, date: billDate, dueDate,
        current: currentReading, previous: previousReading, units, rate, total, totalAll,
        currentWater: currentWaterReading || 0, previousWater: previousWaterReading || 0,
        waterUnits: waterUnits || 0, waterRate: waterRate || 0, waterTotal: waterTotal || 0,
        totalWaterBillHousehold: totalWaterBillHousehold || 0,
        totalWaterUnitsHousehold: totalWaterUnitsHousehold || 0,
        createdAt: new Date().toISOString(), paid: false,
        createdBy: auth.currentUser?.uid || 'unknown'
    };

    try {
        const newKey = await saveToFirebase(billData); // from firebaseService.js
        if (newKey) {
            showAlert('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
            document.getElementById('current-reading').value = '';
            // Reset other relevant form fields for water too
            if(document.getElementById('current-water-reading')) document.getElementById('current-water-reading').value = '';

            currentPage = 1;
            renderHistoryTable(room); // from uiHandlers.js
            updatePreviousReadingFromDB(room); // from uiHandlers.js
        }
    } catch (error) {
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
}

// --- Room Management ---
async function handleAddRoom(event) {
    event.preventDefault();
    if (!hasPermission('canAddNewBills')) {
        showAlert('คุณไม่มีสิทธิ์เพิ่มข้อมูลใหม่', 'error');
        return;
    }

    const room = document.getElementById('add-room-room').value.trim();
    const name = document.getElementById('add-room-name').value.trim();
    const date = document.getElementById('add-room-date').value.trim();
    const current = parseFloat(document.getElementById('add-room-current').value) || 0;
    const previous = parseFloat(document.getElementById('add-room-previous').value) || 0;
    const rate = parseFloat(document.getElementById('add-room-rate').value) || 0;
    const totalall = parseFloat(document.getElementById('add-room-totalall').value) || 0;
    const waterCurrent = parseFloat(document.getElementById('add-room-water-current').value) || 0;
    const waterPrevious = parseFloat(document.getElementById('add-room-water-previous').value) || 0;
    const waterRate = parseFloat(document.getElementById('add-room-water-rate').value) || 0;
    const waterTotalall = parseFloat(document.getElementById('add-room-water-totalall').value) || 0;

    if (!room || !name || !date) {
        showAlert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
        return;
    }
    if (current < previous) {
        showAlert('ค่ามิเตอร์ไฟฟ้าปัจจุบันต้องไม่น้อยกว่าครั้งที่แล้ว', 'error');
        return;
    }
    if (waterCurrent < waterPrevious) {
        showAlert('ค่ามิเตอร์น้ำปัจจุบันต้องไม่น้อยกว่าครั้งที่แล้ว', 'error');
        return;
    }

    const units = current - previous;
    const total = units * rate;
    const waterUnits = waterCurrent - waterPrevious;
    const waterTotal = waterUnits * waterRate;

    const newBill = {
        room, name, date, current, previous, units, rate, total, totalall,
        waterCurrent, waterPrevious, waterUnits, waterRate, waterTotal, waterTotalall,
        createdAt: new Date().toISOString(), createdBy: auth.currentUser?.uid || 'unknown'
    };

    try {
        const newBillKey = await saveToFirebase(newBill);
        showAlert('เพิ่มข้อมูลห้องใหม่เรียบร้อยแล้ว', 'success');

        if (window.currentUserRole === '1' && window.currentUser && window.currentUser.uid) {
            const userManagedRoomsRefPath = `users/${window.currentUser.uid}/managedRooms`;
            let managedRooms = await getFirebaseData(userManagedRoomsRefPath) || [];
            if (!Array.isArray(managedRooms)) managedRooms = [];
            if (!managedRooms.includes(newBill.room)) {
                managedRooms.push(newBill.room);
                await updateFirebaseData(userManagedRoomsRefPath, managedRooms); // Use generic update
                console.log(`Room ${newBill.room} added to managedRooms for user ${window.currentUser.uid}`);
                if (window.currentUserData) window.currentUserData.managedRooms = managedRooms;
                if (typeof loadManagedRoomsForTenantModal === 'function' && document.getElementById('add-edit-tenant-modal') && !document.getElementById('add-edit-tenant-modal').classList.contains('hidden')) {
                    loadManagedRoomsForTenantModal();
                }
            }
        }
        const modal = document.getElementById('add-room-modal');
        if(modal) modal.classList.add('hidden');
        document.getElementById('add-room-form').reset();
        renderHomeRoomCards();
    } catch (error) {
        console.error('Error adding room:', error);
        showAlert('เกิดข้อผิดพลาดในการเพิ่มข้อมูล', 'error');
    }
}

async function openEditModal(key) { // Orchestrator for opening edit modal
    try {
        const data = await getFirebaseData(`electricityData/${key}`); // from firebaseService.js
        if (!data) {
            showAlert('ไม่พบข้อมูลที่ต้องการแก้ไข', 'error');
            return;
        }
        if (!hasPermission('canEditAllBills', data.room)) {
            showAlert(`คุณไม่มีสิทธิ์แก้ไขข้อมูลของห้อง ${data.room}`, 'error');
            return;
        }

        editingIndex = key; // Set the global editingIndex (key)

        // Call UI function to populate and show modal
        // This function would exist in uiHandlers.js
        populateAndShowEditModal(data); // populateAndShowEditModal would be in uiHandlers.js
                                      // It would set form values and call calculateEditTotals
                                      // For now, direct DOM manipulation stays here until uiHandlers.js is complete
        document.getElementById('edit-key').value = key;
        document.getElementById('edit-date').value = data.date || '';
        document.getElementById('edit-due-date').value = data.dueDate || '';
        document.getElementById('edit-current').value = data.current || '';
        document.getElementById('edit-previous').value = data.previous || '';
        document.getElementById('edit-rate').value = data.rate || '';
        document.getElementById('edit-total-all').value = data.totalAll || '';
        document.getElementById('edit-current-water').value = data.currentWater || '';
        document.getElementById('edit-previous-water').value = data.previousWater || '';
        document.getElementById('edit-water-rate').value = data.waterRate || '';
        document.getElementById('edit-total-water-bill-household').value = data.totalWaterBillHousehold || '';

        const modal = document.getElementById('edit-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        calculateEditTotals(); // Call calculation after populating

    } catch (error) {
        console.error('Error opening edit modal:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    }
}


async function saveEdit() {
    if (editingIndex === -1) {
        showAlert('ไม่พบข้อมูลที่ต้องการแก้ไข (No editing index)', 'error');
        return;
    }

    try {
        const originalData = await getFirebaseData(`electricityData/${editingIndex}`);
        if (!originalData) {
            showAlert('ไม่พบข้อมูลเดิมที่ต้องการแก้ไข', 'error');
            editingIndex = -1;
            if(typeof closeModal === 'function') closeModal(); // closeModal from uiHandlers.js
            else document.getElementById('edit-modal').classList.add('hidden');
            return;
        }

        if (!hasPermission('canEditAllBills', originalData.room)) {
            showAlert(`คุณไม่มีสิทธิ์บันทึกการแก้ไขข้อมูลของห้อง ${originalData.room}`, 'error');
            return;
        }

        const date = document.getElementById('edit-date').value;
        const dueDate = document.getElementById('edit-due-date').value;
        const current = parseFloat(document.getElementById('edit-current').value) || 0;
        const previous = parseFloat(document.getElementById('edit-previous').value) || 0;
        const rate = parseFloat(document.getElementById('edit-rate').value) || 0;
        const totalAll = parseFloat(document.getElementById('edit-total-all').value) || 0;
        const currentWater = parseFloat(document.getElementById('edit-current-water').value) || 0;
        const previousWater = parseFloat(document.getElementById('edit-previous-water').value) || 0;
        const waterRateValue = parseFloat(document.getElementById('edit-water-rate').value) || 0; // Renamed to avoid conflict
        const totalWaterBillHousehold = parseFloat(document.getElementById('edit-total-water-bill-household').value) || 0;

        if (!date || !dueDate) {
            showAlert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
            return;
        }

        const units = current - previous;
        const total = units * rate;
        const waterUnits = currentWater - previousWater;
        const waterTotal = waterUnits * waterRateValue;

        const updateData = {
            date, dueDate, current, previous, units, rate, total, totalAll,
            currentWater, previousWater, waterUnits, waterRate: waterRateValue, waterTotal, totalWaterBillHousehold,
            updatedAt: new Date().toISOString(), updatedBy: auth.currentUser?.uid || 'unknown'
        };

        await updateFirebaseData(`electricityData/${editingIndex}`, updateData); // from firebaseService.js
        showAlert('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success');

        if(typeof closeModal === 'function') closeModal();
        else document.getElementById('edit-modal').classList.add('hidden');


        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        if (roomParam) {
            renderHistoryTable(roomParam);
            updatePreviousReadingFromDB(roomParam);
        } else {
            renderHomeRoomCards();
        }
        editingIndex = -1;
    } catch (error) {
        console.error('Error saving edit:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
}

async function migrateOldData() { // Orchestrator
    if (!hasPermission('canManageUsers')) {
        showAlert('คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้', 'error');
        return;
    }
    // Confirmation UI should be handled by showConfirmModal (from uiHandlers.js)
    showConfirmModal({
        title: 'ยืนยันการอัปเดตข้อมูลเก่า',
        text: 'คุณต้องการอัปเดตข้อมูลเก่าทั้งหมดที่ไม่มีการระบุห้องหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
        confirmButtonText: 'อัปเดต',
        onConfirm: async () => {
            showAlert('กำลังเริ่มกระบวนการอัปเดตข้อมูลเก่า...', 'info');
            try {
                const result = await migrateOldDataToFirebase(); // from firebaseService.js
                showAlert(result.message, result.migrated ? 'success' : 'info');
                if (result.migrated) {
                    renderHomeRoomCards(); // Refresh view
                }
            } catch (error) {
                showAlert(`เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ${error.message}`, 'error');
            }
        }
    });
}


// --- Navigation ---
function viewRoomHistory(room) {
    if (!hasPermission('canViewHistory', room)) { // Check permission for specific room
        showAlert('คุณไม่มีสิทธิ์ดูประวัติข้อมูลของห้องนี้', 'error');
        return;
    }
    window.location.href = `index.html?room=${encodeURIComponent(room)}`;
}

// --- Evidence Handling Orchestration ---
function setupEvidenceModalListeners() {
    const dropzone = document.getElementById('evidence-dropzone');
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    const saveBtn = document.getElementById('evidence-save-btn');
    const clearBtn = document.getElementById('evidence-clear-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const galleryBtn = document.getElementById('gallery-btn');
    const fileBtn = document.getElementById('file-btn');

    if (cameraBtn && cameraInput) cameraBtn.addEventListener('click', () => cameraInput.click());
    if (galleryBtn && fileInput) galleryBtn.addEventListener('click', () => fileInput.click());
    if (fileBtn && fileInput) fileBtn.addEventListener('click', () => fileInput.click());
    if (clearBtn) clearBtn.addEventListener('click', clearEvidenceSelection);
    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-blue-500', 'bg-slate-700');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-blue-500', 'bg-slate-700'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-blue-500', 'bg-slate-700');
            if (e.dataTransfer.files.length) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(e.dataTransfer.files[0]);
                fileInput.files = dataTransfer.files;
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
    }
    if (fileInput) fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFileSelect(fileInput.files[0]);
    });
    if (cameraInput) cameraInput.addEventListener('change', () => {
        if (cameraInput.files.length) handleFileSelect(cameraInput.files[0]);
    });
    if (saveBtn) saveBtn.addEventListener('click', handleEvidenceUpload);
}

function handleFileSelect(file) { // Manages UI state for file selection in evidence modal
    const preview = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const saveBtn = document.getElementById('evidence-save-btn');
    const errorMsg = document.getElementById('evidence-error');

    if (!preview || !placeholder || !saveBtn || !errorMsg) return;
    errorMsg.textContent = '';

    if (!file.type.startsWith('image/')) {
        errorMsg.textContent = 'กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF)';
        saveBtn.disabled = true; return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB
        errorMsg.textContent = 'ขนาดไฟล์ต้องไม่เกิน 5MB';
        saveBtn.disabled = true; return;
    }
    if (file.name.length > 100) {
        errorMsg.textContent = 'ชื่อไฟล์ต้องไม่เกิน 100 ตัวอักษร';
        saveBtn.disabled = true; return;
    }

    const fileSize = (file.size / 1024 / 1024).toFixed(2);
    const objectURL = URL.createObjectURL(file);
    preview.innerHTML = `
        <div class="w-full max-w-sm">
            <img src="${objectURL}" class="w-full h-40 object-cover rounded-lg mb-3 border border-slate-600" onload="URL.revokeObjectURL(this.src)">
            <div class="bg-slate-700/50 rounded-lg p-3 space-y-1">
                <div class="flex justify-between text-sm"><span class="text-slate-400">ชื่อไฟล์:</span><span class="text-white font-medium truncate ml-2">${file.name}</span></div>
                <div class="flex justify-between text-sm"><span class="text-slate-400">ขนาด:</span><span class="text-green-400 font-medium">${fileSize} MB</span></div>
                <div class="flex justify-between text-sm"><span class="text-slate-400">ประเภท:</span><span class="text-blue-400 font-medium">${file.type}</span></div>
            </div>
        </div>`;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
}

function clearEvidenceSelection() {
    const preview = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const saveBtn = document.getElementById('evidence-save-btn');
    const errorMsg = document.getElementById('evidence-error');
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
}


async function handleEvidenceUpload() {
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    let file = (fileInput && fileInput.files.length > 0) ? fileInput.files[0] :
               ((cameraInput && cameraInput.files.length > 0) ? cameraInput.files[0] : null);

    if (!file) { showAlert('กรุณาเลือกไฟล์รูปภาพก่อน', 'error'); return; }
    if (!keyForEvidence) { showAlert('เกิดข้อผิดพลาด: ไม่พบข้อมูลที่ต้องการแนบหลักฐาน', 'error'); return; }

    let billData;
    try {
        billData = await getFirebaseData(`electricityData/${keyForEvidence}`);
        if (!billData || !billData.room) {
            showAlert('ไม่พบข้อมูลห้องสำหรับบิลนี้ ไม่สามารถตรวจสอบสิทธิ์ได้', 'error'); return;
        }
        if (!hasPermission('canUploadEvidence', billData.room)) {
            showAlert(`คุณไม่มีสิทธิ์อัปโหลดหลักฐานสำหรับห้อง ${billData.room}`, 'error'); return;
        }
    } catch (error) {
        showAlert('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์อัปโหลด', 'error'); return;
    }

    // UI updates for upload start (from uiHandlers.js or directly if simple enough)
    const saveBtn = document.getElementById('evidence-save-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const uploadStatusEl = document.getElementById('upload-status'); // Renamed from uploadStatus
    const uploadPercentage = document.getElementById('upload-percentage');
    const uploadFilename = document.getElementById('upload-filename');
    const errorMsg = document.getElementById('evidence-error');

    if(saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>กำลังอัปโหลด...';}
    if(progressContainer) progressContainer.classList.remove('hidden');
    if(uploadStatusEl) uploadStatusEl.classList.remove('hidden');
    if(progressBar) progressBar.style.width = '0%';
    if(uploadPercentage) uploadPercentage.textContent = '0%';
    if(uploadFilename) uploadFilename.textContent = file.name;
    if(errorMsg) errorMsg.textContent = '';

    try {
        const timestamp = Date.now();
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${sanitizedFileName}`;
        const storagePath = `evidence/${keyForEvidence}/${fileName}`;
        const metadata = {
            contentType: file.type,
            customMetadata: { originalName: file.name, uploadedBy: auth.currentUser?.uid || 'unknown', uploadedAt: new Date().toISOString(), billKey: keyForEvidence }
        };

        const uploadTask = await uploadFileToStorage(storagePath, file, metadata); // from firebaseService.js

        uploadTask.on('state_changed',
            (snapshot) => { // Progress
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if(progressBar) progressBar.style.width = progress + '%';
                if(uploadPercentage) uploadPercentage.textContent = `${Math.round(progress)}%`;
                if(uploadFilename) uploadFilename.textContent = progress < 100 ? `กำลังอัปโหลด ${file.name}...` : `อัปโหลดเสร็จสิ้น - ${file.name}`;
            },
            (error) => { // Error
                console.error('Upload error in task:', error);
                if(errorMsg) errorMsg.textContent = error.message;
                showAlert(`เกิดข้อผิดพลาดในการอัปโหลด: ${error.message}`, 'error');
                if(saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; }
                if(progressContainer) progressContainer.classList.add('hidden');
                if(uploadStatusEl) uploadStatusEl.classList.add('hidden');
            },
            async () => { // Complete
                try {
                    const downloadURL = await getDownloadURLFromStorage(uploadTask.snapshot); // from firebaseService.js
                    const dbUpdateData = {
                        evidenceUrl: downloadURL, evidenceUploadedAt: new Date().toISOString(), evidenceFileName: fileName,
                        evidenceFileSize: file.size, evidenceFileType: file.type, evidenceUploadedBy: auth.currentUser?.uid || 'unknown'
                    };
                    await updateFirebaseData(`electricityData/${keyForEvidence}`, dbUpdateData); // from firebaseService.js

                    showAlert('อัปโหลดหลักฐานสำเร็จ!', 'success');
                    if(typeof closeEvidenceModal === 'function') closeEvidenceModal(); // from uiHandlers.js
                    else document.getElementById('evidence-modal').classList.add('hidden');

                    const roomForRefresh = new URLSearchParams(window.location.search).get('room');
                    if (roomForRefresh) renderHistoryTable(roomForRefresh);
                    else renderHomeRoomCards();
                } catch (dbOrUrlError) {
                    console.error('Error getting URL or updating DB:', dbOrUrlError);
                    if(errorMsg) errorMsg.textContent = dbOrUrlError.message;
                    showAlert(`เกิดข้อผิดพลาดหลังอัปโหลด: ${dbOrUrlError.message}`, 'error');
                } finally {
                     if(saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; }
                     if(progressContainer) progressContainer.classList.add('hidden');
                     if(uploadStatusEl) uploadStatusEl.classList.add('hidden');
                }
            }
        );
    } catch (uploadError) { // Catch errors from uploadFileToStorage itself
        console.error("Initial upload failed:", uploadError);
        if(errorMsg) errorMsg.textContent = uploadError.message;
        showAlert(uploadError.message, 'error');
        if(saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; }
        if(progressContainer) progressContainer.classList.add('hidden');
        if(uploadStatusEl) uploadStatusEl.classList.add('hidden');
    }
}

async function deleteEvidence(key) {
    if (!key) { showAlert('ไม่พบข้อมูล (key) ที่ต้องการลบหลักฐาน', 'error'); return; }
    try {
        const data = await getFirebaseData(`electricityData/${key}`);
        if (!data || !data.room) { showAlert('ไม่พบข้อมูลห้องสำหรับบิลนี้', 'error'); return; }
        if (data.paymentConfirmed === true) { showAlert('ไม่สามารถลบหลักฐานได้ ยืนยันการชำระเงินแล้ว', 'error'); return; }
        if (!hasPermission('canUploadEvidence', data.room)) { // Using canUploadEvidence as canDeleteEvidence
            showAlert(`คุณไม่มีสิทธิ์ลบหลักฐานสำหรับห้อง ${data.room}`, 'error'); return;
        }
        if (!data.evidenceUrl) { showAlert('ไม่พบหลักฐานที่ต้องการลบ', 'info'); return; }

        showConfirmModal({
            title: 'ยืนยันการลบหลักฐาน',
            text: 'คุณแน่ใจหรือไม่ว่าต้องการลบหลักฐานนี้? การกระทำนี้ไม่สามารถย้อนกลับได้',
            confirmButtonText: 'ใช่, ลบเลย',
            confirmButtonClass: 'bg-orange-600 hover:bg-orange-700',
            onConfirm: async () => {
                try {
                    if (data.evidenceUrl) await deleteFileFromStorage(data.evidenceUrl); // from firebaseService.js
                    const dbUpdate = {
                        evidenceUrl: null, evidenceFileName: null, evidenceFileSize: null, evidenceFileType: null,
                        evidenceUploadedAt: null, evidenceUploadedBy: null,
                        evidenceDeletedAt: new Date().toISOString(), evidenceDeletedBy: auth.currentUser?.uid || 'unknown'
                    };
                    await updateFirebaseData(`electricityData/${key}`, dbUpdate); // from firebaseService.js
                    showAlert('ลบหลักฐานเรียบร้อยแล้ว', 'success');
                    const room = new URLSearchParams(window.location.search).get('room');
                    if (room) renderHistoryTable(room); else renderHomeRoomCards();
                } catch (error) {
                    console.error('Error during evidence deletion process:', error);
                    showAlert(`เกิดข้อผิดพลาดในการลบหลักฐาน: ${error.message}`, 'error');
                }
            }
        });
    } catch (error) {
        console.error('Error preparing to delete evidence:', error);
        showAlert('เกิดข้อผิดพลาดในการเตรียมลบหลักฐาน', 'error');
    }
}


// --- Payment Confirmation ---
async function confirmPayment(key) {
    if (!key) { showAlert('ไม่พบข้อมูล (key) ที่ต้องการยืนยันการชำระเงิน', 'error'); return; }
    try {
        const data = await getFirebaseData(`electricityData/${key}`);
        if (!data || !data.room) { showAlert('ไม่พบข้อมูลห้องสำหรับบิลนี้', 'error'); return; }
        if (data.paymentConfirmed === true) { showAlert('การชำระเงินได้รับการยืนยันแล้ว', 'info'); return; }
        if (!data.evidenceUrl) { showAlert('ไม่พบหลักฐานการชำระเงิน', 'error'); return; }
        if (!hasPermission('canConfirmPayment', data.room)) {
            showAlert(`คุณไม่มีสิทธิ์ยืนยันการชำระเงินสำหรับห้อง ${data.room}`, 'error'); return;
        }

        showConfirmModal({
            title: 'ยืนยันการชำระเงิน',
            text: 'หลังจากยืนยันแล้ว ลูกบ้านจะไม่สามารถลบหลักฐานได้อีกต่อไป คุณแน่ใจหรือไม่?',
            confirmButtonText: 'ยืนยันการชำระเงิน',
            confirmButtonClass: 'bg-emerald-600 hover:bg-emerald-700',
            onConfirm: async () => {
                try {
                    await updateFirebaseData(`electricityData/${key}`, {
                        paymentConfirmed: true,
                        paymentConfirmedAt: new Date().toISOString(),
                        paymentConfirmedBy: auth.currentUser?.uid || 'unknown'
                    });
                    showAlert('ยืนยันการชำระเงินเรียบร้อยแล้ว', 'success');
                    const room = new URLSearchParams(window.location.search).get('room');
                    if (room) renderHistoryTable(room); else renderHomeRoomCards();
                } catch (error) {
                    showAlert('เกิดข้อผิดพลาดในการยืนยันการชำระเงิน', 'error');
                }
            }
        });
    } catch (error) {
        showAlert('เกิดข้อผิดพลาดในการเตรียมยืนยันการชำระเงิน', 'error');
    }
}

// --- QR Code Generation (Orchestration) ---
function generateQRCode(record) { // record is the bill object
    if (!record || !record.room) { showAlert('ไม่พบข้อมูลที่ถูกต้องสำหรับสร้าง QR Code', 'error'); return; }
    if (!hasPermission('canGenerateQRCode', record.room)) {
        showAlert(`คุณไม่มีสิทธิ์สร้าง QR Code สำหรับห้อง ${record.room}`, 'error'); return;
    }

    // Call a function in uiHandlers.js to render the QR code modal content
    // For now, the logic from script.js is mostly here. uiHandlers will eventually get the DOM parts.
    const promptPayId = '3101700701928'; // Make configurable if needed
    const electricAmount = parseFloat(record.total) || 0;
    const waterAmount = parseFloat(record.waterTotal) || 0;
    const totalAmount = electricAmount + waterAmount;
    const canGenerateQR = !isNaN(totalAmount) && totalAmount > 0;

    let qrCodeImageHTML = '';
    let qrCodeCaptionHTML = '';

    if (canGenerateQR && window.ThaiQRCode && typeof qrcode === 'function') {
        const payload = window.ThaiQRCode.generatePayload(promptPayId, { amount: totalAmount });
        const qr = qrcode(0, 'M');
        qr.addData(payload);
        qr.make();
        qrCodeImageHTML = `<div class="bg-white p-2 rounded-lg inline-block">${qr.createImgTag(5, 4)}</div>`;
        qrCodeCaptionHTML = `<p class="text-sm font-semibold text-slate-400 mt-2">สแกนเพื่อชำระเงินรวม (ค่าไฟ + ค่าน้ำ)</p>`;
    } else {
        qrCodeImageHTML = `<div class="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert"><p class="font-bold">ไม่สามารถสร้าง QR Code ได้</p><p>ยอดชำระรวมไม่ถูกต้อง (฿${totalAmount.toFixed(2)}) หรือไลบรารี QR ไม่พร้อมใช้งาน</p></div>`;
    }

    // This part should ideally be in uiHandlers.js
    const receiptContainer = document.getElementById('receipt-container');
    if (!receiptContainer) { console.error("Receipt container not found"); return; }

    // Formatting data for display
    const dateParts = record.date.split('/');
    const billDateObj = new Date(parseInt(dateParts[2], 10) - 543, parseInt(dateParts[1], 10) - 1, parseInt(dateParts[0], 10));
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const displayDate = !isNaN(billDateObj.getTime()) ? `${dateParts[0]}/${dateParts[1]}/${parseInt(dateParts[2])}` : "N/A";
    const monthName = !isNaN(billDateObj.getTime()) ? thaiMonths[billDateObj.getMonth()] : "";
    const year = !isNaN(billDateObj.getTime()) ? billDateObj.getFullYear() + 543 : "";
    const summaryText = `ค่าบริการห้อง ${record.room} (${record.name || ''}) ประจำเดือน ${monthName} ${year}`;
    const hasWaterBill = (record.waterTotal && parseFloat(record.waterTotal) > 0);

    receiptContainer.innerHTML = `
        <div id="receipt-content" class="bg-white text-gray-800 rounded-lg p-6 shadow-lg" style="font-family: 'Kanit', sans-serif; max-width: 400px; margin: auto;">
            <div class="text-center mb-6"><h3 class="text-xl font-bold text-gray-900">ใบแจ้งค่าบริการ</h3><p class="text-gray-500 text-sm">${summaryText}</p></div>
            <div class="bg-gray-50 rounded-lg p-4 mb-4">
                <p class="text-sm text-gray-600">ห้อง</p><p class="text-2xl font-bold text-indigo-600">${record.room} - ${record.name || 'ไม่มีชื่อ'}</p>
                <p class="text-sm text-gray-500 mt-2">วันที่จด: ${displayDate}</p>
                ${record.dueDate ? `<p class="text-sm text-gray-500">ครบกำหนดชำระ: ${record.dueDate}</p>` : ''}
            </div>
            <div class="border-t border-gray-200 pt-4 mt-4">
                <h4 class="font-semibold text-gray-700 mb-2">รายละเอียดค่าไฟฟ้า</h4>
                <div class="space-y-1 text-sm">
                    <div class="flex justify-between"><span class="text-gray-600">มิเตอร์ปัจจุบัน:</span><span class="font-mono font-medium">${record.current} หน่วย</span></div>
                    <div class="flex justify-between"><span class="text-gray-600">มิเตอร์ครั้งที่แล้ว:</span><span class="font-mono font-medium">${record.previous} หน่วย</span></div>
                    <div class="flex justify-between font-semibold"><span class="text-gray-700">หน่วยที่ใช้:</span><span class="font-mono text-indigo-600">${record.units} หน่วย</span></div>
                    <div class="flex justify-between"><span class="text-gray-600">อัตราต่อหน่วย:</span><span class="font-mono font-medium">${parseFloat(record.rate || 0).toFixed(2)} บาท</span></div>
                    <div class="flex justify-between font-bold text-base pt-1"><span class="text-gray-800">รวมค่าไฟฟ้า:</span><span class="font-mono text-indigo-700">฿${electricAmount.toFixed(2)}</span></div>
                </div>
            </div>
            ${hasWaterBill ? `
            <div class="border-t border-gray-200 pt-4 mt-4">
                <h4 class="font-semibold text-gray-700 mb-2">รายละเอียดค่าน้ำ</h4>
                <div class="space-y-1 text-sm">
                    <div class="flex justify-between"><span class="text-gray-600">มิเตอร์น้ำปัจจุบัน:</span><span class="font-mono font-medium">${record.currentWater || 0} หน่วย</span></div>
                    <div class="flex justify-between"><span class="text-gray-600">มิเตอร์น้ำครั้งที่แล้ว:</span><span class="font-mono font-medium">${record.previousWater || 0} หน่วย</span></div>
                    <div class="flex justify-between font-semibold"><span class="text-gray-700">หน่วยน้ำที่ใช้:</span><span class="font-mono text-indigo-600">${record.waterUnits || 0} หน่วย</span></div>
                    <div class="flex justify-between"><span class="text-gray-600">อัตราน้ำต่อหน่วย:</span><span class="font-mono font-medium">${parseFloat(record.waterRate || 0).toFixed(2)} บาท</span></div>
                    <div class="flex justify-between font-bold text-base pt-1"><span class="text-gray-800">รวมค่าน้ำ:</span><span class="font-mono text-indigo-700">฿${waterAmount.toFixed(2)}</span></div>
                </div>
            </div>` : ''}
            <div class="bg-indigo-50 rounded-lg p-4 mt-6 text-center"><p class="text-sm font-semibold text-indigo-800">ยอดชำระทั้งหมด</p><h2 class="text-4xl font-bold text-indigo-900 tracking-tight my-1">฿${totalAmount.toFixed(2)}</h2></div>
            <div class="flex flex-col items-center justify-center mt-6">${qrCodeImageHTML}${qrCodeCaptionHTML}</div>
            <div class="text-xs text-gray-400 mt-6 text-center border-t border-gray-200 pt-2"><p>กรุณาชำระเงินภายในวันที่กำหนด</p></div>
        </div>`;

    const downloadBtn = document.getElementById('download-qr-btn');
    if (downloadBtn) {
        downloadBtn.style.display = 'flex';
        downloadBtn.onclick = () => {
            const receiptElement = document.getElementById('receipt-content');
            if (window.html2canvas && receiptElement) {
                html2canvas(receiptElement, { scale: 3, backgroundColor: window.getComputedStyle(receiptElement).backgroundColor, useCORS: true })
                    .then(canvas => {
                        const link = document.createElement('a');
                        link.href = canvas.toDataURL('image/png');
                        link.download = `bill-receipt-room-${record.room}-${record.date.replace(/\//g, '-')}.png`;
                        link.click();
                    }).catch(err => console.error('Error rendering receipt:', err));
            } else { console.error('html2canvas or receiptElement not available.'); }
        };
    }

    const modal = document.getElementById('qr-code-modal');
    if(modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      const focusable = modal.querySelector('[onclick="closeQrCodeModal()"]');
      if(focusable) focusable.focus();
    }
}


// --- Bill Deletion Orchestration ---
async function handleDeleteBill(key) {
    if (!key) { showAlert('ไม่พบข้อมูลที่ต้องการลบ', 'error'); return; }
    try {
        const billData = await getFirebaseData(`electricityData/${key}`);
        if (!billData) { showAlert('ไม่พบข้อมูลที่ต้องการลบแล้ว', 'warning'); return; }
        if (!hasPermission('canDeleteBills', billData.room)) {
            showAlert(`คุณไม่มีสิทธิ์ลบข้อมูลของห้อง ${billData.room}`, 'error'); return;
        }
        if (billData.paymentConfirmed === true && window.currentUserRole !== 'admin' && window.currentUserRole !== '1') {
            showAlert('ไม่สามารถลบข้อมูลได้ ยืนยันการชำระเงินแล้ว', 'error'); return;
        }

        showConfirmModal({
            title: 'ยืนยันการลบบิล',
            text: `คุณแน่ใจหรือไม่ว่าต้องการลบบิลของวันที่ ${billData.date}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
            confirmButtonText: 'ลบทิ้ง',
            confirmButtonClass: 'bg-red-600 hover:bg-red-700',
            onConfirm: async () => {
                try {
                    await removeFirebaseData(`electricityData/${key}`); // from firebaseService.js
                    showAlert('ลบข้อมูลเรียบร้อยแล้ว', 'success');
                    currentPage = 1;
                    const room = new URLSearchParams(window.location.search).get('room');
                    if (room) {
                        renderHistoryTable(room);
                        updatePreviousReadingFromDB(room);
                    } else {
                        renderHomeRoomCards();
                    }
                } catch (error) {
                    showAlert('เกิดข้อผิดพลาดในการลบข้อมูลจากฐานข้อมูล', 'error');
                }
            }
        });
    } catch (error) {
        showAlert('เกิดข้อผิดพลาดในการเตรียมลบบิล', 'error');
    }
}


// --- Room Name/Deletion Orchestration ---
async function saveRoomNameEdit() {
    const roomNumberInput = document.getElementById('edit-room-number-modal-input'); // Ensure this ID is unique
    const newNameInput = document.getElementById('edit-room-name-modal-input'); // Ensure this ID is unique
    if(!roomNumberInput || !newNameInput) {
        showAlert('ไม่พบช่องข้อมูลสำหรับแก้ไขชื่อห้อง', 'error');
        return;
    }
    const roomNumber = roomNumberInput.value;
    const newName = newNameInput.value.trim();

    if (!hasPermission('canEditAllBills', roomNumber)) { // Check permission for specific room or general if roomNumber is not for context
        showAlert('คุณไม่มีสิทธิ์แก้ไขข้อมูล', 'error'); return;
    }
    if (!newName) { showAlert('กรุณากรอกชื่อผู้เช่า', 'error'); return; }

    try {
        const allBills = await loadFromFirebase(); // Load all bills
        const roomBills = allBills.filter(bill => bill.room === roomNumber);
        if (roomBills.length === 0) { /*showAlert('ไม่พบข้อมูลห้องนี้', 'error');*/ /* No bills to update name on, but maybe room exists elsewhere? */ }

        const updates = {};
        roomBills.forEach(bill => { updates[`/electricityData/${bill.key}/name`] = newName; });

        // If room names are also stored in a /rooms/{roomNumber}/name path, update that too.
        // For now, only updating bills.
        if (Object.keys(updates).length > 0) {
            await updateFirebaseData('', updates); // Update multiple paths at once
        }

        showAlert('แก้ไขชื่อห้องเรียบร้อยแล้ว (เฉพาะในรายการบิล)', 'success');
        if(typeof closeEditRoomNameModal === 'function') closeEditRoomNameModal(); // from uiHandlers.js
        else document.getElementById('edit-room-name-modal').classList.add('hidden');
        renderHomeRoomCards();
    } catch (error) {
        console.error('Error updating room name:', error);
        showAlert('เกิดข้อผิดพลาดในการแก้ไขชื่อห้อง', 'error');
    }
}

async function confirmDeleteRoom() { // Orchestrator for deleting all bills of a room
    const roomNumber = window.roomToDelete; // This global needs to be set by openDeleteRoomConfirmModalUI
    if (!roomNumber) { showAlert('ไม่พบข้อมูลห้องที่ต้องการลบ', 'error'); return; }
    if (!hasPermission('canDeleteBills', roomNumber)) { // Check permission for specific room
        showAlert('คุณไม่มีสิทธิ์ลบข้อมูลห้องนี้', 'error'); return;
    }

    try {
        const allBills = await loadFromFirebase();
        const roomBillsToDelete = allBills.filter(bill => bill.room === roomNumber);

        if (roomBillsToDelete.length === 0) {
            showAlert('ไม่พบข้อมูลบิลสำหรับห้องนี้', 'info');
             if(typeof closeDeleteRoomConfirmModal === 'function') closeDeleteRoomConfirmModal();
             else {
                const modal = document.getElementById('delete-room-confirm-modal');
                if(modal) modal.classList.add('hidden');
             }
            window.roomToDelete = null;
            return;
        }

        const deletePromises = roomBillsToDelete.map(bill => removeFirebaseData(`electricityData/${bill.key}`));
        await Promise.all(deletePromises);

        showAlert(`ลบห้อง ${roomNumber} และข้อมูลบิลทั้งหมดเรียบร้อยแล้ว`, 'success');
        if(typeof closeDeleteRoomConfirmModal === 'function') closeDeleteRoomConfirmModal();
        else {
            const modal = document.getElementById('delete-room-confirm-modal');
            if(modal) modal.classList.add('hidden');
        }
        window.roomToDelete = null;
        renderHomeRoomCards();
    } catch (error) {
        console.error('Error deleting room bills:', error);
        showAlert('เกิดข้อผิดพลาดในการลบข้อมูลห้อง', 'error');
    }
}

// Functions to be called by UI Handlers (wrappers for modals that set global state like keyToDelete)
function openDeleteRoomConfirmModalWrapper(roomNumber) {
    if (!hasPermission('canDeleteBills', roomNumber)) {
        showAlert('คุณไม่มีสิทธิ์ลบข้อมูลห้องนี้', 'error');
        return;
    }
    window.roomToDelete = roomNumber; // Set global context for confirmDeleteRoom
    // Call the UI function from uiHandlers.js
    if(typeof openDeleteRoomConfirmModalUI === 'function') openDeleteRoomConfirmModalUI(roomNumber);
    else {
        // Fallback or error if uiHandlers.js isn't loaded correctly
        const modal = document.getElementById('delete-room-confirm-modal');
        if(modal) {
             document.getElementById('delete-room-number-modal-display').textContent = roomNumber; // Assuming ID from uiHandlers
             modal.classList.remove('hidden');
        } else {
            console.error("openDeleteRoomConfirmModalUI not found and fallback modal structure missing.");
        }
    }
}

function openEditRoomNameModalWrapper(roomNumber, currentName) {
     if (!hasPermission('canEditAllBills', roomNumber) ) {
        showAlert('คุณไม่มีสิทธิ์แก้ไขชื่อห้องนี้', 'error');
        return;
    }
    // Call the UI function from uiHandlers.js
    if(typeof openEditRoomNameModalUI === 'function') openEditRoomNameModalUI(roomNumber, currentName);
    else {
        // Fallback or error
         const modal = document.getElementById('edit-room-name-modal');
         if(modal) {
            document.getElementById('edit-room-number-modal-input').value = roomNumber;
            document.getElementById('edit-room-name-modal-input').value = currentName;
            modal.classList.remove('hidden');
         } else {
            console.error("openEditRoomNameModalUI not found and fallback modal structure missing.");
         }
    }
}

function openEvidenceModalWrapper(key) {
    // Permission check should be done before calling the UI function if possible,
    // or the UI function itself can do a preliminary check if it has enough context.
    // For now, assume permission is handled or re-checked if necessary.
    const roomOfBill = ""; // This needs to be fetched or passed if permission is room-specific
    if (!hasPermission('canUploadEvidence', roomOfBill)) { // Pass room if available for context
         showAlert('คุณไม่มีสิทธิ์แนบหลักฐาน', 'error');
         return;
    }
    keyForEvidence = key; // Set global context
    if(typeof openEvidenceModalUI === 'function') openEvidenceModalUI(key);
    else {
        const modal = document.getElementById('evidence-modal');
        if(modal) modal.classList.remove('hidden');
        // Reset modal UI elements directly here if openEvidenceModalUI is not available
        // This is a simplified fallback
        const preview = document.getElementById('evidence-preview');
        if(preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
        const placeholder = document.getElementById('evidence-placeholder');
        if(placeholder) placeholder.classList.remove('hidden');
        const saveBtn = document.getElementById('evidence-save-btn');
        if(saveBtn) saveBtn.disabled = true;

    }
}

// Change page function for pagination (called by UI buttons)
function changePage(page) {
    currentPage = page;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) { // If on a room-specific page
        renderHistoryTable(room); // renderHistoryTable is in uiHandlers.js
    } else {
        // Handle pagination on other pages if applicable, e.g., home page if it had paginated content
        console.log("Pagination attempt on non-history page or room not specified.");
    }
}
