/*
    This script handles the core functionality of the Electricity Bill Calculator.
    It relies on auth.js for authentication and permission handling.
*/

// Global variables
const ITEMS_PER_PAGE = 5;
let currentPage = 1;
let editingIndex = -1;
let allHistoryData = []; // This will hold all data for the current room, for sorting
let keyForEvidence = null; // For evidence upload modal
let keyToDelete = null; // For delete confirmation modal

// --- Authentication & Initialization ---

document.addEventListener('DOMContentLoaded', async function() {
    // This check is for all pages that require authentication
    // Add the 'requires-auth' class to the body tag of pages that need it.
    if (document.body.classList.contains('requires-auth')) {
        // checkAuth() now resolves with the user object or null
        const user = await checkAuth(); // from auth.js
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        
        // Set global user variables (already done in auth.js, but ensure consistency)
        window.currentUser = user;
        window.currentUserRole = user.role;
        // window.currentUserData is also set in auth.js after getUserData

        // Update UI elements like navbar, user profile icon etc.
        updateAuthUI(user); // Pass the user object to updateAuthUI

        // Load page-specific data after authentication is confirmed
        initializePageContent();
    }

    // Add a global click listener to close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        // Check if the click is on the dropdown itself or its trigger
        if (!event.target.closest('#global-actions-menu') && !event.target.closest('[onclick^="openActionsMenu"]')) {
             closeActionsMenu();
        }
    });

    // Initialize Flatpickr for date fields
    initializeFlatpickr();
});

// Initialize Flatpickr date pickers
function initializeFlatpickr() {
    const commonOptions = {
        dateFormat: "d/m/Y",
        altInput: true,
        altFormat: "j F Y",
        locale: "th",
        allowInput: true
    };

    flatpickr("#add-room-date", commonOptions);
    flatpickr("#add-room-due-date", commonOptions);
}

function initializePageContent() {
    if (document.getElementById('home-room-cards')) {
        // This is the home.html page
        initializeFlatpickr();
        renderHomeRoomCards();
        addBulkDataEntryButton();

        // FIX: Add event listeners for all modal close buttons for robustness
        document.getElementById('close-add-room-modal')?.addEventListener('click', () => closeModal('add-room-modal'));
        document.getElementById('close-settings-modal')?.addEventListener('click', () => closeModal('room-settings-modal'));
        document.getElementById('close-invoice-modal')?.addEventListener('click', () => closeModal('invoice-modal'));
        document.getElementById('close-tenant-modal')?.addEventListener('click', () => closeModal('add-edit-tenant-modal'));
        document.getElementById('confirm-modal-cancel-btn')?.addEventListener('click', () => closeModal('confirm-modal'));
        
    } else if (document.getElementById('history-section')) {
        // This is the index.html page for a specific room
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            document.title = `ประวัติค่าไฟ - ห้อง ${roomParam}`;
            renderHistoryTable(roomParam);
            updatePreviousReadingFromDB(roomParam);
            
            // Initialize evidence modal listeners - only for admin
            if (hasPermission('canUploadEvidence')) {
                setupEvidenceModalListeners();
            }
        } else {
            // Handle case where room is not specified
            const historySection = document.getElementById('history-section');
            if (historySection) {
                 historySection.innerHTML = `<p class="text-center text-red-400">ไม่พบข้อมูลห้อง</p>`;
            }
        }
    }
}


// --- Data Rendering ---

function getAmountColorClass(amount) {
    if (amount <= 1000) return 'low';
    if (amount <= 3000) return 'medium';
    return 'high';
}

async function renderHomeRoomCards() {
    const cardsContainer = document.getElementById('home-room-cards');
    if (!cardsContainer) return;

    cardsContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full py-8">กำลังโหลดข้อมูลห้องพัก...</p>`;

    try {
        console.log("--- เริ่มกระบวนการแสดงผลการ์ด ---");
        // 1. Fetch all room settings first
        const roomsSnapshot = await db.ref('rooms').once('value');
        const roomsData = roomsSnapshot.val() || {};
        console.log("1. ข้อมูลห้องพักทั้งหมด (Rooms):", JSON.parse(JSON.stringify(roomsData)));


        // 2. Fetch all bills
        const billsSnapshot = await db.ref('electricityData').once('value');
        const billsData = billsSnapshot.val() || {};
        console.log("2. ข้อมูลบิลทั้งหมด (Bills):", JSON.parse(JSON.stringify(billsData)));

        // --- Create a master list of all room IDs from both sources ---
        const roomIdsFromRooms = Object.keys(roomsData);
        const roomIdsFromBills = Object.values(billsData).map(bill => bill.room);
        const allRoomIds = [...new Set([...roomIdsFromRooms, ...roomIdsFromBills])].filter(id => id); // Create a unique list and remove any falsy values
        console.log("2A. ID ห้องทั้งหมดจากทุกแหล่ง (Master List):", allRoomIds);


        // Create a map of latest bills for each room
        const latestBills = {};
        for (const key in billsData) {
            const bill = { key, ...billsData[key] };

            // --- DEBUG LOG & SAFETY CHECK ---
            // ตรวจสอบว่าบิลมีข้อมูลวันที่ที่ถูกต้องหรือไม่
            if (!bill || !bill.date || typeof bill.date !== 'string' || bill.date.split('/').length !== 3) {
                console.warn(`[LOG] ข้ามบิลเนื่องจากข้อมูลวันที่ไม่ถูกต้อง:`, bill);
                continue; // ข้ามบิลนี้ไป
            }
            
            const existingBill = latestBills[bill.room];

            // เปรียบเทียบวันที่เพื่อหาบิลล่าสุด
            if (!existingBill || new Date(bill.date.split('/').reverse().join('-')) > new Date(existingBill.date.split('/').reverse().join('-'))) {
                latestBills[bill.room] = bill;
            }
        }
        console.log("3. ข้อมูลบิลล่าสุดของแต่ละห้อง (Latest Bills Map):", JSON.parse(JSON.stringify(latestBills)));
        
        // Filter rooms based on user permissions
        const user = window.currentUser;
        const userRole = window.currentUserRole;
        const userData = window.currentUserData;
        let displayableRoomIds = allRoomIds; // Start with the master list of all rooms

        if (userRole === '1' && userData && userData.managedRooms) {
            displayableRoomIds = displayableRoomIds.filter(roomId => userData.managedRooms.includes(roomId));
        } else if (userRole === 'level1_tenant' && userData && userData.accessibleRooms) {
            displayableRoomIds = displayableRoomIds.filter(roomId => userData.accessibleRooms.includes(roomId));
        }

        console.log("4. ID ห้องทั้งหมดที่จะแสดงผล:", displayableRoomIds);

        if (displayableRoomIds.length === 0) {
            cardsContainer.innerHTML = '<p class="text-center text-gray-400 col-span-full">ไม่พบข้อมูลห้องพักที่คุณมีสิทธิ์เข้าถึง</p>';
            return;
        }

        const sortedRoomIds = displayableRoomIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        cardsContainer.innerHTML = sortedRoomIds.map(roomId => {
            const roomSettings = roomsData[roomId] || {};
            const latestBill = latestBills[roomId] || null; // Use null for clarity
            
            console.log(`[LOG] กำลังสร้างการ์ดสำหรับห้อง ${roomId}:`, { roomSettings, latestBill });

            const addonsTotal = (roomSettings.addons || []).reduce((acc, addon) => acc + Number(addon.price || 0), 0);
            const rent = Number(roomSettings.rent || 0);
            const electricTotal = latestBill ? Number(latestBill.total || 0) : 0;
            const waterTotal = latestBill ? Number(latestBill.waterTotal || 0) : 0;
            const totalAmount = rent + electricTotal + waterTotal + addonsTotal;

            const isPaymentConfirmed = latestBill ? latestBill.paymentConfirmed === true : false;
            const dueDateInfo = getDueDateInfo(latestBill ? latestBill.dueDate : null);
            const amountColorClass = getAmountColorClass(totalAmount);
            
            // --- SAFETY CHECK ---
            const formattedDate = (latestBill && latestBill.date) ? new Date(latestBill.date.split('/').reverse().join('-')).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'ยังไม่มีบิล';

            let paymentStatusHtml = '';
            if (isPaymentConfirmed) {
                paymentStatusHtml = `<div class="payment-status confirmed"><i class="fas fa-check-circle"></i>ชำระเงินแล้ว</div>`;
            } else if (dueDateInfo.show) {
                let statusClass = 'due-soon';
                let icon = 'fa-clock';
                if (dueDateInfo.text.includes('เกินกำหนด')) {
                    statusClass = 'overdue';
                    icon = 'fa-exclamation-circle';
                }
                paymentStatusHtml = `<div class="payment-status ${statusClass}"><i class="fas ${icon}"></i>${dueDateInfo.text}</div>`;
            }

            // Fallback for tenant name if not set in room settings
            const tenantName = roomSettings.tenantName || (latestBill ? latestBill.name : 'ยังไม่มีผู้เช่า');

            return `
            <div class="room-card" data-room-id="${roomId}">
                <div class="card-content">
                    <div class="room-number">${roomId}</div>
                    <div class="room-name truncate">${tenantName}</div>
                    <div class="total-amount ${isPaymentConfirmed ? 'paid' : amountColorClass}">
                        ฿${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                    <div class="payment-status-wrapper">
                        ${paymentStatusHtml}
                    </div>
                </div>
                <div class="card-footer flex justify-around items-center gap-2">
                    <button onclick="viewRoomHistory('${roomId}')" class="btn btn-primary" title="ดูประวัติ"><i class="fas fa-history"></i></button>
                    <button onclick="generateInvoice('${latestBill ? latestBill.key : ''}')" class="btn btn-success" title="ใบแจ้งหนี้" ${!latestBill ? 'disabled' : ''}><i class="fas fa-file-invoice-dollar"></i></button>
                    <button onclick="openRoomSettingsModal('${roomId}')" class="btn btn-secondary" title="ตั้งค่าห้อง"><i class="fas fa-cog"></i></button>
                </div>
            </div>
            `;
        }).join('');

        // Staggered animation for cards
        const cards = cardsContainer.querySelectorAll('.room-card');
        cards.forEach((card, index) => {
            card.classList.add('card-enter');
            setTimeout(() => {
                card.classList.add('card-enter-active');
            }, 100 * index);
        });
        console.log("--- สิ้นสุดกระบวนการแสดงผลการ์ด ---");

    } catch (error) {
        console.error("Error rendering room cards:", error);
        cardsContainer.innerHTML = '<p class="text-center text-red-400 col-span-full">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
    }
}

function buildCardContainer(cardsContainer, sortedRooms) {
    cardsContainer.innerHTML = '';
    sortedRooms.map(roomData => {
            if (!roomData || typeof roomData.room === 'undefined') return '';
            
            const totalAmount = Number(roomData.total || 0) + Number(roomData.waterTotal || 0);
            const dueDateInfo = getDueDateInfo(roomData.dueDate);
            const isPaymentConfirmed = roomData.paymentConfirmed === true;
            const amountColorClass = getAmountColorClass(totalAmount);
            
            let formattedDate = 'N/A';
            if (roomData.date) {
                try {
                    const dateParts = roomData.date.split('/');
                    if (dateParts.length === 3) {
                       const date = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
                       if (!isNaN(date.getTime())) {
                           formattedDate = date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
                       }
                    }
                } catch (e) { console.warn("Could not parse date:", roomData.date); }
            }

            let paymentStatusHtml = '';
            if (isPaymentConfirmed) {
                paymentStatusHtml = `<div class="payment-status confirmed"><i class="fas fa-check-circle"></i>ชำระเงินแล้ว</div>`;
            } else if (dueDateInfo.show) {
                let statusClass = 'due-soon'; // Default for upcoming
                let icon = 'fa-clock';
                if (dueDateInfo.text.includes('เกินกำหนด')) {
                    statusClass = 'overdue';
                    icon = 'fa-exclamation-circle';
                }
                
                paymentStatusHtml = `<div class="payment-status ${statusClass}"><i class="fas ${icon}"></i>${dueDateInfo.text}</div>`;
            }
            getRoomName(roomData.room).then(roomname => {
                const roomnameDisplay = roomname || 'ไม่มีชื่อ';
                cardsContainer.innerHTML += `
                    <div class="room-card" data-room-id="${roomData.room}">
                    <div class="card-header">
                        <div class="card-title-group">
                            <div class="flex items-center gap-2">
                            <span class="room-number">${roomData.room}</span>
                            ${hasPermission('canEditAllBills') ? `<button onclick="openEditRoomNameModal('${roomData.room}', '${roomData.name || ''}')" class="text-yellow-400 hover:text-yellow-300 transition-colors" title="แก้ไขชื่อห้อง"><i class="fas fa-edit text-sm"></i></button>` : ''}
                            </div>
                            <p class="room-name truncate">${roomname || 'ไม่มีชื่อ'}</p>
                        </div>
                        <div class="card-meta text-right">
                            <span class="meta-label">อัปเดตล่าสุด</span>
                            <span class="meta-value">${formattedDate}</span>
                        </div>
                    </div>

                    <div class="card-body">
                        <div class="card-section">
                            <span class="label">ค่าไฟ (หน่วย)</span>
                            <span class="value electric">${roomData.units || 'N/A'}</span>
                        </div>
                        <div class="card-section">
                            <span class="label">ค่าน้ำ (หน่วย)</span>
                            <span class="value water">${roomData.waterUnits || '-'}</span>
                        </div>
                    </div>

                    <div class="card-total">
                        <span class="total-label">ยอดรวมล่าสุด</span>
                        <p class="total-amount ${isPaymentConfirmed ? 'paid' : amountColorClass}">฿${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </div>

                    ${paymentStatusHtml}

                    <div class="card-footer">
                        <button onclick="viewRoomHistory('${roomData.room}')" class="btn btn-primary"><i class="fas fa-history"></i>ประวัติ</button>
                        ${hasPermission('canDeleteBills') ? `<button onclick="openDeleteRoomConfirmModal('${roomData.room}')" class="btn btn-danger" title="ลบห้อง"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </div>

                        `
            })
            // cardsContainer.innerHTML += `
           

            //     <div class="card-body">
            //         <div class="card-section">
            //             <span class="label">ค่าไฟ (หน่วย)</span>
            //             <span class="value electric">${roomData.units || 'N/A'}</span>
            //         </div>
            //         <div class="card-section">
            //             <span class="label">ค่าน้ำ (หน่วย)</span>
            //             <span class="value water">${roomData.waterUnits || '-'}</span>
            //         </div>
            //     </div>

            //     <div class="card-total">
            //         <span class="total-label">ยอดรวมล่าสุด</span>
            //         <p class="total-amount ${isPaymentConfirmed ? 'paid' : amountColorClass}">฿${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            //     </div>

            //     <div class="card-due-date-wrapper">
            //         ${paymentStatusHtml}
            //     </div>

            //     <div class="card-footer">
            //         <button onclick="viewRoomHistory('${roomData.room}')" class="btn btn-primary"><i class="fas fa-history"></i>ประวัติ</button>
            //         ${hasPermission('canDeleteBills') ? `<button onclick="openDeleteRoomConfirmModal('${roomData.key}')" class="btn btn-danger" title="ลบห้อง"><i class="fas fa-trash"></i></button>` : ''}
            //     </div>
            // </div>
            // `;
        });
}

async function getRoomName(room) {
    // get a room name from user in this room
    // get from accessibleRooms in database where by contains this room
    // get only first user

    if (!room || typeof room !== 'string' || room.trim() === '') return '';

    try {
        // Get all users from the database
        const usersSnapshot = await db.ref('users').once('value');
        console.log('Fetching users for room:', usersSnapshot);
        const usersData = usersSnapshot.val();

        if (!usersData) return '';

        // Find the first user who has access to this room
        for (const userId in usersData) {
            const user = usersData[userId];
            if (user.accessibleRooms && Array.isArray(user.accessibleRooms) && user.accessibleRooms.includes(room)) {
                console.log(`Found user for room ${room}:`, user);
                return user.name || user.displayName || user.email || '';
            }
        }

        return '';
    } catch (error) {
        console.error('Error getting room name:', error);
        return '';
    }
}


async function renderHistoryTable(room) {
    const historyBody = document.getElementById('history-body');
    const noHistory = document.getElementById('no-history');
    const historySection = document.getElementById('history-section');
    
    if (!historyBody || !noHistory || !historySection) return;

    // Permission check for viewing history of this specific room
    if (!hasPermission('canViewHistory', room)) {
        historyBody.innerHTML = '';
        noHistory.innerHTML = `<p class="text-center text-red-400">คุณไม่มีสิทธิ์ดูประวัติของห้อง ${room}</p>`;
        noHistory.classList.remove('hidden');
        historySection.style.display = 'none'; // Hide the table section
        // Also hide the form for adding new bills if it exists on this page
        const billForm = document.getElementById('bill-form'); // Assuming your form has this ID
        if (billForm) billForm.style.display = 'none';
        return;
    }

    try {
        const bills = await loadFromFirebase(room); // loadFromFirebase already filters by room if room is provided

        if (!bills || bills.length === 0) {
            historyBody.innerHTML = '';
            noHistory.classList.remove('hidden');
            noHistory.innerHTML = `<p class="text-center text-gray-400">ไม่พบประวัติสำหรับห้อง ${room}</p>`;
            historySection.style.display = 'none';
            return;
        }

        noHistory.classList.add('hidden');
        historySection.style.display = '';

        // Pagination
        const totalPages = Math.ceil(bills.length / ITEMS_PER_PAGE);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginatedData = bills.slice(startIndex, endIndex);

        historyBody.innerHTML = paginatedData.map(bill => {
            // Check if payment is confirmed
            const isPaymentConfirmed = bill.paymentConfirmed === true;
            const canConfirmPayment = hasPermission('canConfirmPayment', room) && bill.evidenceUrl && !isPaymentConfirmed;
            const canDeleteEvidence = hasPermission('canUploadEvidence', room) && bill.evidenceUrl && !isPaymentConfirmed;
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

                    <!-- More Actions Dropdown -->
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
                <!-- Electricity Data -->
                <td class="py-3 px-3 text-center text-yellow-400 font-semibold align-middle">${bill.units || '-'}</td>
                <td class="py-3 px-3 text-center align-middle">${Number(bill.rate || 0).toFixed(2)}</td>
                <td class="py-3 px-3 text-center text-green-400 font-bold border-r border-slate-700 align-middle">${Number(bill.total || 0).toLocaleString()}</td>
                <!-- Water Data -->
                <td class="py-3 px-3 text-center text-cyan-400 font-semibold align-middle">${bill.waterUnits || '-'}</td>
                <td class="py-3 px-3 text-center align-middle">${Number(bill.waterRate || 0).toFixed(2)}</td>
                <td class="py-3 px-3 text-center text-sky-400 font-bold border-r border-slate-700 align-middle">${Number(bill.waterTotal || 0).toLocaleString()}</td>
                <td class="py-3 px-3 text-center align-middle">
                    ${actionsHtml}
                </td>
            </tr>
        `}).join('');

        updatePagination(bills.length, totalPages);

    } catch (error) {
        console.error('Error rendering history table:', error);
        historyBody.innerHTML = `<tr><td colspan="8" class="text-center text-red-400 py-4">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
    }
}


// --- Data Manipulation ---

async function loadFromFirebase(room = null) {
    try {
        const snapshot = await db.ref('electricityData').once('value');
        let data = snapshot.val();
        if (!data) return [];

        let bills = Object.keys(data).map(key => ({ key, ...data[key] }));

        // Filter out bills without room property
        bills = bills.filter(bill => bill.room);

        if (room) {
            bills = bills.filter(bill => bill.room === room);
        }

        return bills.sort((a, b) => new Date(b.date.split('/').reverse().join('-')) - new Date(a.date.split('/').reverse().join('-')));
    } catch (error) {
        console.error('Error loading data from Firebase:', error);
        return [];
    }
}

async function saveToFirebase(data) {
    try {
        const newBillRef = db.ref('electricityData').push();
        await newBillRef.set(data);
        return newBillRef.key;
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        return null;
    }
}


async function deleteBill(key) {
    if (!hasPermission('canDeleteBills')) {
        showAlert('คุณไม่มีสิทธิ์ลบข้อมูล', 'error');
        return;
    }
    
    try {
        // Fetch bill data to check payment confirmation status
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const billData = snapshot.val();
        
        if (!billData) {
            showAlert('ไม่พบข้อมูลที่ต้องการลบ', 'error');
            return;
        }

        // Check if payment is confirmed and user is not admin or level 1 owner
        if (billData.paymentConfirmed === true && window.currentUserRole !== 'admin' && window.currentUserRole !== '1') {
            showAlert('ไม่สามารถลบข้อมูลได้ เนื่องจากเจ้าของห้องได้ยืนยันการชำระเงินแล้ว', 'error');
            return;
        }

        showConfirmModal({
            title: 'ยืนยันการลบบิล',
            text: `คุณแน่ใจหรือไม่ว่าต้องการลบบิลของวันที่ ${billData.date || 'ไม่ระบุ'}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
            confirmButtonText: 'ลบ',
            onConfirm: async () => {
                await db.ref(`electricityData/${key}`).remove();
                showAlert('ลบข้อมูลเรียบร้อยแล้ว', 'success');
                
                const params = new URLSearchParams(window.location.search);
                const room = params.get('room');
                currentPage = 1;
                renderHistoryTable(room);
                updatePreviousReadingFromDB(room);
            }
        });
    } catch (error) {
        console.error('Error deleting bill:', error);
        showAlert('เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
    }
}

async function handleAddRoom(event) {
    event.preventDefault();
    if (!hasPermission('canAddNewBills')) {
        showAlert('คุณไม่มีสิทธิ์เพิ่มห้องใหม่', 'error');
        return;
    }

    const roomNumber = document.getElementById('add-room-room').value.trim();
    if (!roomNumber) {
        showAlert('กรุณากรอกเลขห้อง', 'error');
        return;
    }

    try {
        const roomRef = db.ref(`rooms/${roomNumber}`);
        const snapshot = await roomRef.once('value');

        if (snapshot.exists()) {
            showAlert('มีห้องหมายเลขนี้ในระบบแล้ว', 'error');
            return;
        }

        const initialTenantName = document.getElementById('add-room-name').value.trim();
        const initialRent = parseFloat(document.getElementById('add-room-rent').value) || 0;
        const initialRoomSize = document.getElementById('add-room-size').value.trim();

        const newRoomData = {
            rent: initialRent,
            roomSize: initialRoomSize,
            tenantName: initialTenantName,
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.uid || 'unknown',
            addons: [],
            assessmentFormUrl: ''
        };

        await roomRef.set(newRoomData);

        // Also add a new bill record for this room
        const billData = {
            room: roomNumber,
            name: initialTenantName,
            date: document.getElementById('add-room-date').value.trim(),
            current: parseFloat(document.getElementById('add-room-current').value) || 0,
            previous: parseFloat(document.getElementById('add-room-previous').value) || 0,
            rate: parseFloat(document.getElementById('add-room-rate').value) || 0,
            waterCurrent: parseFloat(document.getElementById('add-room-water-current').value) || 0,
            waterPrevious: parseFloat(document.getElementById('add-room-water-previous').value) || 0,
            waterRate: parseFloat(document.getElementById('add-room-water-rate').value) || 0,
            // Calculate totals
            units: (parseFloat(document.getElementById('add-room-current').value) || 0) - (parseFloat(document.getElementById('add-room-previous').value) || 0),
            total: ((parseFloat(document.getElementById('add-room-current').value) || 0) - (parseFloat(document.getElementById('add-room-previous').value) || 0)) * (parseFloat(document.getElementById('add-room-rate').value) || 0),
            waterUnits: (parseFloat(document.getElementById('add-room-water-current').value) || 0) - (parseFloat(document.getElementById('add-room-water-previous').value) || 0),
            waterTotal: ((parseFloat(document.getElementById('add-room-water-current').value) || 0) - (parseFloat(document.getElementById('add-room-water-previous').value) || 0)) * (parseFloat(document.getElementById('add-room-water-rate').value) || 0),
            dueDate: document.getElementById('add-room-due-date').value.trim(),
            createdAt: new Date().toISOString(),
            createdBy: auth.currentUser?.uid || 'unknown'
        };
        
        await db.ref('electricityData').push(billData);
        
        showAlert(`สร้างห้อง ${roomNumber} สำเร็จ`, 'success');
        closeModal('add-room-modal');
        document.getElementById('add-room-form').reset();
        renderHomeRoomCards();

    } catch (error) {
        console.error('Error adding new room:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้างห้องใหม่', 'error');
    }
}

async function calculateBill() {
    const room = new URLSearchParams(window.location.search).get('room');
    // Permission Check
    if (!hasPermission('canAddNewBills', room)) { // Check permission for the specific room
        showAlert('คุณไม่มีสิทธิ์เพิ่มข้อมูลใหม่สำหรับห้องนี้', 'error');
        return;
    }

    // Getting values from the form
    const billDate = document.getElementById('bill-date').value;
    const dueDate = document.getElementById('due-date').value; // New field
    const currentReading = parseFloat(document.getElementById('current-reading').value);
    const previousReading = parseFloat(document.getElementById('previous-reading').value);
    const rate = parseFloat(document.getElementById('rate').value);
    const totalAll = parseFloat(document.getElementById('total-all').value) || 0;

    // Water bill fields
    const currentWaterReading = parseFloat(document.getElementById('current-water-reading').value);
    const previousWaterReading = parseFloat(document.getElementById('previous-water-reading').value);
    const totalWaterUnitsHousehold = parseFloat(document.getElementById('total-water-units-household').value) || 0;
    const totalWaterBillHousehold = parseFloat(document.getElementById('total-water-bill-household').value) || 0;
    const waterRate = parseFloat(document.getElementById('water-rate').value);


    // Validation for electricity
    if (!billDate || !dueDate || isNaN(currentReading) || isNaN(rate)) {
        showAlert('กรุณากรอกข้อมูลค่าไฟให้ครบถ้วน: วันที่, วันครบกำหนด, เลขมิเตอร์, และเรทค่าไฟ', 'error');
        return;
    }
    if (currentReading < previousReading) {
        showAlert('ค่ามิเตอร์ไฟฟ้าปัจจุบันต้องไม่น้อยกว่าครั้งที่แล้ว', 'error');
        return;
    }

    // Validation for water (only if any water field is entered)
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

    // Electricity Calculation
    const units = currentReading - previousReading;
    const total = units * rate;

    // Water Calculation
    let waterUnits = 0;
    let waterTotal = 0;
    if (waterFieldsEntered && !isNaN(currentWaterReading) && !isNaN(previousWaterReading) && !isNaN(waterRate)) {
        waterUnits = currentWaterReading - previousWaterReading;
        waterTotal = waterUnits * waterRate;
    } else if (waterFieldsEntered && !isNaN(currentWaterReading) && isNaN(previousWaterReading) && !isNaN(waterRate) ) {
        // Case where previous water reading might be 0 or not yet set for the first bill
         waterUnits = currentWaterReading - 0; // Assume previous is 0 if not available but current and rate are
         waterTotal = waterUnits * waterRate;
    }


    // Find the associated room name
    const bills = await loadFromFirebase();
    const latestEntryForRoom = bills.find(b => b.room === room) || {};
    const roomName = latestEntryForRoom.name || 'ไม่มีชื่อ';

    const billData = {
        room: room,
        name: roomName,
        date: billDate,
        dueDate: dueDate,
        current: currentReading,
        previous: previousReading,
        units: units,
        rate: rate,
        total: total,
        totalAll: totalAll,
        // Water data
        currentWater: currentWaterReading || 0,
        previousWater: previousWaterReading || 0,
        waterUnits: waterUnits || 0,
        waterRate: waterRate || 0,
        waterTotal: waterTotal || 0,
        totalWaterBillHousehold: totalWaterBillHousehold || 0,
        totalWaterUnitsHousehold: totalWaterUnitsHousehold || 0,

        createdAt: new Date().toISOString(),
        paid: false
    };

    // Save to Firebase
    const newKey = await saveToFirebase(billData);
    if (newKey) {
        showAlert('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
        document.getElementById('current-reading').value = '';
        currentPage = 1; // Reset to first page to see the new entry
        renderHistoryTable(room);
        updatePreviousReadingFromDB(room);
    }
}

async function openEditModal(key) {
    try {
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const data = snapshot.val();
        if (!data) {
            showAlert('ไม่พบข้อมูลที่ต้องการแก้ไข', 'error');
            return;
        }
        // Permission Check for the specific room
        if (!hasPermission('canEditAllBills', data.room)) { // Assuming 'canEditAllBills' is the correct perm for editing any bill one has access to.
                                                       // Or it could be a more specific one like 'canEditOwnRoomBills'
            showAlert(`คุณไม่มีสิทธิ์แก้ไขข้อมูลของห้อง ${data.room}`, 'error');
            return;
        }

        // Populate form fields (only use ids that exist in index.html)
        document.getElementById('edit-key').value = key;

        document.getElementById('edit-date').value = data.date || '';
        document.getElementById('edit-due-date').value = data.dueDate || '';
        document.getElementById('edit-current').value = data.current || '';
        document.getElementById('edit-previous').value = data.previous || '';
        document.getElementById('edit-rate').value = data.rate || '';
        document.getElementById('edit-total-all').value = data.totalAll || '';
        
        // Water fields
        document.getElementById('edit-current-water').value = data.currentWater || '';
        document.getElementById('edit-previous-water').value = data.previousWater || '';
        document.getElementById('edit-water-rate').value = data.waterRate || '';
        document.getElementById('edit-total-water-bill-household').value = data.totalWaterBillHousehold || '';

        // Store the key for saving
        editingIndex = key;

        // Show modal
        openModal('edit-modal');

        // Calculate and display totals
        calculateEditTotals();

    } catch (error) {
        console.error('Error opening edit modal:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    }
}

async function saveEdit() {
    if (editingIndex === -1) { // editingIndex is the key of the bill being edited
        showAlert('ไม่พบข้อมูลที่ต้องการแก้ไข (No editing index)', 'error');
        return;
    }

    try {
        // Get original room to check permission before saving
        const originalSnapshot = await db.ref(`electricityData/${editingIndex}`).once('value');
        const originalData = originalSnapshot.val();
        if (!originalData) {
            showAlert('ไม่พบข้อมูลเดิมที่ต้องการแก้ไข', 'error');
            editingIndex = -1; // Reset
            closeModal('edit-modal');
            return;
        }

        // Permission Check for the specific room
        if (!hasPermission('canEditAllBills', originalData.room)) {
            showAlert(`คุณไม่มีสิทธิ์บันทึกการแก้ไขข้อมูลของห้อง ${originalData.room}`, 'error');
            return;
        }

        // Get form values (use correct ids from index.html)
        const date = document.getElementById('edit-date').value;
        const dueDate = document.getElementById('edit-due-date').value;
        const current = parseFloat(document.getElementById('edit-current').value) || 0;
        const previous = parseFloat(document.getElementById('edit-previous').value) || 0;
        const rate = parseFloat(document.getElementById('edit-rate').value) || 0;
        const totalAll = parseFloat(document.getElementById('edit-total-all').value) || 0;
        
        // Water values
        const currentWater = parseFloat(document.getElementById('edit-current-water').value) || 0;
        const previousWater = parseFloat(document.getElementById('edit-previous-water').value) || 0;
        const waterRate = parseFloat(document.getElementById('edit-water-rate').value) || 0;
        const totalWaterBillHousehold = parseFloat(document.getElementById('edit-total-water-bill-household').value) || 0;

        // Validate required fields
        if (!date || !dueDate) {
            showAlert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
            return;
        }

        // Calculate units and totals
        const units = current - previous;
        const total = units * rate;
        const waterUnits = currentWater - previousWater;
        const waterTotal = waterUnits * waterRate;

        // Prepare update data
        const updateData = {
            date,
            dueDate,
            current,
            previous,
            units,
            rate,
            total,
            totalAll,
            currentWater,
            previousWater,
            waterUnits,
            waterRate,
            waterTotal,
            totalWaterBillHousehold,
            updatedAt: new Date().toISOString(),
            updatedBy: auth.currentUser?.uid || 'unknown'
        };

        // Update in Firebase
        await db.ref(`electricityData/${editingIndex}`).update(updateData);

        showAlert('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success');

        // Close modal
        closeModal('edit-modal');

        // Refresh the table
        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        if (roomParam) {
            renderHistoryTable(roomParam);
            updatePreviousReadingFromDB(roomParam);
        } else {
            // If on home page, refresh room cards
            renderHomeRoomCards();
        }

        // Reset editing index
        editingIndex = -1;

    } catch (error) {
        console.error('Error saving edit:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
}

async function migrateOldData() {
    if (!hasPermission('canManageUsers')) { // Admin-only permission
        showAlert('คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้', 'error');
        return;
    }

    if (!confirm('คุณต้องการอัปเดตข้อมูลเก่าทั้งหมดที่ไม่มีการระบุห้องหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    showAlert('กำลังเริ่มกระบวนการอัปเดตข้อมูลเก่า...', 'info');

    try {
        const snapshot = await db.ref('electricityData').once('value');
        const data = snapshot.val();
        if (!data) {
            showAlert('ไม่พบข้อมูลในฐานข้อมูล', 'warning');
            return;
        }

        const updates = {};
        let migrationCount = 0;

        for (const key in data) {
            // Check if the bill object is valid and if 'room' is missing
            if (data.hasOwnProperty(key) && typeof data[key] === 'object' && !data[key].hasOwnProperty('room')) {
                const migratedBill = {
                    ...data[key],
                    room: '001', // Default room
                    name: 'ข้อมูลเก่า' // Default name
                };
                updates[`/${key}`] = migratedBill;
                migrationCount++;
            }
        }

        if (migrationCount > 0) {
            await db.ref('electricityData').update(updates);
            showAlert(`อัปเดตข้อมูลเก่าจำนวน ${migrationCount} รายการสำเร็จ!`, 'success');
        } else {
            showAlert('ไม่พบข้อมูลเก่าที่ต้องอัปเดต', 'info');
        }

        // Refresh the view
        renderHomeRoomCards();

    } catch (error) {
        console.error("Error migrating old data:", error);
        showAlert(`เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ${error.message}`, 'error');
    }
}


// --- UI & Utility ---

function viewRoomHistory(room) {
    if (!hasPermission('canViewHistory')) {
        showAlert('คุณไม่มีสิทธิ์ดูประวัติข้อมูล', 'error');
        return;
    }
    
    window.location.href = `index.html?room=${encodeURIComponent(room)}`;
}

function updatePagination(totalItems, totalPages) {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer || totalPages <= 1) {
        if(paginationContainer) paginationContainer.innerHTML = '';
        return;
    }
    // Pagination logic...
    // This needs to be implemented based on your desired UI
}

async function updatePreviousReadingFromDB(room) {
    if (!room) return;
    const bills = await loadFromFirebase(room);
    const previousReadingInput = document.getElementById('previous-reading');
    if (previousReadingInput) {
        previousReadingInput.value = bills.length > 0 ? bills[0].current : '';
    }
    const previousWaterReadingInput = document.getElementById('previous-water-reading');
    if (previousWaterReadingInput) {
        previousWaterReadingInput.value = bills.length > 0 && bills[0].currentWater ? bills[0].currentWater : '';
    }
}

function calculateWaterRatePerUnit() {
    const totalWaterUnits = parseFloat(document.getElementById('total-water-units-household').value);
    const totalWaterBill = parseFloat(document.getElementById('total-water-bill-household').value);
    const waterRateInput = document.getElementById('water-rate');

    if(totalWaterUnits > 0 && totalWaterBill > 0) {
        const rate = totalWaterBill / totalWaterUnits;
        waterRateInput.value = rate.toFixed(4);
    } else {
        waterRateInput.value = 0;
    }
}

// Any other utility functions like calculateBill, formatDate, etc.
// should be reviewed to ensure they don't have conflicting logic.
// The hardcoded electricityData array should be removed if all data comes from Firebase.

// --- Helper Functions for Home Cards ---
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
    today.setHours(0, 0, 0, 0); // Normalize today's date
    dueDate.setHours(0, 0, 0, 0); // Normalize due date

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

// --- Modal Controls ---
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('active');
    
    const onTransitionEnd = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        modal.removeEventListener('transitionend', onTransitionEnd);
    };
    
    modal.addEventListener('transitionend', onTransitionEnd);

    // For bulk modal, remove it from DOM after closing
    if (modalId === 'bulk-data-modal' || modalId === 'confirm-modal') {
         setTimeout(() => {
            if (!modal.classList.contains('active')) {
                modal.remove();
            }
        }, 500); // A bit longer than transition
    }
}

function viewEvidence(url, fileName = 'หลักฐานการชำระเงิน') {
    console.log('=== viewEvidence started ===');
    console.log('Evidence URL:', url);
    console.log('File name:', fileName);
    
    if (!url) {
        showAlert('ไม่พบหลักฐานที่ต้องการดู', 'error');
        return;
    }
    
    // Show evidence in modal instead of new tab
    const modal = document.getElementById('evidence-view-modal');
    const container = document.getElementById('evidence-view-container');
    const downloadBtn = document.getElementById('download-evidence-btn');
    
    if (!modal || !container) {
        console.error('Evidence view modal elements not found');
        showAlert('เกิดข้อผิดพลาดในการแสดงรูปภาพ', 'error');
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
        console.log('Image loaded successfully');
    };
    
    img.onerror = function() {
        console.error('Failed to load image');
        container.innerHTML = `
            <div class="text-center text-red-400">
                <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
                <p>ไม่สามารถโหลดรูปภาพได้</p>
            </div>
        `;
    };
    
    // Add image to container
    container.appendChild(img);
    
    // Set up download button
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
    
    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    console.log('=== viewEvidence ended ===');
}

function closeEvidenceViewModal() {
    const modal = document.getElementById('evidence-view-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function openEvidenceModal(key) {
    console.log('=== openEvidenceModal started ===');
    console.log('Key parameter:', key);
    
    if (!hasPermission('canUploadEvidence')) {
        console.log('Permission denied: canUploadEvidence');
        showAlert('คุณไม่มีสิทธิ์แนบหลักฐาน', 'error');
        return;
    }
    
    keyForEvidence = key;
    console.log('keyForEvidence set to:', keyForEvidence);
    
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
        preview.innerHTML = '';
        preview.classList.add('hidden');
    }
    if (placeholder) {
        placeholder.classList.remove('hidden');
    }
    
    // Reset save button
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
    }
    
    // Clear error message
    if (errorMsg) {
        errorMsg.textContent = '';
    }
    
    // Hide progress indicators
    if (progressContainer) {
        progressContainer.classList.add('hidden');
    }
    if (uploadStatus) {
        uploadStatus.classList.add('hidden');
    }

    const modal = document.getElementById('evidence-modal');
    console.log('Modal element found:', !!modal);
    
    if (modal) {
        // Set the key in the modal's dataset for the newer implementation
        modal.dataset.key = key;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        console.log('Modal opened successfully');
        
        // Update modal title to show this is for uploading new evidence
        const modalTitle = modal.querySelector('h2');
        if (modalTitle) {
            modalTitle.textContent = 'แนบหลักฐานการชำระเงิน (ใหม่)';
        }
    } else {
        console.error('Modal element not found!');
    }
    
    console.log('=== openEvidenceModal ended ===');
}

function closeEvidenceModal() {
    keyForEvidence = null;
    const modal = document.getElementById('evidence-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function openDeleteConfirmModal(key) {
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

        keyToDelete = key;
        const modal = document.getElementById('delete-confirm-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }).catch(error => {
        console.error("Error fetching bill data for delete confirmation:", error);
        showAlert('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์การลบ', 'error');
    });
}

function closeDeleteConfirmModal() {
    keyToDelete = null;
    const modal = document.getElementById('delete-confirm-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeDeleteConfirmModal() {
    keyToDelete = null;
    const modal = document.getElementById('delete-confirm-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function closeQrCodeModal() {
    const modal = document.getElementById('qr-code-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function handleDeleteBill(key) {
    if (!key) {
        showAlert('ไม่พบข้อมูลที่ต้องการลบ (No key to delete)', 'error');
        return;
    }

    try {
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const billData = snapshot.val();

        if (!billData) {
            showAlert('ไม่พบข้อมูลที่ต้องการลบแล้ว (อาจถูกลบไปแล้ว)', 'warning');
            return;
        }

        if (!hasPermission('canDeleteBills', billData.room)) {
            showAlert(`คุณไม่มีสิทธิ์ลบข้อมูลของห้อง ${billData.room}`, 'error');
            return;
        }

        if (billData.paymentConfirmed === true && window.currentUserRole !== 'admin' && window.currentUserRole !== '1') {
            showAlert('ไม่สามารถลบข้อมูลได้ เนื่องจากเจ้าของห้องได้ยืนยันการชำระเงินแล้ว', 'error');
            return;
        }

        showConfirmModal({
            title: 'ยืนยันการลบบิล',
            text: `คุณแน่ใจหรือไม่ว่าต้องการลบบิลของวันที่ ${billData.date}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
            confirmButtonText: 'ลบทิ้ง',
            confirmButtonClass: 'bg-red-600 hover:bg-red-700',
            onConfirm: async () => {
                await db.ref(`electricityData/${key}`).remove();
                showAlert('ลบข้อมูลเรียบร้อยแล้ว', 'success');
                
                const params = new URLSearchParams(window.location.search);
                const roomParam = params.get('room');
                currentPage = 1;
                if (roomParam) {
                    renderHistoryTable(roomParam);
                    updatePreviousReadingFromDB(roomParam);
                } else {
                    renderHomeRoomCards();
                }
            }
        });
    } catch (error) {
        console.error('Error preparing to delete bill:', error);
        showAlert('เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
    }
}

// Add mobile detection utility
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Add image compression utility function
function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
        console.log('=== Image compression started ===');
        console.log('Original file:', {
            name: file.name,
            size: file.size,
            type: file.type
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            console.log('Image loaded, original dimensions:', img.width, 'x', img.height);
            
            // Calculate new dimensions while maintaining aspect ratio
            let { width, height } = img;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
            }

            console.log('Compressed dimensions:', width, 'x', height);

            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;

            // Draw and compress image
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob with specified quality
            canvas.toBlob((blob) => {
                if (blob) {
                    console.log('Compression completed:', {
                        originalSize: file.size,
                        compressedSize: blob.size,
                        compressionRatio: ((file.size - blob.size) / file.size * 100).toFixed(2) + '%'
                    });
                    
                    // Create new file with compressed data
                    const compressedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                } else {
                    reject(new Error('Failed to compress image'));
                }
            }, file.type, quality);
        };

        img.onerror = () => {
            console.error('Failed to load image for compression');
            reject(new Error('Failed to load image for compression'));
        };

        img.src = URL.createObjectURL(file);
    });
}

async function handleEvidenceUpload() {
    logUploadEvent('upload_started', { keyForEvidence });
    console.log('=== handleEvidenceUpload started ===');
    
    // Use compressed file if available, otherwise check inputs
    let file = window.compressedEvidenceFile;
    
    if (!file) {
        const fileInput = document.getElementById('evidence-image-input');
        const cameraInput = document.getElementById('evidence-camera-input');
        
        // Check both file inputs for selected files
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            file = fileInput.files[0];
            console.log('File found in fileInput:', file.name);
        } else if (cameraInput && cameraInput.files && cameraInput.files.length > 0) {
            file = cameraInput.files[0];
            console.log('File found in cameraInput:', file.name);
        }
    } else {
        console.log('Using compressed file:', file.name);
    }
    
    console.log('File to upload:', file);
    console.log('keyForEvidence (bill key):', keyForEvidence);
    
    if (!file) {
        logUploadEvent('upload_failed', { reason: 'no_file_selected' });
        console.error('No file selected');
        showAlert('กรุณาเลือกไฟล์รูปภาพก่อน', 'error');
        return;
    }
    
    if (!keyForEvidence) {
        logUploadEvent('upload_failed', { reason: 'no_bill_key' });
        console.error('No keyForEvidence (bill key)');
        showAlert('เกิดข้อผิดพลาด: ไม่พบข้อมูลที่ต้องการแนบหลักฐาน', 'error');
        return;
    }

    logUploadEvent('file_selected', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        isCompressed: !!window.compressedEvidenceFile
    });

    // Fetch bill data to check room for permission
    let billRoom;
    try {
        console.log('Fetching bill data for permission check...');
        const billSnapshot = await db.ref(`electricityData/${keyForEvidence}`).once('value');
        const billData = billSnapshot.val();
        if (!billData || !billData.room) {
            logUploadEvent('upload_failed', { reason: 'no_bill_data' });
            showAlert('ไม่พบข้อมูลห้องสำหรับบิลนี้ ไม่สามารถตรวจสอบสิทธิ์ได้', 'error');
            return;
        }
        billRoom = billData.room;
        console.log('Bill room:', billRoom);

        if (!hasPermission('canUploadEvidence', billRoom)) {
            logUploadEvent('upload_failed', { reason: 'no_permission', room: billRoom });
            showAlert(`คุณไม่มีสิทธิ์อัปโหลดหลักฐานสำหรับห้อง ${billRoom}`, 'error');
            return;
        }
    } catch (error) {
        logUploadEvent('upload_failed', { reason: 'permission_check_error', error: error.message });
        console.error("Error fetching bill data for permission check:", error);
        showAlert('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์อัปโหลด', 'error');
        return;
    }

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
        logUploadEvent('upload_failed', { reason: 'invalid_file_type', fileType: file.type });
        showAlert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF)', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit for upload
        logUploadEvent('upload_failed', { reason: 'file_too_large', fileSize: file.size });
        showAlert('ขนาดไฟล์ต้องไม่เกิน 5MB', 'error');
        return;
    }

    const saveBtn = document.getElementById('evidence-save-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const uploadStatus = document.getElementById('upload-status');
    const uploadPercentage = document.getElementById('upload-percentage');
    const uploadFilename = document.getElementById('upload-filename');
    const errorMsg = document.getElementById('evidence-error');

    console.log('UI elements found:', {
        saveBtn: !!saveBtn,
        progressContainer: !!progressContainer,
        progressBar: !!progressBar,
        uploadStatus: !!uploadStatus,
        uploadPercentage: !!uploadPercentage,
        uploadFilename: !!uploadFilename,
        errorMsg: !!errorMsg
    });

    // Update UI for upload state
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>กำลังอัปโหลด...';
    }
    if (progressContainer) progressContainer.classList.remove('hidden');
    if (uploadStatus) uploadStatus.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (uploadPercentage) uploadPercentage.textContent = '0%';
    if (uploadFilename) uploadFilename.textContent = file.name;
    if (errorMsg) errorMsg.textContent = '';

    try {
        logUploadEvent('firebase_check_started');
        console.log('Checking Firebase Storage availability...');
        
        // Check if Firebase is initialized
        if (!firebase || !firebase.apps || firebase.apps.length === 0) {
            logUploadEvent('upload_failed', { reason: 'firebase_not_initialized' });
            throw new Error('Firebase ยังไม่ได้เริ่มต้น กรุณารีเฟรชหน้าเว็บ');
        }
        
        // Check if user is authenticated
        if (!auth.currentUser) {
            logUploadEvent('upload_failed', { reason: 'user_not_authenticated' });
            throw new Error('กรุณาเข้าสู่ระบบก่อนอัปโหลดไฟล์');
        }

        // Get storage instance - try multiple approaches
        let storageInstance;
        try {
            // Try global storage variable first
            storageInstance = window.storage || firebase.storage();
        } catch (storageError) {
            console.warn('Could not get storage instance:', storageError);
            logUploadEvent('upload_failed', { reason: 'storage_instance_failed', error: storageError.message });
            throw new Error('ไม่สามารถเข้าถึง Firebase Storage ได้ กรุณาลองรีเฟรชหน้าเว็บ');
        }

        if (!storageInstance) {
            logUploadEvent('upload_failed', { reason: 'storage_instance_null' });
            throw new Error('Firebase Storage ไม่พร้อมใช้งาน');
        }

        // Get storage usage info (optional - don't fail if this doesn't work)
        try {
            const usageInfo = await getStorageUsageInfo();
            if (usageInfo) {
                console.log('Current storage usage:', usageInfo);
                logUploadEvent('storage_usage_checked', usageInfo);
                
                // Check if user is approaching storage limit (e.g., 50MB)
                const usageMB = parseFloat(usageInfo.totalSizeMB);
                if (usageMB > 45) {
                    console.warn('User approaching storage limit:', usageMB, 'MB');
                    showAlert(`คำเตือน: คุณใช้พื้นที่จัดเก็บ ${usageMB} MB จาก 50 MB แล้ว`, 'warning');
                }
            }
        } catch (usageError) {
            console.warn('Could not check storage usage:', usageError);
            // Continue with upload even if usage check fails
        }

        console.log('Firebase Storage is available');
        console.log('User authenticated:', auth.currentUser.uid);

        // Get storage reference
        const storageRef = storageInstance.ref();
        
        // Create unique filename with timestamp and user ID
        const timestamp = Date.now();
        const userID = auth.currentUser.uid;
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${userID}_${sanitizedFileName}`;
        const evidenceRef = storageRef.child(`evidence/${keyForEvidence}/${fileName}`);
        
        console.log('Storage reference created:', {
            timestamp,
            userID,
            fileName,
            fullPath: `evidence/${keyForEvidence}/${fileName}`
        });
        
        logUploadEvent('upload_started', {
            fileName,
            fileSize: file.size,
            storagePath: `evidence/${keyForEvidence}/${fileName}`,
            userID: userID
        });
        
        console.log('Starting upload...');
        
        // Create upload task with comprehensive metadata
        const metadata = {
            contentType: file.type,
            cacheControl: 'public, max-age=31536000', // Cache for 1 year
            customMetadata: {
                originalName: file.name,
                uploadedBy: userID,
                uploadedAt: new Date().toISOString(),
                billKey: keyForEvidence,
                room: billRoom,
                compressed: window.compressedEvidenceFile ? 'true' : 'false',
                originalSize: window.compressedEvidenceFile ? window.compressedEvidenceFile.originalSize : file.size,
                deviceInfo: isMobileDevice() ? 'mobile' : 'desktop',
                userAgent: navigator.userAgent.substring(0, 100) // Limit length
            }
        };
        
        console.log('Upload metadata:', metadata);
        
        // Start upload with metadata
        const uploadTask = evidenceRef.put(file, metadata);

        // Monitor upload progress
        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload progress:', progress + '%');
                
                // Update UI progress
                if (progressBar) progressBar.style.width = progress + '%';
                if (uploadPercentage) uploadPercentage.textContent = `${Math.round(progress)}%`;
                
                // Update status text based on progress
                if (uploadFilename) {
                    if (progress < 100) {
                        uploadFilename.textContent = `กำลังอัปโหลด ${file.name}... (${Math.round(progress)}%)`;
                    } else {
                        uploadFilename.textContent = `อัปโหลดเสร็จสิ้น - ${file.name}`;
                    }
                }
                
                // Log progress milestones
                if (progress % 25 === 0) {
                    logUploadEvent('upload_progress', { 
                        progress: Math.round(progress),
                        bytesTransferred: snapshot.bytesTransferred,
                        totalBytes: snapshot.totalBytes
                    });
                }
            }, 
            (error) => {
                logUploadEvent('upload_failed', { 
                    reason: 'firebase_upload_error',
                    errorCode: error.code,
                    errorMessage: error.message,
                    errorDetails: error
                });
                console.error('Upload error:', error);
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);
                
                let errorMessage = 'เกิดข้อผิดพลาดในการอัปโหลด';
                
                // Handle specific Firebase Storage errors
                switch (error.code) {
                    case 'storage/unauthorized':
                        errorMessage = 'ไม่มีสิทธิ์ในการอัปโหลดไฟล์ กรุณาเข้าสู่ระบบใหม่';
                        break;
                    case 'storage/canceled':
                        errorMessage = 'การอัปโหลดถูกยกเลิก';
                        break;
                    case 'storage/unknown':
                        errorMessage = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่อีกครั้ง';
                        break;
                    case 'storage/quota-exceeded':
                        errorMessage = 'พื้นที่จัดเก็บไฟล์เต็ม';
                        break;
                    case 'storage/unauthenticated':
                        errorMessage = 'กรุณาเข้าสู่ระบบใหม่';
                        break;
                    default:
                        errorMessage = `ข้อผิดพลาด: ${error.message}`;
                }
                
                throw new Error(errorMessage);
            }, 
            async () => {
                try {
                    logUploadEvent('upload_completed', { fileName });
                    console.log('Upload completed, getting download URL...');
                    // Get download URL
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                    console.log('Download URL obtained:', downloadURL);
                    
                    logUploadEvent('database_update_started');
                    console.log('Updating database...');
                    // Update database with evidence URL
                    await db.ref(`electricityData/${keyForEvidence}`).update({ 
                        evidenceUrl: downloadURL,
                        evidenceUploadedAt: new Date().toISOString(),
                        evidenceFileName: fileName,
                        evidenceFileSize: file.size,
                        evidenceFileType: file.type,
                        evidenceUploadedBy: auth.currentUser?.uid || 'unknown',
                        evidenceCompressed: window.compressedEvidenceFile ? true : false
                    });
                    
                    console.log('Database updated successfully');
                    
                    // Show success message
                    showAlert('อัปโหลดหลักฐานสำเร็จ!', 'success');
                    
                    // Close modal and refresh table
                    closeEvidenceModal();
                    const room = new URLSearchParams(window.location.search).get('room');
                    if (room) {
                        renderHistoryTable(room);
                    } else {
                        // If on home page, refresh room cards
                        renderHomeRoomCards();
                    }
                    
                } catch (dbError) {
                    console.error('Database update error:', dbError);
                    throw new Error('ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้');
                }
            }
        );

    } catch (error) {
        console.error("Upload failed:", error);
        console.error("Error details:", {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        if (errorMsg) errorMsg.textContent = error.message;
        showAlert(error.message, 'error');
        
        // Reset UI
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
        }
        if (progressContainer) progressContainer.classList.add('hidden');
        if (uploadStatus) uploadStatus.classList.add('hidden');
    }
}


// --- Event Listeners Setup ---

// Global functions for evidence handling
function handleFileSelect(file) {
    logUploadEvent('file_selection_started', {
        fileName: file?.name,
        fileSize: file?.size,
        fileType: file?.type
    });
    console.log('=== handleFileSelect started ===');
    console.log('File received:', {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
    });

    if (!file) {
        logUploadEvent('file_selection_failed', { reason: 'no_file_provided' });
        console.log('No file provided, clearing selection');
        clearEvidenceSelection();
        return;
    }

    const previewContainer = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const saveBtn = document.getElementById('evidence-save-btn');
    const errorMsg = document.getElementById('evidence-error');
    
    // Reset any previous error states
    if (errorMsg) errorMsg.textContent = '';

    // Validate file type
    if (!file.type.startsWith('image/')) {
        logUploadEvent('file_selection_failed', { 
            reason: 'invalid_file_type',
            fileType: file.type
        });
        console.error('Invalid file type:', file.type);
        showAlert('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error');
        clearEvidenceSelection();
        return;
    }

    // Validate file size (e.g., 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
        logUploadEvent('file_selection_failed', { 
            reason: 'file_too_large',
            fileSize: file.size
        });
        console.error('File too large:', file.size);
        showAlert('ขนาดไฟล์ต้องไม่เกิน 10MB', 'error');
        clearEvidenceSelection();
        return;
    }

    logUploadEvent('file_validation_passed', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
    });
    console.log('File validation passed, starting compression...');

    // Show loading state
    if (placeholder) placeholder.innerHTML = `
        <div class="flex flex-col items-center text-slate-400">
            <i class="fas fa-spinner fa-spin text-4xl mb-2"></i>
            <span class="text-base text-center">กำลังประมวลผลรูปภาพ...</span>
        </div>
    `;

    // Compress image before showing preview
    compressImage(file)
        .then(compressedFile => {
            logUploadEvent('compression_success', {
                originalSize: file.size,
                compressedSize: compressedFile.size,
                compressionRatio: ((file.size - compressedFile.size) / file.size * 100).toFixed(2)
            });
            console.log('Image compressed successfully');
            
            // Show preview
            if (previewContainer) {
                previewContainer.innerHTML = `
                    <div class="w-full max-w-xs">
                        <img src="${URL.createObjectURL(compressedFile)}" 
                             alt="Preview" 
                             class="w-full h-auto rounded-lg shadow-lg max-h-48 object-cover" />
                        <div class="mt-2 text-center text-sm text-slate-400">
                            <div>${compressedFile.name}</div>
                            <div>ขนาด: ${(compressedFile.size / 1024).toFixed(1)} KB</div>
                        </div>
                    </div>
                `;
            }
            
            if (placeholder) placeholder.classList.add('hidden');
            if (saveBtn) saveBtn.disabled = false;
            
            // Store the compressed file for upload
            window.compressedEvidenceFile = compressedFile;
            
            logUploadEvent('file_selection_completed', {
                fileName: compressedFile.name,
                compressedSize: compressedFile.size
            });
            console.log('File selection completed successfully');
        })
        .catch(error => {
            logUploadEvent('compression_failed', { 
                error: error.message,
                fileName: file.name
            });
            console.error('Image compression failed:', error);
            showAlert('เกิดข้อผิดพลาดในการประมวลผลรูปภาพ', 'error');
            clearEvidenceSelection();
        });
}

function clearEvidenceSelection() {
    console.log('=== clearEvidenceSelection started ===');
    
    // Reset both file inputs
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    if(fileInput) fileInput.value = '';
    if(cameraInput) cameraInput.value = '';
    
    // Clear stored compressed file
    window.compressedEvidenceFile = null;
    
    // UI elements
    const previewContainer = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const saveBtn = document.getElementById('evidence-save-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const errorMsg = document.getElementById('evidence-error');

    // Reset preview
    if(previewContainer) previewContainer.innerHTML = '';
    if(placeholder) {
        placeholder.innerHTML = `
            <i class="fas fa-cloud-upload-alt text-4xl mb-2"></i>
            <span class="text-base text-center">ลากไฟล์มาวาง หรือเลือกวิธีอัพโหลดด้านบน</span>
            <span class="text-sm text-slate-500 mt-1">รองรับไฟล์: JPG, PNG, GIF (สูงสุด 10MB)</span>
        `;
        placeholder.classList.remove('hidden');
    }
    
    // Reset button and progress
    if(saveBtn) saveBtn.disabled = true;
    if(progressContainer) progressContainer.classList.add('hidden');
    if(errorMsg) errorMsg.textContent = '';
    
    console.log('Evidence selection cleared');
}

function setupEvidenceModalListeners() {
    console.log('=== Setting up evidence modal listeners ===');
    
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    const dropZone = document.getElementById('evidence-dropzone');
    const saveBtn = document.getElementById('evidence-save-btn');
    const closeBtn = document.getElementById('close-evidence-modal');
    const cancelBtn = document.getElementById('evidence-clear-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const galleryBtn = document.getElementById('gallery-btn');
    const fileBtn = document.getElementById('file-btn');
    const debugBtn = document.getElementById('evidence-debug-btn');

    console.log('Found elements:', {
        fileInput: !!fileInput,
        cameraInput: !!cameraInput,
        dropZone: !!dropZone,
        saveBtn: !!saveBtn,
        closeBtn: !!closeBtn,
        cancelBtn: !!cancelBtn,
        cameraBtn: !!cameraBtn,
        galleryBtn: !!galleryBtn,
        fileBtn: !!fileBtn,
        debugBtn: !!debugBtn
    });

    if (!fileInput || !dropZone || !saveBtn || !closeBtn || !cancelBtn) {
        console.warn('One or more evidence modal elements not found. Listeners not attached.');
        return;
    }
    
    // Camera button - trigger camera input
    if (cameraBtn) {
        cameraBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Camera button clicked');
            console.log('Device info:', {
                userAgent: navigator.userAgent,
                isMobile: isMobileDevice(),
                protocol: location.protocol,
                hostname: location.hostname
            });
            
            // Check if device supports camera
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('Camera not supported on this device');
                showAlert('อุปกรณ์นี้ไม่รองรับการถ่ายรูป กรุณาใช้แกลเลอรี่แทน', 'warning');
                return;
            }
            
            // Check if we're on HTTPS (required for camera access)
            if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                console.warn('Camera requires HTTPS');
                showAlert('การถ่ายรูปต้องใช้ HTTPS กรุณาใช้แกลเลอรี่แทน', 'warning');
                return;
            }
            
            // For mobile devices, try to use the camera directly
            if (isMobileDevice()) {
                console.log('Mobile device detected, using camera input');
                // Update camera input attributes for better mobile support
                if (cameraInput) {
                    cameraInput.setAttribute('capture', 'environment');
                    cameraInput.setAttribute('accept', 'image/*');
                }
            }
            
            // Trigger camera input
            if (cameraInput) {
                console.log('Triggering camera input');
                try {
                    cameraInput.click();
                } catch (error) {
                    console.error('Error triggering camera input:', error);
                    showAlert('เกิดข้อผิดพลาดในการเปิดกล้อง กรุณาลองใหม่', 'error');
                }
            } else {
                console.error('Camera input not found');
                showAlert('เกิดข้อผิดพลาด: ไม่พบ input สำหรับกล้อง', 'error');
            }
        });
    }

    // Gallery button - trigger file input
    if (galleryBtn) {
        galleryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Gallery button clicked');
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    // File button - trigger file input
    if (fileBtn) {
        fileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('File button clicked');
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    // Trigger file input from drop zone click
    dropZone.addEventListener('click', (e) => {
        // Don't trigger if clicking on preview or placeholder
        if (!e.target.closest('#evidence-preview') && !e.target.closest('#evidence-placeholder')) {
            console.log('Drop zone clicked, opening file picker');
            fileInput.click();
        }
    });

    // Handle file selection from file input
    fileInput.addEventListener('change', (e) => {
        console.log('File input change event:', e.target.files.length, 'files');
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            console.log('File selected from file input:', file.name, file.size, file.type);
            handleFileSelect(file);
        }
    });

    // Handle file selection from camera input
    cameraInput.addEventListener('change', (e) => {
        console.log('Camera input change event:', e.target.files.length, 'files');
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            console.log('File selected from camera input:', file.name, file.size, file.type);
            handleFileSelect(file);
        }
    });

    // Drag and Drop listeners
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        console.log('File dragged over drop zone');
        dropZone.classList.add('border-blue-500', 'bg-slate-700/50');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        console.log('File dragged out of drop zone');
        dropZone.classList.remove('border-blue-500', 'bg-slate-700/50');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        console.log('File dropped on drop zone');
        dropZone.classList.remove('border-blue-500', 'bg-slate-700/50');
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            console.log('File dropped:', file.name, file.size, file.type);
            // Manually set the files to the file input
            fileInput.files = e.dataTransfer.files;
            handleFileSelect(file);
        }
    });

    // Button listeners
    saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Save button clicked');
        handleEvidenceUpload();
    });
    
    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Close button clicked');
        closeEvidenceModal();
    });
    
    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Cancel button clicked');
        clearEvidenceSelection();
    });

    // Debug button - show upload logs
    if (debugBtn) {
        debugBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Debug button clicked');
            showUploadLogs();
        });
    }

    console.log('Evidence modal listeners setup completed');
}

function generateQRCode(record) {
    if (!record || !record.room) {
        console.error("Record not found or room missing in record");
        showAlert('ไม่พบข้อมูลที่ถูกต้องสำหรับสร้าง QR Code', 'error');
        return;
    }

    if (!hasPermission('canGenerateQRCode', record.room)) {
        showAlert(`คุณไม่มีสิทธิ์สร้าง QR Code สำหรับห้อง ${record.room}`, 'error');
        return;
    }
    
    if (!record) { // This check is somewhat redundant now but kept for safety.
        console.error("Record not found");
        showAlert('ไม่พบข้อมูลสำหรับสร้าง QR Code', 'error');
        return;
    }

    const promptPayId = '3101700701928' // Consider making this configurable
    const electricAmount = parseFloat(record.total) || 0;
    const waterAmount = parseFloat(record.waterTotal) || 0;
    const totalAmount = electricAmount + waterAmount;

    const canGenerateQR = !isNaN(totalAmount) && totalAmount > 0;
    let qrCodeImage = '';
    let qrCodeCaption = '';
    const receiptBgColor = '#1e293b'; // Corresponds to bg-slate-800

    try {
        if (canGenerateQR) {
            // 1. Generate QR Code payload and image tag
            const payload = window.ThaiQRCode.generatePayload(promptPayId, { amount: totalAmount });
            const qr = qrcode(0, 'M');
            qr.addData(payload);
            qr.make();
            qrCodeImage = `<div class="bg-white p-2 rounded-lg inline-block">${qr.createImgTag(5, 4)}</div>`;
            qrCodeCaption = `<p class="text-sm font-semibold text-slate-400 mt-2">สแกนเพื่อชำระเงินรวม (ค่าไฟ + ค่าน้ำ)</p>`;
        } else {
            qrCodeImage = `
                <div class="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert">
                    <p class="font-bold">ไม่สามารถสร้าง QR Code ได้</p>
                    <p>เนื่องจากยอดชำระรวมไม่ถูกต้อง (฿${totalAmount.toFixed(2)})</p>
                </div>`;
            qrCodeCaption = '';
        }

        // 2. Format data for display
        const dateParts = record.date.split('/'); // dd/mm/yyyy
        const billDate = new Date(parseInt(dateParts[2], 10) - 543, parseInt(dateParts[1], 10) - 1, parseInt(dateParts[0], 10));

        const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        
        const displayDate = !isNaN(billDate.getTime()) ? `${dateParts[0]}/${dateParts[1]}/${parseInt(dateParts[2])}` : "ข้อมูลวันที่ไม่ถูกต้อง";
        const monthName = !isNaN(billDate.getTime()) ? thaiMonths[billDate.getMonth()] : "";
        const year = !isNaN(billDate.getTime()) ? billDate.getFullYear() + 543 : "";

        const summaryText = `ค่าบริการห้อง ${record.room} (${record.name || ''}) ประจำเดือน ${monthName} ${year}`;
        const hasWaterBill = (record.waterTotal && parseFloat(record.waterTotal) > 0);

        // 3. Build the receipt HTML
        const receiptContainer = document.getElementById('receipt-container');
        receiptContainer.innerHTML = `
            <div id="receipt-content" class="bg-white text-gray-800 rounded-lg p-6 shadow-lg" style="font-family: 'Kanit', sans-serif; max-width: 400px; margin: auto;">
                <div class="text-center mb-6">
                    <h3 class="text-xl font-bold text-gray-900">ใบแจ้งค่าบริการ</h3>
                    <p class="text-gray-500 text-sm">${summaryText}</p>
                </div>

                <div class="bg-gray-50 rounded-lg p-4 mb-4">
                    <p class="text-sm text-gray-600">ห้อง</p>
                    <p class="text-2xl font-bold text-indigo-600">${record.room} - ${record.name || 'ไม่มีชื่อ'}</p>
                     <p class="text-sm text-gray-500 mt-2">วันที่จด: ${displayDate}</p>
                     ${record.dueDate ? `<p class="text-sm text-gray-500">ครบกำหนดชำระ: ${record.dueDate}</p>` : ''}
                </div>
                
                <!-- Electricity Details -->
                <div class="border-t border-gray-200 pt-4 mt-4">
                    <h4 class="font-semibold text-gray-700 mb-2">รายละเอียดค่าไฟฟ้า</h4>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">ค่ามิเตอร์ปัจจุบัน:</span>
                            <span class="font-mono font-medium">${record.current} หน่วย</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">ค่ามิเตอร์ครั้งที่แล้ว:</span>
                            <span class="font-mono font-medium">${record.previous} หน่วย</span>
                        </div>
                         <div class="flex justify-between font-semibold">
                            <span class="text-gray-700">จำนวนหน่วยไฟฟ้าที่ใช้:</span>
                            <span class="font-mono text-indigo-600">${record.units} หน่วย</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">อัตราค่าไฟต่อหน่วย:</span>
                            <span class="font-mono font-medium">${parseFloat(record.rate || 0).toFixed(2)} บาท</span>
                        </div>
                        <div class="flex justify-between font-bold text-base pt-1">
                            <span class="text-gray-800">รวมค่าไฟฟ้า:</span>
                            <span class="font-mono text-indigo-700">฿${electricAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <!-- Water Details (Conditional) -->
                ${hasWaterBill ? `
                <div class="border-t border-gray-200 pt-4 mt-4">
                    <h4 class="font-semibold text-gray-700 mb-2">รายละเอียดค่าน้ำ</h4>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">ค่ามิเตอร์น้ำปัจจุบัน:</span>
                            <span class="font-mono font-medium">${record.currentWater || 0} หน่วย</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">ค่ามิเตอร์น้ำครั้งที่แล้ว:</span>
                            <span class="font-mono font-medium">${record.previousWater || 0} หน่วย</span>
                        </div>
                         <div class="flex justify-between font-semibold">
                            <span class="text-gray-700">จำนวนหน่วยน้ำที่ใช้:</span>
                            <span class="font-mono text-indigo-600">${record.waterUnits || 0} หน่วย</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">อัตราค่าน้ำต่อหน่วย:</span>
                            <span class="font-mono font-medium">${parseFloat(record.waterRate || 0).toFixed(2)} บาท</span>
                        </div>
                        <div class="flex justify-between font-bold text-base pt-1">
                            <span class="text-gray-800">รวมค่าน้ำ:</span>
                            <span class="font-mono text-indigo-700">฿${waterAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>` : ''}

                <div class="bg-indigo-50 rounded-lg p-4 mt-6 text-center">
                    <p class="text-sm font-semibold text-indigo-800">ยอดชำระทั้งหมด</p>
                    <h2 class="text-4xl font-bold text-indigo-900 tracking-tight my-1">฿${totalAmount.toFixed(2)}</h2>
                </div>

                <div class="flex flex-col items-center justify-center mt-6">
                    ${qrCodeImage}
                    ${qrCodeCaption}
                </div>

                 <div class="text-xs text-gray-400 mt-6 text-center border-t border-gray-200 pt-2">
                    <p>กรุณาชำระเงินภายในวันที่กำหนด</p>
                </div>
            </div>
        `;
        
        // 4. Setup download button and background color for canvas
        const downloadBtn = document.getElementById('download-qr-btn');
        downloadBtn.style.display = 'flex';
        const receiptElement = document.getElementById('receipt-content');
        const canvasBgColor = window.getComputedStyle(receiptElement).backgroundColor;

        downloadBtn.onclick = () => {
            if (window.html2canvas) {
                html2canvas(receiptElement, { 
                    scale: 3, 
                    backgroundColor: canvasBgColor,
                    useCORS: true
                }).then(canvas => {
                    const link = document.createElement('a');
                    link.href = canvas.toDataURL('image/png');
                    link.download = `bill-receipt-room-${record.room}-${record.date.replace(/\//g, '-')}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }).catch(err => {
                    console.error('Error rendering receipt to image:', err);
                    alert('ขออภัย, ไม่สามารถดาวน์โหลดใบแจ้งหนี้ได้');
                });
            } else {
                console.error('html2canvas is not loaded');
                alert('ไลบรารีสำหรับดาวน์โหลดรูปภาพยังไม่พร้อมใช้งาน');
            }
        };

        // 5. Show the modal
        const modal = document.getElementById('qr-code-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.querySelector('[onclick="closeQrCodeModal()"]').focus();


    } catch (error) {
        console.error("Error generating QR Code:", error);
        alert('เกิดข้อผิดพลาดในการสร้าง QR Code');
    }
}

function downloadQRCode() {
    const canvas = document.getElementById('qr-canvas');
    const link = document.createElement('a');
    link.download = `qr-payment-room-${document.getElementById('qr-room-info').textContent.replace(/\s/g, '-')}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

async function deleteEvidence(key) {
    console.log('=== deleteEvidence started ===');
    logUploadEvent('evidence_delete_started', { billKey: key });
    console.log('Key parameter (bill key):', key);
    
    if (!key) {
        logUploadEvent('evidence_delete_failed', { reason: 'no_key_provided' });
        showAlert('ไม่พบข้อมูล (key) ที่ต้องการลบหลักฐาน', 'error');
        return;
    }
    
    try {
        // Get current evidence data to find the room for permission check
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const data = snapshot.val();
        
        if (!data || !data.room) {
            logUploadEvent('evidence_delete_failed', { reason: 'no_bill_data' });
            showAlert('ไม่พบข้อมูลห้องสำหรับบิลนี้ ไม่สามารถตรวจสอบสิทธิ์ได้', 'error');
            return;
        }

        // Check if payment is already confirmed
        if (data.paymentConfirmed === true) {
            logUploadEvent('evidence_delete_failed', { reason: 'payment_already_confirmed' });
            showAlert('ไม่สามารถลบหลักฐานได้ เนื่องจากเจ้าของห้องได้ยืนยันการชำระเงินแล้ว', 'error');
            return;
        }

        // Permission to delete evidence - using 'canUploadEvidence' for now, might need a specific 'canDeleteEvidence'
        if (!hasPermission('canUploadEvidence', data.room)) {
            logUploadEvent('evidence_delete_failed', { reason: 'no_permission', room: data.room });
            showAlert(`คุณไม่มีสิทธิ์ลบหลักฐานสำหรับห้อง ${data.room}`, 'error');
            return;
        }

        if (!data.evidenceUrl) {
            logUploadEvent('evidence_delete_failed', { reason: 'no_evidence_url' });
            showAlert('ไม่พบหลักฐานที่ต้องการลบ (URL missing)', 'info');
            return;
        }

        // Get evidence metadata for logging
        const metadata = await getEvidenceMetadata(data.evidenceUrl);
        if (metadata) {
            console.log('Evidence metadata:', metadata);
            logUploadEvent('evidence_metadata_retrieved', {
                fileName: metadata.name,
                size: metadata.size,
                contentType: metadata.contentType
            });
        }

        // Confirm deletion with new modal
        showConfirmModal({
            title: 'ยืนยันการลบหลักฐาน',
            text: 'คุณแน่ใจหรือไม่ว่าต้องการลบหลักฐานนี้? การกระทำนี้ไม่สามารถย้อนกลับได้',
            confirmButtonText: 'ใช่, ลบเลย',
            confirmButtonClass: 'bg-orange-600 hover:bg-orange-700',
            onConfirm: async () => {
                try {
                    // Delete from Firebase Storage using new function
                    if (data.evidenceUrl) {
                        const deleteResult = await deleteEvidenceFromStorage(data.evidenceUrl, key);
                        
                        if (!deleteResult.success) {
                            console.warn('Storage deletion failed:', deleteResult.error);
                            logUploadEvent('evidence_delete_storage_failed', deleteResult);
                            // Continue with database update even if storage deletion fails
                        } else {
                            console.log('Evidence file deleted from storage successfully');
                            logUploadEvent('evidence_delete_storage_success', deleteResult);
                        }
                    }
                    
                    // Update database to remove evidence references
                    const updateData = {
                        evidenceUrl: null,
                        evidenceFileName: null,
                        evidenceFileSize: null,
                        evidenceFileType: null,
                        evidenceUploadedAt: null,
                        evidenceUploadedBy: null,
                        evidenceDeletedAt: new Date().toISOString(),
                        evidenceDeletedBy: auth.currentUser?.uid || 'unknown'
                    };
                    
                    // Add storage path if available
                    if (data.evidenceStoragePath) {
                        updateData.evidenceStoragePath = null;
                    }
                    
                    await db.ref(`electricityData/${key}`).update(updateData);
                    
                    logUploadEvent('evidence_delete_success', { 
                        billKey: key,
                        room: data.room,
                        deletedBy: auth.currentUser?.uid
                    });
                    
                    showAlert('ลบหลักฐานเรียบร้อยแล้ว', 'success');
                    
                    // Refresh the table
                    const room = new URLSearchParams(window.location.search).get('room');
                    if (room) {
                        renderHistoryTable(room);
                    } else {
                        renderHomeRoomCards();
                    }
                    
                } catch (error) {
                    logUploadEvent('evidence_delete_failed', { 
                        reason: 'database_update_error',
                        error: error.message
                    });
                    console.error('Error during evidence deletion:', error);
                    showAlert('เกิดข้อผิดพลาดในการลบหลักฐาน กรุณาลองใหม่อีกครั้ง', 'error');
                }
            }
        });
        
    } catch (error) {
        logUploadEvent('evidence_delete_failed', { 
            reason: 'general_error',
            error: error.message,
            stack: error.stack
        });
        console.error('Error deleting evidence:', error);
        showAlert('เกิดข้อผิดพลาดในการลบหลักฐาน', 'error');
    }
    
    console.log('=== deleteEvidence ended ===');
}

// Function to confirm payment by room owner
async function confirmPayment(key) {
    console.log('=== confirmPayment started ===');
    console.log('Key parameter (bill key):', key);
    
    if (!key) {
        showAlert('ไม่พบข้อมูล (key) ที่ต้องการยืนยันการชำระเงิน', 'error');
        return;
    }
    
    try {
        // Get current bill data to find the room for permission check
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const data = snapshot.val();
        
        if (!data || !data.room) {
            showAlert('ไม่พบข้อมูลห้องสำหรับบิลนี้ ไม่สามารถตรวจสอบสิทธิ์ได้', 'error');
            return;
        }

        // Check if payment is already confirmed
        if (data.paymentConfirmed === true) {
            showAlert('การชำระเงินได้รับการยืนยันแล้ว', 'info');
            return;
        }

        // Check if evidence exists
        if (!data.evidenceUrl) {
            showAlert('ไม่พบหลักฐานการชำระเงิน กรุณาแนบหลักฐานก่อนยืนยัน', 'error');
            return;
        }

        // Permission to confirm payment
        if (!hasPermission('canConfirmPayment', data.room)) {
            showAlert(`คุณไม่มีสิทธิ์ยืนยันการชำระเงินสำหรับห้อง ${data.room}`, 'error');
            return;
        }

        showConfirmModal({
            title: 'ยืนยันการชำระเงิน',
            text: 'หลังจากยืนยันแล้ว ลูกบ้านจะไม่สามารถลบหลักฐานได้อีกต่อไป คุณแน่ใจหรือไม่?',
            confirmButtonText: 'ยืนยันการชำระเงิน',
            confirmButtonClass: 'bg-emerald-600 hover:bg-emerald-700',
            onConfirm: async () => {
                await db.ref(`electricityData/${key}`).update({
                    paymentConfirmed: true,
                    paymentConfirmedAt: new Date().toISOString(),
                    paymentConfirmedBy: auth.currentUser?.uid || 'unknown'
                });
                
                showAlert('ยืนยันการชำระเงินเรียบร้อยแล้ว', 'success');
                
                const room = new URLSearchParams(window.location.search).get('room');
                if (room) {
                    renderHistoryTable(room);
                } else {
                    renderHomeRoomCards();
                }
            }
        });
        
    } catch (error) {
        console.error('Error confirming payment:', error);
        showAlert('เกิดข้อผิดพลาดในการยืนยันการชำระเงิน', 'error');
    }
    
    console.log('=== confirmPayment ended ===');
}

function showConfirmModal({ title, text, confirmButtonText = 'ยืนยัน', cancelButtonText = 'ยกเลิก', confirmButtonClass = 'bg-red-600 hover:bg-red-700', onConfirm }) {
    // Check if modal already exists
    let modal = document.getElementById('global-confirm-modal');
    if (modal) {
        modal.remove(); // Remove previous instance to ensure clean state
    }

    // Create modal HTML
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
    
    // Add animations for smooth appearance
    setTimeout(() => {
        const modalContent = modal.querySelector('.transform');
        if (modalContent) {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }
    }, 10);

    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    
    const closeModal = () => {
        const modalContent = modal.querySelector('.transform');
        if (modalContent) {
            modalContent.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            modal.remove();
        }, 200); // Wait for animation to finish
    };

    confirmBtn.onclick = () => {
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
        closeModal();
    };

    cancelBtn.onclick = closeModal;
}

// Room management functions
function openEditRoomNameModal(roomNumber, currentName) {
    if (!hasPermission('canEditAllBills')) {
        showAlert('คุณไม่มีสิทธิ์แก้ไขข้อมูล', 'error');
        return;
    }
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('edit-room-name-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-room-name-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-white">แก้ไขชื่อห้อง</h2>
                    <button class="text-2xl text-slate-400 hover:text-white transition-colors" onclick="closeEditRoomNameModal()">&times;</button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">เลขห้อง</label>
                        <input type="text" id="edit-room-number" readonly class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white cursor-not-allowed">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">ชื่อผู้เช่า</label>
                        <input type="text" id="edit-room-name-input" class="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-white" placeholder="กรอกชื่อผู้เช่า">
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
    
    // Populate form
    document.getElementById('edit-room-number').value = roomNumber;
    document.getElementById('edit-room-name-input').value = currentName;
    
    // Show modal
    modal.classList.remove('hidden');
}

function closeEditRoomNameModal() {
    const modal = document.getElementById('edit-room-name-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function saveRoomNameEdit() {
    if (!hasPermission('canEditAllBills')) {
        showAlert('คุณไม่มีสิทธิ์แก้ไขข้อมูล', 'error');
        return;
    }
    
    const roomNumber = document.getElementById('edit-room-number').value;
    const newName = document.getElementById('edit-room-name-input').value.trim();
    
    if (!newName) {
        showAlert('กรุณากรอกชื่อผู้เช่า', 'error');
        return;
    }
    
    try {
        // Get all bills for this room
        const bills = await loadFromFirebase();
        const roomBills = bills.filter(bill => bill.room === roomNumber);
        
        if (roomBills.length === 0) {
            showAlert('ไม่พบข้อมูลห้องนี้', 'error');
            return;
        }
        
        // Update all bills for this room with new name
        const updates = {};
        roomBills.forEach(bill => {
            updates[`/${bill.key}/name`] = newName;
        });
        
        await db.ref('electricityData').update(updates);
        
        showAlert('แก้ไขชื่อห้องเรียบร้อยแล้ว', 'success');
        closeEditRoomNameModal();
        
        // Refresh room cards
        renderHomeRoomCards();
        
    } catch (error) {
        console.error('Error updating room name:', error);
        showAlert('เกิดข้อผิดพลาดในการแก้ไขชื่อห้อง', 'error');
    }
}

function openDeleteRoomConfirmModal(roomNumber) {
    if (!hasPermission('canDeleteBills')) {
        showAlert('คุณไม่มีสิทธิ์ลบข้อมูล', 'error');
        return;
    }
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('delete-room-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'delete-room-confirm-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-lg text-center">
                <div class="text-red-500 mb-4">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                </div>
                <h2 class="text-xl font-bold text-white mb-2">ยืนยันการลบห้อง</h2>
                <p class="text-slate-400 mb-4">คุณแน่ใจหรือไม่ว่าต้องการลบห้อง <span id="delete-room-number" class="font-bold text-white"></span> และข้อมูลทั้งหมดที่เกี่ยวข้อง?</p>
                <p class="text-red-400 text-sm mb-6">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
                <div class="flex justify-center gap-4">
                    <button onclick="closeDeleteRoomConfirmModal()" class="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors">
                        ยกเลิก
                    </button>
                    <button onclick="confirmDeleteRoom()" class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors">
                        ยืนยันการลบ
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Set room number
    document.getElementById('delete-room-number').textContent = roomNumber;
    
    // Store room number for deletion
    window.roomToDelete = roomNumber;
    
    // Show modal
    modal.classList.remove('hidden');
}

function closeDeleteRoomConfirmModal() {
    const modal = document.getElementById('delete-room-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    window.roomToDelete = null;
}

async function confirmDeleteRoom() {
    if (!hasPermission('canDeleteBills')) {
        showAlert('คุณไม่มีสิทธิ์ลบข้อมูล', 'error');
        return;
    }
    
    const roomNumber = window.roomToDelete;
    if (!roomNumber) {
        showAlert('ไม่พบข้อมูลห้องที่ต้องการลบ', 'error');
        return;
    }
    
    try {
        // Get all bills for this room
        const bills = await loadFromFirebase();
        const roomBills = bills.filter(bill => bill.room === roomNumber);
        
        if (roomBills.length === 0) {
            showAlert('ไม่พบข้อมูลห้องนี้', 'error');
            return;
        }
        
        // Delete all bills for this room
        const deletePromises = roomBills.map(bill => 
            db.ref(`electricityData/${bill.key}`).remove()
        );
        
        await Promise.all(deletePromises);
        
        showAlert(`ลบห้อง ${roomNumber} และข้อมูลทั้งหมดเรียบร้อยแล้ว`, 'success');
        closeDeleteRoomConfirmModal();
        
        // Refresh room cards
        renderHomeRoomCards();
        
    } catch (error) {
        console.error('Error deleting room:', error);
        showAlert('เกิดข้อผิดพลาดในการลบห้อง', 'error');
    }
}

function toggleDropdown(key, event) {
    event.stopPropagation(); // Stop the click from bubbling to the document
    closeAllDropdowns(key); // Close others before opening
    const menu = document.getElementById(`more-actions-menu-${key}`);
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

function closeAllDropdowns(exceptKey = null) {
    const allMenus = document.querySelectorAll('[id^="more-actions-menu-"]');
    allMenus.forEach(m => {
        const key = m.id.replace('more-actions-menu-', '');
        if (key !== exceptKey) {
            m.classList.add('hidden');
        }
    });
}

function closeActionsMenu() {
    const menu = document.getElementById('global-actions-menu');
    if (menu) {
        menu.remove();
    }
}

function openActionsMenu(event, bill) {
    event.stopPropagation();
    const existingMenu = document.getElementById('global-actions-menu');
    const isMenuOpenForThis = existingMenu && existingMenu.dataset.key === bill.key;

    // First, close any existing menu.
    closeActionsMenu();

    // If the menu was already open for this button, just return.
    // This creates the toggle effect.
    if (isMenuOpenForThis) {
        return;
    }

    const room = new URLSearchParams(window.location.search).get('room');
    const isPaymentConfirmed = bill.paymentConfirmed === true;
    const canDeleteEvidence = hasPermission('canUploadEvidence', room) && bill.evidenceUrl && !isPaymentConfirmed;
    const canDeleteRow = hasPermission('canDeleteBills', room) && (!isPaymentConfirmed || window.currentUserRole === 'admin' || window.currentUserRole === '1');

    // Build menu items
    let menuItems = '';
    if (hasPermission('canEditAllBills', room)) {
        menuItems += `
            <a href="#" onclick="event.preventDefault(); openEditModal('${bill.key}')" class="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700" role="menuitem">
                <i class="fas fa-edit fa-fw"></i>
                <span>แก้ไข</span>
            </a>
        `;
    }
    if (canDeleteEvidence) {
        menuItems += `
            <a href="#" onclick="event.preventDefault(); deleteEvidence('${bill.key}')" class="flex items-center gap-3 px-4 py-2 text-sm text-orange-400 hover:bg-slate-700 hover:text-orange-300" role="menuitem">
                <i class="fas fa-file-excel fa-fw"></i>
                <span>ลบหลักฐาน</span>
            </a>
        `;
    }
    if (canDeleteRow) {
         menuItems += `
            <a href="#" onclick="event.preventDefault(); handleDeleteBill('${bill.key}')" class="flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300" role="menuitem">
                <i class="fas fa-trash fa-fw"></i>
                <span>ลบบิลนี้</span>
            </a>
        `;
    }

    if (!menuItems.trim()) return; // Don't show empty menu

    // Create menu container
    const menu = document.createElement('div');
    menu.id = 'global-actions-menu';
    menu.dataset.key = bill.key; // Set a key to identify which button opened it
    menu.className = 'origin-top-right absolute mt-2 w-48 rounded-md shadow-lg bg-slate-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-30 border border-slate-700';
    menu.innerHTML = `<div class="py-1" role="menu" aria-orientation="vertical">${menuItems}</div>`;
    
    document.body.appendChild(menu);

    // Position the menu
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.position = 'fixed';
    
    // Position it, then check if it overflows, and adjust if it does
    let top = rect.bottom + 4;
    let left = rect.right - menu.offsetWidth;

    if (left < 0) {
        left = rect.left; // Align to left if it overflows left
    }
    if (top + menu.offsetHeight > window.innerHeight) {
        top = rect.top - menu.offsetHeight - 4; // Flip to top if it overflows bottom
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

// Add bulk data entry functionality
function addBulkDataEntryButton() {
    const headerSection = document.querySelector('#my-rooms-content .flex.items-center.gap-3');
    if (!headerSection || !hasPermission('canAddNewBills') || document.getElementById('btn-bulk-data-entry')) return;

    const bulkDataBtn = document.createElement('button');
    bulkDataBtn.id = 'btn-bulk-data-entry';
    bulkDataBtn.className = 'btn btn-accent'; // Changed from btn-success
    bulkDataBtn.innerHTML = '<i class="fas fa-database"></i>เพิ่มข้อมูลทุกห้อง';
    bulkDataBtn.onclick = openBulkDataEntryModal;
    headerSection.appendChild(bulkDataBtn);
}

function openBulkDataEntryModal() {
    if (document.getElementById('bulk-data-modal')) {
        openModal('bulk-data-modal');
        return;
    }
    
    // Using a more robust way to create and append the modal
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = `
    <div id="bulk-data-modal" class="modal-backdrop">
        <div class="modal-content max-w-4xl">
            <div class="modal-header">
                <h2 class="modal-title text-accent-400"><i class="fas fa-database mr-3"></i>เพิ่มข้อมูลค่าไฟ-น้ำทุกห้อง</h2>
                <button id="close-bulk-data-modal" class="modal-close-btn">&times;</button>
            </div>
            <form id="bulk-data-form">
                <div class="modal-body">
                    <p>Loading form...</p>
                </div>
                <div class="modal-footer">
                     <button type="submit" class="btn btn-accent w-full text-lg"><i class="fas fa-save"></i>บันทึกข้อมูลทุกห้อง</button>
                </div>
            </form>
        </div>
    </div>`;
    
    document.body.appendChild(modalContainer.firstElementChild);

    const modal = document.getElementById('bulk-data-modal');
    modal.querySelector('#close-bulk-data-modal').onclick = () => closeModal('bulk-data-modal');
    modal.querySelector('#bulk-data-form').onsubmit = handleBulkDataEntry;

    // Populate form content asynchronously
    populateBulkRoomsData(); 
    
    openModal('bulk-data-modal');
}

async function populateBulkRoomsData() {
    const modalBody = document.querySelector('#bulk-data-modal .modal-body');

    if (!modalBody) {
        console.error('Bulk modal body not found!');
        return;
    }

    try {
        const allBills = await loadFromFirebase();
        const user = window.currentUser;
        const userRole = window.currentUserRole;
        const userData = window.currentUserData;

        let displayableBills = [];
        if (userRole === 'admin' || hasPermission('canViewAllRooms')) {
            displayableBills = allBills;
        } else if (userRole === '1' && userData && userData.managedRooms) {
            displayableBills = allBills.filter(bill => userData.managedRooms.includes(bill.room));
        }

        const rooms = [...new Set(displayableBills.map(bill => bill.room))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

        if (rooms.length === 0) {
            modalBody.innerHTML = '<p class="text-center text-red-400">ไม่พบห้องพักที่คุณมีสิทธิ์เข้าถึง</p>';
            return;
        }

        // --- Create the full form HTML ---
        const formHTML = `
            <div class="space-y-6">
                <!-- Section 1: Date & Rates -->
                <fieldset class="bg-slate-700/50 rounded-xl p-5">
                    <legend class="font-semibold text-lg text-white px-2 flex items-center gap-2"><i class="fas fa-cogs text-violet-300"></i>ตั้งค่าโดยรวม</legend>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                        <div class="form-group">
                            <label class="form-label" for="bulk-date">วันที่บันทึก *</label>
                            <input type="text" id="bulk-date" class="form-input" required placeholder="DD/MM/YYYY">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="bulk-due-date">วันครบกำหนด</label>
                            <input type="text" id="bulk-due-date" class="form-input" placeholder="DD/MM/YYYY">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="bulk-electricity-rate">ค่าไฟ/หน่วย *</label>
                            <input type="number" step="0.01" id="bulk-electricity-rate" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="bulk-water-rate">ค่าน้ำ/หน่วย</label>
                            <input type="number" step="0.01" id="bulk-water-rate" class="form-input">
                        </div>
                    </div>
                </fieldset>

                <!-- Section 2: Room Data -->
                <fieldset class="bg-slate-700/50 rounded-xl p-5">
                    <legend class="font-semibold text-lg text-white px-2 flex items-center gap-2"><i class="fas fa-door-open text-amber-300"></i>ข้อมูลมิเตอร์ห้องพัก</legend>
                    <div id="bulk-rooms-list" class="space-y-4 mt-4 max-h-[40vh] overflow-y-auto pr-3">
                        ${rooms.map(room => {
                            const latestBill = displayableBills
                                .filter(bill => bill.room === room && bill.date)
                                .sort((a, b) => new Date(b.date.split('/').reverse().join('-')) - new Date(a.date.split('/').reverse().join('-')))[0] || {};
                            
                            return `
                            <div class="bg-slate-800 rounded-lg p-4 border border-slate-600">
                                <h4 class="text-lg font-semibold text-white mb-3">ห้อง ${room}</h4>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div class="form-group">
                                        <label class="form-label text-sm" for="bulk-electricity-current-${room}">มิเตอร์ไฟ (ปัจจุบัน)</label>
                                        <input type="number" id="bulk-electricity-current-${room}" class="form-input text-sm" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-sm" for="bulk-electricity-previous-${room}">มิเตอร์ไฟ (ก่อนหน้า)</label>
                                        <input type="number" id="bulk-electricity-previous-${room}" class="form-input text-sm bg-slate-900/50" value="${latestBill.current || ''}" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-sm" for="bulk-water-current-${room}">มิเตอร์น้ำ (ปัจจุบัน)</label>
                                        <input type="number" id="bulk-water-current-${room}" class="form-input text-sm">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-sm" for="bulk-water-previous-${room}">มิเตอร์น้ำ (ก่อนหน้า)</label>
                                        <input type="number" id="bulk-water-previous-${room}" class="form-input text-sm bg-slate-900/50" value="${latestBill.waterCurrent || ''}" readonly>
                                    </div>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </fieldset>
            </div>
        `;

        modalBody.innerHTML = formHTML;

        // Initialize Flatpickr for the newly created date inputs
        initializeFlatpickr();

    } catch (error) {
        console.error('Error populating bulk rooms data:', error);
        modalBody.innerHTML = '<p class="text-center text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูลห้อง</p>';
    }
}

async function handleBulkDataEntry(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
    submitBtn.disabled = true;

    try {
        const date = document.getElementById('bulk-date').value;
        const dueDate = document.getElementById('bulk-due-date').value;
        const electricityRate = Number(document.getElementById('bulk-electricity-rate').value);
        const waterRate = Number(document.getElementById('bulk-water-rate').value);

        if (!date || !electricityRate) { // Water rate can be optional
            showAlert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (วันที่, ค่าไฟ/หน่วย)', 'error');
            throw new Error("Missing required fields");
        }
        
        const roomInputs = document.querySelectorAll('#bulk-rooms-list > div');
        const roomsToProcess = Array.from(roomInputs).map(div => div.querySelector('h4').textContent.replace('ห้อง ', '').trim());
        
        let successCount = 0;
        let errorCount = 0;
        let errorRooms = [];

        const allBills = await loadFromFirebase(); // to get the name

        for (const room of roomsToProcess) {
            try {
                const currentElectricityInput = document.getElementById(`bulk-electricity-current-${room}`);
                const previousElectricityInput = document.getElementById(`bulk-electricity-previous-${room}`);
                const currentWaterInput = document.getElementById(`bulk-water-current-${room}`);
                const previousWaterInput = document.getElementById(`bulk-water-previous-${room}`);

                const currentElectricity = Number(currentElectricityInput.value);
                const previousElectricity = Number(previousElectricityInput.value);

                if (isNaN(currentElectricity) || currentElectricity === 0 || isNaN(previousElectricity) || currentElectricity < previousElectricity) {
                    console.warn(`Skipping room ${room} - invalid or missing electricity data.`);
                    errorCount++;
                    errorRooms.push(room);
                    continue;
                }
                
                const latestBillForRoom = allBills
                    .filter(bill => bill.room === room)
                    .sort((a, b) => new Date(b.date.split('/').reverse().join('-')) - new Date(a.date.split('/').reverse().join('-')))[0] || {};

                const billData = {
                    room: room,
                    name: latestBillForRoom.name || 'ไม่มีชื่อ',
                    date: date,
                    dueDate: dueDate || '',
                    current: currentElectricity,
                    previous: previousElectricity,
                    units: currentElectricity - previousElectricity,
                    rate: electricityRate,
                    total: (currentElectricity - previousElectricity) * electricityRate,
                    timestamp: Date.now()
                };

                // Add water data if available
                const currentWater = Number(currentWaterInput.value);
                const previousWater = Number(previousWaterInput.value);
                if (!isNaN(currentWater) && !isNaN(previousWater) && currentWater >= previousWater && waterRate > 0) {
                     billData.waterCurrent = currentWater;
                     billData.waterPrevious = previousWater;
                     billData.waterUnits = currentWater - previousWater;
                     billData.waterRate = waterRate;
                     billData.waterTotal = (currentWater - previousWater) * waterRate;
                } else {
                     billData.waterCurrent = 0;
                     billData.waterPrevious = 0;
                     billData.waterUnits = 0;
                     billData.waterRate = 0;
                     billData.waterTotal = 0;
                }

                await saveToFirebase(billData);
                successCount++;
            } catch (innerError) {
                console.error(`Error processing room ${room}:`, innerError);
                errorCount++;
                errorRooms.push(room);
            }
        }

        if (successCount > 0) {
            let successMessage = `บันทึกข้อมูลสำเร็จ ${successCount} ห้อง`;
            if (errorCount > 0) {
                successMessage += ` (มีข้อผิดพลาด ${errorCount} ห้อง: ${errorRooms.join(', ')})`;
            }
            showAlert(successMessage, 'success');
        } else {
            showAlert(`ไม่สามารถบันทึกข้อมูลได้ มีข้อผิดพลาด ${errorCount} ห้อง`, 'error');
        }

        closeModal('bulk-data-modal');
        renderHomeRoomCards();

    } catch (error) {
        console.error('Error in bulk data entry:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// --- Modal Control Functions with Animation ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
    // Use setTimeout to allow the display property to apply before adding the class for transition
    setTimeout(() => {
        modal.classList.add('active');
        
        // Initialize Flatpickr for specific modals
        if (modalId === 'add-room-modal') {
            initializeFlatpickr();
        }
    }, 10); 
}

document.addEventListener('DOMContentLoaded', () => {
    // Apply staggered entrance animations to elements with data-animation attribute
    const animatedElements = document.querySelectorAll('[data-animation]');
    animatedElements.forEach((el, index) => {
        // Ensure the element is visible before animating
        if (window.getComputedStyle(el).display !== 'none') {
            el.classList.add('animate-on-load');
            el.style.animationDelay = `${index * 120}ms`;
        }
    });
});

// Helper function to re-apply animation when tabs are switched
function triggerTabAnimation(tabContentId) {
    const animatedElements = document.querySelectorAll(`#${tabContentId} [data-animation]`);
    animatedElements.forEach((el, index) => {
        el.classList.remove('animate-on-load');
        // Void line to trigger reflow, which is necessary to restart a CSS animation
        void el.offsetWidth; 
        el.classList.add('animate-on-load');
        el.style.animationDelay = `${index * 120}ms`;
    });
}

// --- Event Listeners for Evidence Upload Modal ---
document.addEventListener('DOMContentLoaded', function() {
    // This entire block only runs on pages with the evidence modal (i.e., index.html)
    const evidenceModal = document.getElementById('evidence-modal');
    if (!evidenceModal) {
        return; // Do nothing if the modal isn't on the page
    }

    const cameraBtn = document.getElementById('camera-btn');
    const galleryBtn = document.getElementById('gallery-btn');
    const fileBtn = document.getElementById('file-btn');
    const imageInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    const dropzone = document.getElementById('evidence-dropzone');
    const saveBtn = document.getElementById('evidence-save-btn');
    const clearBtn = document.getElementById('evidence-clear-btn');
    let fileToUpload = null;

    // --- Function to programmatically click a file input ---
    function triggerFileInput(inputElement) {
        if (!inputElement) return;
        inputElement.value = null; // Reset to allow re-selecting the same file
        inputElement.click();
    }

    // --- Attach listeners to the upload buttons ---
    if (cameraBtn) cameraBtn.addEventListener('click', () => triggerFileInput(cameraInput));
    if (galleryBtn) galleryBtn.addEventListener('click', () => triggerFileInput(imageInput));
    if (fileBtn) fileBtn.addEventListener('click', () => triggerFileInput(imageInput));

    // --- Function to handle when a file is selected ---
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            // Add file type and size validation
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
            const maxSize = 5 * 1024 * 1024; // 5 MB
            const errorEl = document.getElementById('evidence-error');
            errorEl.textContent = ''; // Clear previous errors

            if (!allowedTypes.includes(file.type)) {
                errorEl.textContent = 'ชนิดไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ JPG, PNG, หรือ GIF';
                return;
            }
            if (file.size > maxSize) {
                errorEl.textContent = 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)';
                return;
            }
            
            fileToUpload = file;
            displayPreview(file);
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    // --- Attach listeners to the hidden file inputs ---
    if (imageInput) imageInput.addEventListener('change', handleFileSelect);
    if (cameraInput) cameraInput.addEventListener('change', handleFileSelect);

    // --- Function to show a preview of the selected image ---
    function displayPreview(file) {
        const previewContainer = document.getElementById('evidence-preview');
        const placeholder = document.getElementById('evidence-placeholder');
        if (!previewContainer || !placeholder) return;

        previewContainer.innerHTML = ''; // Clear previous preview
        placeholder.classList.add('hidden');

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'max-h-48 rounded-lg object-contain mx-auto';
            previewContainer.appendChild(img);
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    // --- Function to clear the form ---
    function resetUploadForm() {
        fileToUpload = null;
        if (imageInput) imageInput.value = null;
        if (cameraInput) cameraInput.value = null;

        const previewContainer = document.getElementById('evidence-preview');
        const placeholder = document.getElementById('evidence-placeholder');
        const errorEl = document.getElementById('evidence-error');

        if (previewContainer) previewContainer.innerHTML = '';
        if (placeholder) placeholder.classList.remove('hidden');
        if (saveBtn) saveBtn.disabled = true;
        if (errorEl) errorEl.textContent = '';
        
        const progressContainer = document.getElementById('upload-progress-container');
        const statusEl = document.getElementById('upload-status');
        if (progressContainer) progressContainer.classList.add('hidden');
        if (statusEl) statusEl.classList.add('hidden');
    }

    if (clearBtn) clearBtn.addEventListener('click', resetUploadForm);
    
    // --- Attach listener to the save button ---
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const currentKey = evidenceModal.dataset.key;
            if (!fileToUpload || !currentKey) {
                console.error("ไม่มีไฟล์หรือ Key สำหรับบันทึก");
                console.log("Debug info:", { fileToUpload: !!fileToUpload, currentKey });
                // Try to call the main upload function which handles its own validation
                await handleEvidenceUpload();
                return;
            }
            await handleEvidenceUpload();
        });
    }

    // --- Drag and Drop functionality ---
    if (dropzone) {
        dropzone.addEventListener('click', (e) => {
            if (e.target === dropzone || e.target.id === 'evidence-placeholder' || placeholder.contains(e.target)) {
                 triggerFileInput(imageInput);
            }
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('border-blue-500', 'bg-slate-700/50');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('border-blue-500', 'bg-slate-700/50');
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                 // Create a synthetic event to reuse the handleFileSelect logic
                handleFileSelect({ target: { files: files } });
            }
        });
    }
});

// Add comprehensive logging utility
function logUploadEvent(event, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        event,
        userAgent: navigator.userAgent,
        isMobile: isMobileDevice(),
        protocol: location.protocol,
        url: window.location.href,
        ...data
    };
    
    console.log('=== UPLOAD LOG ===', logEntry);
    
    // Store in session storage for debugging
    try {
        const logs = JSON.parse(sessionStorage.getItem('uploadLogs') || '[]');
        logs.push(logEntry);
        // Keep only last 50 logs
        if (logs.length > 50) {
            logs.splice(0, logs.length - 50);
        }
        sessionStorage.setItem('uploadLogs', JSON.stringify(logs));
    } catch (error) {
        console.warn('Failed to store upload log:', error);
    }
}

// Add mobile detection utility

// Add function to display upload logs for debugging
function showUploadLogs() {
    try {
        const logs = JSON.parse(sessionStorage.getItem('uploadLogs') || '[]');
        if (logs.length === 0) {
            showAlert('ไม่มีข้อมูล log การอัปโหลด', 'info');
            return;
        }
        
        const logText = logs.map(log => 
            `[${log.timestamp}] ${log.event}: ${JSON.stringify(log, null, 2)}`
        ).join('\n\n');
        
        // Create a modal to show logs
        const logModal = document.createElement('div');
        logModal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
        logModal.innerHTML = `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-4xl mx-4 shadow-lg max-h-[80vh] overflow-hidden flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-white">Upload Logs (Debug)</h2>
                    <button class="text-2xl text-slate-400 hover:text-white" onclick="this.closest('.fixed').remove()">&times;</button>
                </div>
                <div class="flex-1 overflow-y-auto bg-slate-900 p-4 rounded-lg">
                    <pre class="text-xs text-slate-300 whitespace-pre-wrap">${logText}</pre>
                </div>
                <div class="mt-4 flex gap-2">
                    <button class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg" onclick="clearUploadLogs()">ล้าง Logs</button>
                    <button class="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg" onclick="this.closest('.fixed').remove()">ปิด</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(logModal);
    } catch (error) {
        console.error('Error showing upload logs:', error);
        showAlert('เกิดข้อผิดพลาดในการแสดง logs', 'error');
    }
}

// Add function to clear upload logs
function clearUploadLogs() {
    try {
        sessionStorage.removeItem('uploadLogs');
        showAlert('ล้าง logs เรียบร้อยแล้ว', 'success');
        // Close the log modal
        const logModal = document.querySelector('.fixed');
        if (logModal) logModal.remove();
    } catch (error) {
        console.error('Error clearing upload logs:', error);
        showAlert('เกิดข้อผิดพลาดในการล้าง logs', 'error');
    }
}

// Add Firebase Storage validation and rules check
async function validateFirebaseStorage() {
    try {
        console.log('=== Validating Firebase Storage ===');
        
        // Check if Firebase is available
        if (!firebase || !firebase.apps || firebase.apps.length === 0) {
            throw new Error('Firebase not initialized');
        }
        
        // Check if Storage is available - use global storage variable or firebase.storage()
        const storageInstance = window.storage || firebase.storage();
        if (!storageInstance) {
            throw new Error('Firebase Storage not available');
        }
        
        // Check if user is authenticated
        if (!auth.currentUser) {
            throw new Error('User not authenticated');
        }
        
        // Test storage access with a small test file
        const testRef = storageInstance.ref(`test/${auth.currentUser.uid}/test.txt`);
        
        // Try to upload a small test file
        const testBlob = new Blob(['test'], { type: 'text/plain' });
        const testUpload = await testRef.put(testBlob);
        
        // Get download URL
        const testURL = await testUpload.snapshot.ref.getDownloadURL();
        
        // Clean up test file
        await testUpload.snapshot.ref.delete();
        
        console.log('Firebase Storage validation successful');
        return {
            success: true,
            message: 'Firebase Storage is working correctly'
        };
        
    } catch (error) {
        console.error('Firebase Storage validation failed:', error);
        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

// Add function to get storage usage information
async function getStorageUsageInfo() {
    try {
        // Get storage instance - try multiple approaches
        const storageInstance = window.storage || firebase.storage();
        if (!storageInstance) {
            throw new Error('Firebase Storage not available');
        }
        
        const userID = auth.currentUser?.uid;
        
        if (!userID) {
            throw new Error('User not authenticated');
        }
        
        // List files in user's evidence folder
        const evidenceRef = storageInstance.ref('evidence');
        const result = await evidenceRef.listAll();
        
        let totalSize = 0;
        let fileCount = 0;
        
        // Calculate total size of user's files
        for (const item of result.items) {
            if (item.fullPath.includes(userID)) {
                const metadata = await item.getMetadata();
                totalSize += metadata.size;
                fileCount++;
            }
        }
        
        return {
            totalSize,
            fileCount,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
        };
        
    } catch (error) {
        console.error('Error getting storage usage:', error);
        return null;
    }
}

// Add function to delete evidence file from Firebase Storage
async function deleteEvidenceFromStorage(evidenceUrl, billKey) {
    try {
        console.log('=== Deleting evidence from Firebase Storage ===');
        logUploadEvent('storage_delete_started', { evidenceUrl, billKey });
        
        if (!evidenceUrl) {
            console.warn('No evidence URL provided for deletion');
            return { success: false, error: 'No evidence URL provided' };
        }
        
        // Extract file path from URL
        const url = new URL(evidenceUrl);
        const pathMatch = url.pathname.match(/\/o\/(.+?)\?/);
        
        if (!pathMatch) {
            console.warn('Could not extract file path from URL:', evidenceUrl);
            return { success: false, error: 'Invalid evidence URL format' };
        }
        
        const filePath = decodeURIComponent(pathMatch[1]);
        console.log('File path to delete:', filePath);
        
        // Get storage reference
        const storageInstance = window.storage || firebase.storage();
        if (!storageInstance) {
            throw new Error('Firebase Storage not available');
        }
        const fileRef = storageInstance.ref(filePath);
        
        // Delete the file
        await fileRef.delete();
        
        console.log('File deleted successfully from Firebase Storage');
        logUploadEvent('storage_delete_success', { filePath });
        
        return { success: true, filePath };
        
    } catch (error) {
        console.error('Error deleting file from Firebase Storage:', error);
        logUploadEvent('storage_delete_failed', { 
            error: error.message,
            code: error.code,
            evidenceUrl
        });
        
        return { 
            success: false, 
            error: error.message,
            code: error.code
        };
    }
}

// Add function to get evidence file metadata
async function getEvidenceMetadata(evidenceUrl) {
    try {
        if (!evidenceUrl) {
            return null;
        }
        
        // Extract file path from URL
        const url = new URL(evidenceUrl);
        const pathMatch = url.pathname.match(/\/o\/(.+?)\?/);
        
        if (!pathMatch) {
            return null;
        }
        
        const filePath = decodeURIComponent(pathMatch[1]);
        const storageInstance = window.storage || firebase.storage();
        if (!storageInstance) {
            return null;
        }
        const fileRef = storageInstance.ref(filePath);
        
        const metadata = await fileRef.getMetadata();
        return metadata;
        
    } catch (error) {
        console.error('Error getting evidence metadata:', error);
        return null;
    }
}

async function openRoomSettingsModal(roomId) {
    const modal = document.getElementById('room-settings-modal');
    const modalBody = document.getElementById('room-settings-body');
    const roomNumberSpan = document.getElementById('settings-room-number');

    if (!modal || !modalBody || !roomNumberSpan) return;
    
    roomNumberSpan.textContent = roomId;
    modalBody.innerHTML = `<div class="text-center p-8"><i class="fas fa-spinner fa-spin text-3xl"></i></div>`;
    openModal('room-settings-modal');

    try {
        const roomSnapshot = await db.ref(`rooms/${roomId}`).once('value');
        if (roomSnapshot.exists()) {
            const roomData = roomSnapshot.val();
            renderSettingsModalBody(roomId, roomData);
        } else {
            console.warn(`[Settings] No settings for room ${roomId}. Showing form to create them.`);
            // Fetch latest bill to get the tenant name as a fallback
            const billsSnapshot = await db.ref('electricityData').orderByChild('room').equalTo(roomId).once('value');
            let latestBill = null;
            if (billsSnapshot.exists()) {
                const bills = billsSnapshot.val();
                for (const key in bills) {
                    const bill = { key, ...bills[key] };
                    if (!bill.date || typeof bill.date !== 'string' || bill.date.split('/').length !== 3) continue;
                    if (!latestBill || new Date(bill.date.split('/').reverse().join('-')) > new Date(latestBill.date.split('/').reverse().join('-'))) {
                        latestBill = bill;
                    }
                }
            }
            const fallbackData = {
                tenantName: latestBill ? latestBill.name : '',
            };
            renderSettingsModalBody(roomId, fallbackData);
        }
    } catch (error) {
        console.error(`Error loading settings for room ${roomId}:`, error);
        modalBody.innerHTML = `<p class="text-red-400 text-center">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>`;
    }
}

function renderSettingsModalBody(roomId, roomData = {}) {
    const modalBody = document.getElementById('room-settings-body');
    if (!modalBody) return;

    const tenantName = roomData.tenantName || '';
    const rent = roomData.rent || 0;
    const roomSize = roomData.roomSize || '';
    const addons = roomData.addons || [];
    
    modalBody.innerHTML = `
        <div class="space-y-6">
            <!-- General Settings -->
            <fieldset class="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <legend class="font-semibold text-lg text-white px-2">ข้อมูลทั่วไป</legend>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <div class="form-group">
                        <label class="form-label" for="settings-tenant-name">ชื่อผู้เช่า</label>
                        <input type="text" id="settings-tenant-name" class="form-input" value="${tenantName}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="settings-rent">ค่าเช่า (บาท)</label>
                        <input type="number" id="settings-rent" class="form-input" value="${rent}">
                    </div>
                    <div class="form-group sm:col-span-2">
                        <label class="form-label" for="settings-room-size">ขนาดห้อง</label>
                        <input type="text" id="settings-room-size" class="form-input" value="${roomSize}">
                    </div>
                </div>
            </fieldset>

            <!-- Add-ons -->
            <fieldset class="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <legend class="font-semibold text-lg text-white px-2">ค่าบริการเสริม</legend>
                <div id="settings-addons-container" class="space-y-3 mt-4">
                    ${addons.map((addon, index) => `
                        <div class="flex items-center gap-2" id="addon-item-${index}">
                            <input type="text" class="form-input flex-grow addon-name-input" placeholder="ชื่อบริการ" value="${addon.name || ''}">
                            <input type="number" class="form-input w-32 addon-price-input" placeholder="ราคา" value="${addon.price || 0}">
                            <button type="button" class="btn-danger rounded-full h-8 w-8 flex-shrink-0" onclick="this.parentElement.remove()"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" id="settings-add-addon-btn" class="mt-4 w-full text-sm btn btn-secondary"><i class="fas fa-plus"></i>เพิ่มบริการเสริม</button>
            </fieldset>
            
            <!-- Assessment Form -->
            <fieldset class="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                 <legend class="font-semibold text-lg text-white px-2">ใบประเมินอุปกรณ์</legend>
                 <div id="settings-assessment-container" class="mt-4"></div>
            </fieldset>

            <!-- Action Buttons -->
            <div class="flex justify-between items-center pt-4 border-t border-slate-600 mt-6">
                 <button type="button" onclick="deleteRoom('${roomId}')" class="btn btn-danger"><i class="fas fa-trash"></i> ลบห้องนี้</button>
                 <button type="button" onclick="saveRoomSettings('${roomId}')" class="btn btn-primary"><i class="fas fa-save"></i> บันทึกการเปลี่ยนแปลง</button>
            </div>
        </div>
    `;

    document.getElementById('settings-add-addon-btn').addEventListener('click', () => {
        const container = document.getElementById('settings-addons-container');
        const newAddon = document.createElement('div');
        newAddon.className = 'flex items-center gap-2 animate-on-load';
        newAddon.innerHTML = `
            <input type="text" class="form-input flex-grow addon-name-input" placeholder="ชื่อบริการ">
            <input type="number" class="form-input w-32 addon-price-input" placeholder="ราคา">
            <button type="button" class="btn-danger rounded-full h-8 w-8 flex-shrink-0" onclick="this.parentElement.remove()"><i class="fas fa-trash-alt"></i></button>
        `;
        container.appendChild(newAddon);
    });
    
    renderAssessmentSection(roomId, roomData.assessmentFormUrl || '');
}

async function saveRoomSettings(roomId) {
    const tenantName = document.getElementById('settings-tenant-name').value;
    const rent = parseFloat(document.getElementById('settings-rent').value) || 0;
    const roomSize = document.getElementById('settings-room-size').value;

    const addons = [];
    const addonNameInputs = document.querySelectorAll('#settings-addons-container .addon-name-input');
    const addonPriceInputs = document.querySelectorAll('#settings-addons-container .addon-price-input');
    addonNameInputs.forEach((nameInput, i) => {
        const name = nameInput.value.trim();
        const price = parseFloat(addonPriceInputs[i].value) || 0;
        if (name) {
            addons.push({ name, price });
        }
    });

    try {
        const roomRef = db.ref(`rooms/${roomId}`);
        const snapshot = await roomRef.once('value');
        
        if (snapshot.exists()) {
            await roomRef.update({ tenantName, rent, roomSize, addons });
        } else {
            const newRoomSettings = {
                tenantName,
                rent,
                roomSize,
                addons,
                createdAt: new Date().toISOString(),
                createdBy: auth.currentUser?.uid || 'system_generated',
                assessmentFormUrl: ''
            };
            await roomRef.set(newRoomSettings);
        }

        showAlert('บันทึกการตั้งค่าสำเร็จ', 'success');
        closeModal('room-settings-modal');
        renderHomeRoomCards();
    } catch (error) {
        console.error('Error saving settings:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึก', 'error');
    }
}

function renderAssessmentSection(roomId, assessmentUrl) {
    const container = document.getElementById('settings-assessment-container');
    if (!container) return;

    let content = '';
    if (assessmentUrl) {
        content = `
            <p class="text-slate-300 mb-2">ใบประเมินปัจจุบัน:</p>
            <img src="${assessmentUrl}" class="rounded-lg max-w-xs h-auto shadow-md mb-2">
            <button class="btn btn-secondary btn-sm" onclick="deleteAssessment('${roomId}')"><i class="fas fa-trash"></i> ลบรูปนี้</button>
        `;
    } else {
        content = `
            <p class="text-slate-400 mb-2">ยังไม่มีใบประเมิน</p>
            <input type="file" id="assessment-upload-input" class="form-input" accept="image/*">
            <button class="btn btn-primary btn-sm mt-2" onclick="handleAssessmentUpload('${roomId}')"><i class="fas fa-upload"></i> อัปโหลด</button>
        `;
    }
    container.innerHTML = content;
}

async function handleAssessmentUpload(roomId) {
    const fileInput = document.getElementById('assessment-upload-input');
    const file = fileInput.files[0];
    if (!file) {
        showAlert('กรุณาเลือกไฟล์', 'error');
        return;
    }
    showAlert('กำลังอัปโหลด...', 'info');
    try {
        const storageRef = firebase.storage().ref();
        const filePath = `assessmentForms/${roomId}/${Date.now()}_${file.name}`;
        const fileRef = storageRef.child(filePath);
        await fileRef.put(file);
        const url = await fileRef.getDownloadURL();
        await db.ref(`rooms/${roomId}`).update({ assessmentFormUrl: url });
        showAlert('อัปโหลดสำเร็จ', 'success');
        renderAssessmentSection(roomId, url);
    } catch (error) {
        console.error('Upload failed:', error);
        showAlert('อัปโหลดล้มเหลว', 'error');
    }
}

async function deleteAssessment(roomId) {
    if (!confirm('แน่ใจหรือไม่ว่าต้องการลบใบประเมินนี้?')) return;
    showAlert('กำลังลบ...', 'info');
    try {
        const roomRef = db.ref(`rooms/${roomId}`);
        const snapshot = await roomRef.once('value');
        const fileUrl = snapshot.val().assessmentFormUrl;
        if (fileUrl) {
            const fileRef = firebase.storage().refFromURL(fileUrl);
            await fileRef.delete();
        }
        await roomRef.update({ assessmentFormUrl: '' });
        showAlert('ลบสำเร็จ', 'success');
        renderAssessmentSection(roomId, '');
    } catch (error) {
        console.error('Delete failed:', error);
        showAlert('การลบล้มเหลว', 'error');
    }
}

async function deleteRoom(roomId) {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบห้อง ${roomId} และข้อมูลบิลทั้งหมดที่เกี่ยวข้อง? การกระทำนี้ไม่สามารถย้อนกลับได้!`)) return;
    
    showAlert('กำลังลบห้องและข้อมูลทั้งหมด...', 'info');
    try {
        // Delete from rooms
        await db.ref(`rooms/${roomId}`).remove();

        // Find and delete all bills associated with this room
        const billsQuery = db.ref('electricityData').orderByChild('room').equalTo(roomId);
        const billsSnapshot = await billsQuery.once('value');
        if (billsSnapshot.exists()) {
            const updates = {};
            billsSnapshot.forEach(child => {
                updates[child.key] = null;
            });
            await db.ref('electricityData').update(updates);
        }
        
        // Optionally delete storage files (assessment, evidence)
        // This is more complex, skipping for now to avoid prolonged deletion process

        showAlert(`ลบห้อง ${roomId} เรียบร้อยแล้ว`, 'success');
        closeModal('room-settings-modal');
        renderHomeRoomCards();

    } catch (error) {
        console.error('Error deleting room:', error);
        showAlert('เกิดข้อผิดพลาดในการลบห้อง', 'error');
    }
}

async function generateInvoice(billKey) {
    if (!billKey) {
        showAlert('ไม่สามารถสร้างใบแจ้งหนี้ได้: ไม่พบข้อมูลบิล', 'warning');
        return;
    }

    const invoiceModal = document.getElementById('invoice-modal');
    const invoiceBody = document.getElementById('invoice-modal-body');
    const downloadBtn = document.getElementById('download-invoice-btn');
    if (!invoiceModal || !invoiceBody || !downloadBtn) return;

    try {
        // Show loading state
        invoiceBody.innerHTML = `<div class="text-center p-8 text-slate-600"><i class="fas fa-spinner fa-spin text-3xl"></i><p class="mt-2">กำลังสร้างใบแจ้งหนี้...</p></div>`;
        openModal('invoice-modal');

        // 1. Fetch the specific bill
        const billSnapshot = await db.ref(`electricityData/${billKey}`).once('value');
        if (!billSnapshot.exists()) {
            throw new Error('ไม่พบข้อมูลบิล');
        }
        const billData = billSnapshot.val();

        // 2. Fetch the corresponding room settings
        const roomSnapshot = await db.ref(`rooms/${billData.room}`).once('value');
        let roomData;
        
        if (roomSnapshot.exists()) {
            roomData = roomSnapshot.val();
        } else {
            // If no room settings exist (legacy room), create a fallback object
            console.warn(`[Invoice] No settings found for room ${billData.room}. Using fallback data.`);
            roomData = {
                rent: 0, // Assume 0 rent if not set
                addons: [],
                tenantName: billData.name || 'N/A' // Use name from the bill as a fallback
            };
        }
        
        // 3. Calculate all costs
        const rent = Number(roomData.rent || 0);
        const electricTotal = Number(billData.total || 0);
        const waterTotal = Number(billData.waterTotal || 0);
        const addons = roomData.addons || [];
        const addonsTotal = addons.reduce((acc, addon) => acc + Number(addon.price || 0), 0);
        const grandTotal = rent + electricTotal + waterTotal + addonsTotal;

        // 4. Build invoice HTML
        invoiceBody.innerHTML = `
            <div id="invoice-content" class="p-6 bg-white text-gray-800 font-sans">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">ใบแจ้งค่าใช้จ่าย</h1>
                        <p class="text-gray-500">สำหรับห้อง: <span class="font-semibold text-gray-700">${billData.room}</span></p>
                        <p class="text-gray-500">ผู้เช่า: <span class="font-semibold text-gray-700">${roomData.tenantName || 'N/A'}</span></p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-500">วันที่บันทึก: ${billData.date}</p>
                        <p class="text-sm text-gray-500 font-bold text-red-600">กำหนดชำระ: ${billData.dueDate || 'ไม่มี'}</p>
                    </div>
                </div>

                <div class="border-t border-b border-gray-200 py-4 mb-6">
                    <div class="text-lg font-semibold mb-2 text-gray-700">สรุปค่าใช้จ่าย:</div>
                    <table class="w-full">
                        <tbody>
                            <tr class="border-b border-gray-100">
                                <td class="py-2">ค่าเช่าห้อง</td>
                                <td class="text-right py-2">${rent.toLocaleString('en-US', { style: 'currency', currency: 'THB' })}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2">ค่าไฟฟ้า (${billData.units} หน่วย)</td>
                                <td class="text-right py-2">${electricTotal.toLocaleString('en-US', { style: 'currency', currency: 'THB' })}</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-2">ค่าน้ำ (${billData.waterUnits || 0} หน่วย)</td>
                                <td class="text-right py-2">${waterTotal.toLocaleString('en-US', { style: 'currency', currency: 'THB' })}</td>
                            </tr>
                            ${addons.map(addon => `
                                <tr class="border-b border-gray-100">
                                    <td class="py-2">${addon.name}</td>
                                    <td class="text-right py-2">${Number(addon.price || 0).toLocaleString('en-US', { style: 'currency', currency: 'THB' })}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="text-right">
                    <p class="text-gray-600">ยอดรวม</p>
                    <p class="text-3xl font-bold text-gray-900">${grandTotal.toLocaleString('en-US', { style: 'currency', currency: 'THB' })}</p>
                </div>

                <div class="mt-8 pt-4 border-t border-gray-200 text-center">
                    <p class="text-gray-600 font-semibold">ขอขอบคุณ</p>
                </div>
            </div>
        `;

        // 5. Add event listener for download
        downloadBtn.onclick = () => {
             // Temporarily set body background to white for capture
            document.body.style.backgroundColor = 'white';
            const invoiceContent = document.getElementById('invoice-content');
            
            html2canvas(invoiceContent, {
                 scale: 2, // Improve quality
                 backgroundColor: '#ffffff'
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `invoice-room-${billData.room}-${billData.date.replace(/\//g, '-')}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                // Revert body background
                document.body.style.backgroundColor = '';
            });
        };

    } catch (error) {
        console.error("Error generating invoice:", error);
        invoiceBody.innerHTML = `<p class="text-red-500 text-center p-8">${error.message}</p>`;
    }
}