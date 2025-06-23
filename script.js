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
        
        // FIX: Add event listener for add room button
        document.getElementById('btn-add-room')?.addEventListener('click', () => openModal('add-room-modal'));
        
        // FIX: Add event listener for add room form
        document.getElementById('add-room-form')?.addEventListener('submit', handleAddRoom);
        
        // FIX: Add event listener for add-on button
        document.getElementById('add-on-button')?.addEventListener('click', addAddonInput);
        
        // FIX: Initialize Level 1 Owner interface
        if (typeof initializeLevel1OwnerInterface === 'function') {
            initializeLevel1OwnerInterface();
        } else {
            // For non-level 1 users, ensure my-rooms-content is visible
            const myRoomsContent = document.getElementById('my-rooms-content');
            if (myRoomsContent) {
                myRoomsContent.classList.remove('hidden');
            }
        }
        
        // Add event listeners for admin tools
        document.getElementById('btn-view-all-invoices')?.addEventListener('click', openAllInvoicesModal);
        document.getElementById('btn-admin-panel')?.addEventListener('click', () => window.location.href = 'admin.html');
        
        // Add event listeners for all invoices modal
        document.getElementById('close-all-invoices-modal')?.addEventListener('click', () => closeModal('all-invoices-modal'));
        document.getElementById('close-all-invoices-modal-btn')?.addEventListener('click', () => closeModal('all-invoices-modal'));
        document.getElementById('search-invoices')?.addEventListener('input', filterAllInvoices);
        document.getElementById('filter-invoice-room')?.addEventListener('change', filterAllInvoices);
        document.getElementById('filter-invoice-date')?.addEventListener('change', filterAllInvoices);
        document.getElementById('invoices-prev-page')?.addEventListener('click', () => changeInvoicesPage(-1));
        document.getElementById('invoices-next-page')?.addEventListener('click', () => changeInvoicesPage(1));
        document.getElementById('export-invoices-csv')?.addEventListener('click', exportInvoicesToCSV);
        document.getElementById('download-filtered-invoices-btn')?.addEventListener('click', downloadFilteredInvoices);
        document.getElementById('download-selected-invoices-btn')?.addEventListener('click', downloadSelectedInvoices);
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

function updateRoomStatusSummary(total, occupied, vacant) {
    const summaryContainer = document.getElementById('room-status-summary');
    if (!summaryContainer) return;
    
    summaryContainer.innerHTML = `
        <span class="flex items-center gap-2" title="ห้องทั้งหมด">
            <i class="fas fa-th-large text-slate-400"></i>
            <strong>ทั้งหมด:</strong> ${total}
        </span>
        <span class="flex items-center gap-2" title="ห้องที่มีคนอยู่">
            <i class="fas fa-user-check text-green-400"></i>
            <strong>มีคนอยู่:</strong> ${occupied}
        </span>
        <span class="flex items-center gap-2" title="ห้องว่าง">
            <i class="fas fa-person-booth text-yellow-400"></i>
            <strong>ว่าง:</strong> ${vacant}
        </span>
    `;
}

function sortRooms(rooms) {
    if (!Array.isArray(rooms)) return [];
    return rooms.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

async function renderHomeRoomCards() {
    
    const cardsContainer = document.getElementById('home-room-cards');
    if (!cardsContainer) {
        return;
    }

    cardsContainer.innerHTML = '<p class="text-center text-gray-400 col-span-full py-8">กำลังโหลดข้อมูลห้องพัก (เริ่มต้น)...</p>';

    try {
        const roomsSnapshot = await db.ref('rooms').once('value'); 
        const allRoomsSettings = roomsSnapshot.val() || {};

        const allBills = await loadFromFirebase(); 

        const allRoomIdsFromBills = allBills.map(b => b.room);
        const allRoomIdsFromRooms = Object.keys(allRoomsSettings);
        const allRoomIds = [...new Set([...allRoomIdsFromBills, ...allRoomIdsFromRooms])].filter(Boolean);

        const userRole = window.currentUserRole;
        const userData = window.currentUserData;
        
        let displayableRoomIds = allRoomIds; 
        
        if (userRole === 'admin') {
            if (userData && userData.buildingCode) {
                displayableRoomIds = allRoomIds.filter(roomId => {
                    const roomInfo = allRoomsSettings[roomId];
                    return roomInfo && roomInfo.buildingCode === userData.buildingCode;
                });
            }
        } else if (userRole === '1' && userData && userData.managedRooms) {
            displayableRoomIds = allRoomIds.filter(roomId => userData.managedRooms.includes(roomId));
        } else if (userRole === 'level1_tenant' && userData && userData.accessibleRooms) {
            displayableRoomIds = allRoomIds.filter(roomId => userData.accessibleRooms.includes(roomId));
        }
        
        if (displayableRoomIds.length === 0) {
            cardsContainer.innerHTML = '<p class="text-center text-gray-400 col-span-full py-8">ไม่พบข้อมูลห้องพักที่คุณมีสิทธิ์เข้าถึง</p>';
            updateRoomStatusSummary(0, 0, 0);
            return;
        }

        const latestBillsMap = allBills.reduce((acc, bill) => {
            if (displayableRoomIds.includes(bill.room)) { 
                if (!acc[bill.room] || new Date(bill.date.split('/').reverse().join('-')) > new Date(acc[bill.room].date.split('/').reverse().join('-'))) {
                    acc[bill.room] = bill;
                }
            }
            return acc;
        }, {});

        window.allRoomsData = displayableRoomIds.map(roomId => {
            return {
                id: roomId,
                bill: latestBillsMap[roomId] || { room: roomId },
                ...(allRoomsSettings[roomId] || { status: 'vacant' })
            };
        });

        let occupiedCount = 0;
        let vacantCount = 0;
        window.allRoomsData.forEach(room => {
            if (room.status === 'occupied') {
                occupiedCount++;
            } else {
                vacantCount++;
            }
        });
        
        updateRoomStatusSummary(displayableRoomIds.length, occupiedCount, vacantCount);
        const sortedRooms = sortRooms(window.allRoomsData);
       
        buildCardContainer(cardsContainer, sortedRooms);

    } catch (error) {
        console.error('An error occurred during renderHomeRoomCards:', error); 
        cardsContainer.innerHTML = `<p class="text-center text-red-400 col-span-full py-8">เกิดข้อผิดพลาด: ${error.message}</p>`;
        updateRoomStatusSummary(0, 0, 0);
    }
}

function buildCardContainer(cardsContainer, sortedRooms) {
    console.log('Building card container with sorted rooms:', sortedRooms);
    cardsContainer.innerHTML = '';
    if (!sortedRooms || sortedRooms.length === 0) {
        cardsContainer.innerHTML = `
            <div class="col-span-full text-center py-12 bg-slate-800/50 rounded-lg">
                <i class="fas fa-eye-slash text-5xl text-slate-500"></i>
                <h3 class="mt-4 text-xl font-semibold text-white">ไม่พบข้อมูลห้องพัก</h3>
                <p class="text-slate-400 mt-2">ไม่มีห้องพักที่ตรงกับเงื่อนไข หรือข้อมูลกำลังโหลด</p>
            </div>
        `;
        return;
    }

    sortedRooms.forEach(room => {
        try {
            const { id, bill, status, tenantName, roomSize } = room;

            // --- Data validation and setting defaults ---
            const billExists = bill && bill.id;
            const currentTenantName = tenantName || (billExists ? bill.name : 'ไม่มีผู้เช่า');
            const roomStatus = status || (billExists ? 'occupied' : 'vacant');
            // Use totalAll if available, otherwise fallback to total, then 0
            const totalAmount = billExists ? (bill.totalAll !== undefined ? bill.totalAll : (bill.total !== undefined ? bill.total : 0) ) : 0;
            const dueDateInfo = billExists ? getDueDateInfo(bill.dueDate) : { text: 'ไม่มีข้อมูล', color: 'text-slate-500' };
            const lastBillDate = billExists ? (bill.date || 'ไม่มีข้อมูล') : 'ไม่มีข้อมูล';

            const card = document.createElement('div');
            card.className = `room-card bg-slate-800 rounded-xl shadow-lg border border-slate-700/80 p-4 flex flex-col transition-all duration-300 hover:border-blue-500/70 hover:shadow-blue-500/10 relative`;
            card.dataset.roomId = id;
            
            let statusBadgeHTML = '';
            if (roomStatus === 'occupied') {
                statusBadgeHTML = `<div class="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-400/30">มีคนอยู่</div>`;
            } else {
                 statusBadgeHTML = `<div class="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-400/30">ว่าง</div>`;
            }

            const totalAmountColor = totalAmount > 0 ? 'text-red-400' : 'text-slate-300';
            
            card.innerHTML = `
                ${statusBadgeHTML}
                <div class="flex-grow flex flex-col">
                    <div class="flex-grow">
                        <h3 class="text-3xl font-bold text-white tracking-wider">${id}</h3>
                        <div class="text-sm text-slate-400 mt-1 space-y-1 min-h-[3rem]">
                            <p class="flex items-center min-h-[20px]">
                                <i class="fas fa-user w-4 mr-2 text-slate-500"></i>
                                <span>${currentTenantName}</span>
                            </p>
                            ${roomSize ? `
                            <p class="flex items-center min-h-[20px]">
                                <i class="fas fa-ruler-combined w-4 mr-2 text-slate-500"></i>
                                <span>${roomSize}</span>
                            </p>
                            ` : ''}
                        </div>

                        <div class="mt-4 text-center bg-slate-800/50 rounded-lg py-2">
                            <p class="text-xs text-slate-500">ยอดชำระล่าสุด</p>
                            <p class="text-3xl font-light ${totalAmountColor} tracking-tight">
                               ฿${Number(totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    <div class="mt-3 space-y-1">
                        <div class="flex justify-between text-xs text-slate-400">
                            <span>กำหนดชำระ:</span>
                            <span class="font-semibold ${dueDateInfo.color}">${dueDateInfo.text}</span>
                        </div>
                    </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-700 grid grid-cols-4 gap-2 text-center">
                     <button onclick="viewRoomHistory('${id}')" title="ประวัติและเพิ่มบิล" class="card-icon-button">
                        <i class="fas fa-history"></i>
                    </button>
                    <button onclick="generateInvoiceForRoom('${id}')" title="ใบแจ้งหนี้" class="card-icon-button">
                        <i class="fas fa-file-invoice-dollar"></i>
                    </button>
                    <button onclick="openAssessmentModal('${id}')" title="ใบประเมินอุปกรณ์" class="card-icon-button">
                        <i class="fas fa-clipboard-check"></i>
                    </button>
                    <button onclick="openRoomSettingsModal('${id}')" title="ตั้งค่าห้อง" class="card-icon-button">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            `;
            
            cardsContainer.appendChild(card);

        } catch (error) {
            console.error(`CRITICAL: Failed to build card for room ID: ${room.id}.`, error);
            const errorCard = document.createElement('div');
            errorCard.className = 'bg-red-900/50 border border-red-700 rounded-lg p-4 text-center';
            errorCard.innerHTML = `<p class="font-semibold text-red-300">เกิดข้อผิดพลาดในการแสดงผลห้อง ${room.id}</p><p class="text-xs text-red-400">${error.message}</p>`;
            cardsContainer.appendChild(errorCard);
        }
    });
}

async function promptForTenantName(roomId, currentName) {
    const newName = prompt(`แก้ไขชื่อผู้เช่าสำหรับห้อง ${roomId}:`, currentName);
    if (newName && newName.trim() !== '' && newName !== currentName) {
        try {
            await db.ref(`rooms/${roomId}`).update({ tenantName: newName.trim() });
            showAlert('อัปเดตชื่อผู้เช่าสำเร็จ', 'success');
            renderHomeRoomCards();
        } catch (error) {
            // If the room doesn't exist in the 'rooms' collection yet, create it.
            if (error.message.includes("permission_denied")) { // A bit of a guess, but common for non-existent paths
                 try {
                    const newRoomSettings = {
                        tenantName: newName.trim(),
                        rent: 0,
                        roomSize: '',
                        addons: [],
                        createdAt: new Date().toISOString(),
                        createdBy: auth.currentUser?.uid || 'system_generated',
                        assessmentFormUrl: ''
                    };
                    await db.ref(`rooms/${roomId}`).set(newRoomSettings);
                    showAlert('สร้างและอัปเดตชื่อผู้เช่าสำเร็จ', 'success');
                    renderHomeRoomCards();
                 } catch (e) {
                    console.error('Failed to create room settings while updating name:', e);
                    showAlert('เกิดข้อผิดพลาดในการบันทึกชื่อ', 'error');
                 }
            } else {
                console.error('Error updating tenant name:', error);
                showAlert('เกิดข้อผิดพลาดในการบันทึกชื่อ', 'error');
            }
        }
    }
}

function getDueDateInfo(dueDate) {
    if (!dueDate) return { show: false, text: '' };
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize today's date
    dueDate.setHours(0, 0, 0, 0); // Normalize due date

    const diffTime = Math.abs(dueDate - now);
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

    return { show: true, text: `ครบกำหนดวันที่ ${dueDate.toLocaleDateString()}`, color: 'text-gray-400' };
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
                    ${hasPermission('canGenerateInvoice', room) ? `
                        <button onclick="generateInvoice('${bill.key}')" class="text-green-400 hover:text-green-300 transition-colors" title="ใบแจ้งหนี้">
                            <i class="fas fa-file-invoice-dollar fa-lg"></i>
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
    const user = auth.currentUser;
    if (!user) {
        return [];
    }

    let dataRef;
    if (room) {
        dataRef = db.ref(`electricityData`).orderByChild('room').equalTo(room);
    } else {
        dataRef = db.ref(`electricityData`);
    }

    try {
        const snapshot = await dataRef.once('value');
        const data = snapshot.val();
        if (data) {
            const dataArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
            return dataArray;
        }
        return [];
    } catch (error) {
        console.error("CRITICAL: Error loading data from Firebase:", error);
        return [];
    }
}

async function saveToFirebase(data) {
    try {
        // Add building code to the data if user is admin
        const userData = window.currentUserData;
        if (window.currentUserRole === 'admin' && userData && userData.buildingCode) {
            data.buildingCode = userData.buildingCode;
        }
        
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

        // Add building code if user is admin
        const userData = window.currentUserData;
        if (window.currentUserRole === 'admin' && userData && userData.buildingCode) {
            newRoomData.buildingCode = userData.buildingCode;
        }

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

    // Add building code if user is admin
    const userData = window.currentUserData;
    if (window.currentUserRole === 'admin' && userData && userData.buildingCode) {
        billData.buildingCode = userData.buildingCode;
    }

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
            modal.style.display = 'none';
            modal.style.visibility = 'hidden';
            document.body.classList.remove('modal-open');
        }
    }, 300);
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
    const isAdmin = window.currentUserRole === 'admin' || window.currentUserRole === '1';
    if (!isAdmin) return;

    const container = document.querySelector('#home-room-cards').previousElementSibling.querySelector('.flex.items-center.gap-3');
    if (container && !document.getElementById('btn-bulk-add')) {
        const button = document.createElement('button');
        button.id = 'btn-bulk-add';
        // Changed to purple button to match user's screenshot
        button.className = 'btn bg-purple-600 hover:bg-purple-700 text-white';
        button.innerHTML = '<i class="fas fa-database"></i> เพิ่มข้อมูลทุกห้อง';
        button.onclick = openBulkDataEntryModal;
        
        // Insert after the Add Room button
        const addRoomBtn = document.getElementById('btn-add-room');
        if(addRoomBtn) {
            addRoomBtn.insertAdjacentElement('afterend', button);
        } else {
            container.appendChild(button);
        }
    }
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
        if (userRole === 'admin') {
            if (userData && userData.buildingCode) {
                // New, building-specific admin
                displayableBills = allBills.filter(bill => bill.buildingCode === userData.buildingCode);
            } else {
                // Legacy "super" admin can see all bills
                displayableBills = allBills;
            }
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
        const commonOptions = {
            dateFormat: "d/m/Y",
            altInput: true,
            altFormat: "j F Y",
            locale: "th",
            allowInput: true
        };
        flatpickr("#bulk-date", commonOptions);
        flatpickr("#bulk-due-date", commonOptions);

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

                // Add building code if user is admin
                const userData = window.currentUserData;
                if (window.currentUserRole === 'admin' && userData && userData.buildingCode) {
                    billData.buildingCode = userData.buildingCode;
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
    if (!modal) {
        console.error(`Modal with id '${modalId}' not found`);
        return;
    }

    // Prevent body scroll when modal is open
    document.body.classList.add('modal-open');
    
    // Show modal
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    
    // Use setTimeout to allow the display property to apply before adding the class for transition
    setTimeout(() => {
        modal.classList.add('active');
        
        // Initialize Flatpickr for specific modals
        if (modalId === 'add-room-modal') {
            initializeFlatpickr();
        }
    }, 10);
}

function closeModal(modalId) {
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
            modal.style.display = 'none';
            modal.style.visibility = 'hidden';
            document.body.classList.remove('modal-open');
        }
    }, 300);
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
            <div class="space-y-3">
                <p class="text-slate-300 mb-2">ใบประเมินปัจจุบัน:</p>
                <img src="${assessmentUrl}" class="rounded-lg max-w-xs h-auto shadow-md mb-2">
                <div class="flex gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="deleteAssessment('${roomId}')"><i class="fas fa-trash"></i> ลบรูปนี้</button>
                    <button class="btn btn-accent btn-sm" onclick="openAssessmentModal('${roomId}', ${JSON.stringify({}).replace(/"/g, '&quot;')})"><i class="fas fa-clipboard-check"></i> สร้างใบประเมินใหม่</button>
                </div>
            </div>
        `;
    } else {
        content = `
            <div class="space-y-3">
                <p class="text-slate-400 mb-2">ยังไม่มีใบประเมิน</p>
                <div class="flex gap-2">
                    <button class="btn btn-accent btn-sm" onclick="openAssessmentModal('${roomId}', ${JSON.stringify({}).replace(/"/g, '&quot;')})"><i class="fas fa-clipboard-check"></i> สร้างใบประเมินใหม่</button>
                    <div class="flex-1">
                        <input type="file" id="assessment-upload-input" class="form-input" accept="image/*">
                        <button class="btn btn-primary btn-sm mt-2" onclick="handleAssessmentUpload('${roomId}')"><i class="fas fa-upload"></i> อัปโหลด</button>
                    </div>
                </div>
            </div>
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

async function generateInvoiceForRoom(roomId) {
    if (!roomId) {
        showAlert('ไม่สามารถสร้างใบแจ้งหนี้ได้: ไม่พบข้อมูลห้อง', 'warning');
        return;
    }

    try {
        // Get the latest bill key for this room
        const latestBillKey = await getLatestBillKeyForRoom(roomId);
        
        if (!latestBillKey) {
            showAlert('ไม่พบข้อมูลบิลสำหรับห้องนี้', 'warning');
            return;
        }
        
        // Call the original generateInvoice function with the bill key
        await generateInvoice(latestBillKey);
        
    } catch (error) {
        console.error('Error generating invoice for room:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้างใบแจ้งหนี้: ' + error.message, 'error');
    }
}

async function generateInvoice(billId) {
    if (!hasPermission('canGenerateInvoice')) {
        showAlert('คุณไม่มีสิทธิ์สร้างใบแจ้งหนี้', 'error');
        return;
    }

    try {
        // Find the invoice data from the pre-loaded global array.
        // This is faster and avoids potential Firebase security rule issues with direct gets.
        const billData = window.allInvoicesData?.find(invoice => invoice.id === billId);

        if (!billData) {
            // As a fallback, try to fetch directly if not found in the array.
            // This might be necessary if called from a context where allInvoicesData is not populated.
            console.warn(`Invoice ${billId} not found in local data, attempting direct fetch.`);
            const billSnapshot = await db.ref(`electricityData/${billId}`).once('value');
            if (!billSnapshot.exists()) {
                throw new Error('ไม่พบข้อมูลบิล');
            }
            const fallbackData = { id: billSnapshot.key, ...billSnapshot.val() };
            await displayAndHandleInvoice(fallbackData);
            return;
        }

        await displayAndHandleInvoice(billData);

    } catch (error) {
        console.error('Error generating invoice:', error);
        showAlert(`เกิดข้อผิดพลาดในการสร้างใบแจ้งหนี้: ${error.message}`, 'error');
    }
}

// Helper function to display the invoice and set up its handlers
async function displayAndHandleInvoice(billData) {
    const invoiceContent = await generateInvoiceHTML(billData);
    if (!invoiceContent) {
        throw new Error('ไม่สามารถสร้างเนื้อหาใบแจ้งหนี้ได้');
    }

    const modalBody = document.getElementById('invoice-modal-body');
    const downloadBtn = document.getElementById('download-invoice-btn');
    modalBody.innerHTML = invoiceContent;

    // Setup download button
    downloadBtn.onclick = async () => {
        try {
            const canvas = await generateInvoiceCanvas(billData);
            const link = document.createElement('a');
            const room = billData.room || 'unknown';
            const date = billData.date ? billData.date.replace(/\//g, '-') : 'nodate';
            link.download = `invoice-${room}-${date}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (dlError) {
            console.error('Error during invoice download:', dlError);
            showAlert('เกิดข้อผิดพลาดในการดาวน์โหลดใบแจ้งหนี้', 'error');
        }
    };

    openModal('invoice-modal');
}

async function getLatestBillKeyForRoom(roomId) {
    if (!hasPermission('canViewHistory', roomId)) {
        showAlert('คุณไม่มีสิทธิ์ดูประวัติของห้อง', 'error');
        return null;
    }

    try {
        const snapshot = await db.ref('electricityData')
            .orderByChild('room')
            .equalTo(roomId)
            .once('value');
        
        const data = snapshot.val();
        if (!data) return null;
        
        // Find the latest bill by date
        let latestBillKey = null;
        let latestDate = null;
        
        Object.keys(data).forEach(key => {
            const bill = data[key];
            if (bill.date) {
                const billDate = new Date(bill.date.split('/').reverse().join('-'));
                if (!latestDate || billDate > latestDate) {
                    latestDate = billDate;
                    latestBillKey = key;
                }
            }
        });
        
        return latestBillKey;
    } catch (error) {
        console.error('Error getting latest bill key for room:', error);
        return null;
    }
}

// Function to open assessment modal
function openAssessmentModal(roomId, roomData = {}) {
    const modal = document.getElementById('assessment-modal');
    const modalBody = document.getElementById('assessment-modal-body');
    
    if (!modal || !modalBody) {
        console.error('Assessment modal elements not found');
        return;
    }
    
    // Populate modal content
    modalBody.innerHTML = `
        <div class="space-y-6">
            <!-- Room Information -->
            <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <h3 class="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <i class="fas fa-info-circle text-blue-400"></i>
                    ข้อมูลห้อง
                </h3>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-slate-400">เลขห้อง:</span>
                        <span class="text-white font-medium">${roomId}</span>
                    </div>
                    <div>
                        <span class="text-slate-400">ผู้เช่า:</span>
                        <span class="text-white font-medium">${roomData.tenantName || 'ไม่ระบุ'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400">ขนาดห้อง:</span>
                        <span class="text-white font-medium">${roomData.roomSize || 'ไม่ระบุ'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400">วันที่ตรวจสอบ:</span>
                        <span class="text-white font-medium">${new Date().toLocaleDateString('th-TH')}</span>
                    </div>
                </div>
            </div>

            <!-- Equipment Assessment Form -->
            <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <i class="fas fa-clipboard-check text-green-400"></i>
                    ตรวจสอบอุปกรณ์ในห้อง
                </h3>
                
                <div id="equipment-checklist" class="space-y-4">
                    <!-- Equipment items will be generated here -->
                </div>
                
                <button type="button" id="add-equipment-item" class="mt-4 w-full btn btn-secondary">
                    <i class="fas fa-plus"></i> เพิ่มรายการอุปกรณ์
                </button>
            </div>

            <!-- Notes Section -->
            <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <h3 class="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <i class="fas fa-sticky-note text-yellow-400"></i>
                    หมายเหตุเพิ่มเติม
                </h3>
                <textarea id="assessment-notes" 
                          class="w-full h-24 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          placeholder="บันทึกหมายเหตุเพิ่มเติมเกี่ยวกับสภาพอุปกรณ์..."></textarea>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-3">
                <button type="button" id="download-assessment-btn" class="btn btn-success flex-1">
                    <i class="fas fa-download"></i> ดาวน์โหลดแบบฟอร์ม
                </button>
                <button type="button" id="save-assessment-btn" class="btn btn-primary flex-1">
                    <i class="fas fa-save"></i> บันทึกข้อมูล
                </button>
            </div>
        </div>
    `;
    
    // Generate default equipment checklist
    generateEquipmentChecklist();
    
    // Add event listeners
    setupAssessmentModalListeners(roomId, roomData);
    
    // Open modal
    openModal('assessment-modal');
}

// Generate default equipment checklist
function generateEquipmentChecklist() {
    const container = document.getElementById('equipment-checklist');
    if (!container) return;
    
    const defaultEquipment = [
        { name: 'แอร์คอนดิชัน', category: 'เครื่องปรับอากาศ' },
        { name: 'พัดลม', category: 'เครื่องปรับอากาศ' },
        { name: 'ตู้เย็น', category: 'เครื่องใช้ไฟฟ้า' },
        { name: 'ทีวี', category: 'เครื่องใช้ไฟฟ้า' },
        { name: 'เครื่องซักผ้า', category: 'เครื่องใช้ไฟฟ้า' },
        { name: 'เตาไฟฟ้า', category: 'เครื่องใช้ไฟฟ้า' },
        { name: 'ไมโครเวฟ', category: 'เครื่องใช้ไฟฟ้า' },
        { name: 'ตู้เสื้อผ้า', category: 'เฟอร์นิเจอร์' },
        { name: 'เตียง', category: 'เฟอร์นิเจอร์' },
        { name: 'โต๊ะทำงาน', category: 'เฟอร์นิเจอร์' },
        { name: 'เก้าอี้', category: 'เฟอร์นิเจอร์' },
        { name: 'โคมไฟ', category: 'แสงสว่าง' },
        { name: 'พรม', category: 'ตกแต่ง' },
        { name: 'ผ้าม่าน', category: 'ตกแต่ง' },
        { name: 'กุญแจ', category: 'ความปลอดภัย' },
        { name: 'ประตู', category: 'โครงสร้าง' },
        { name: 'หน้าต่าง', category: 'โครงสร้าง' },
        { name: 'พื้น', category: 'โครงสร้าง' },
        { name: 'ผนัง', category: 'โครงสร้าง' },
        { name: 'ห้องน้ำ', category: 'สุขภัณฑ์' },
        { name: 'อ่างล้างหน้า', category: 'สุขภัณฑ์' },
        { name: 'ฝักบัว', category: 'สุขภัณฑ์' },
        { name: 'ชักโครก', category: 'สุขภัณฑ์' }
    ];
    
    container.innerHTML = defaultEquipment.map((item, index) => `
        <div class="equipment-item bg-slate-800 rounded-lg p-4 border border-slate-600" data-index="${index}">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                    <span class="text-xs bg-slate-600 text-slate-300 px-2 py-1 rounded-full">${item.category}</span>
                    <h4 class="font-medium text-white">${item.name}</h4>
                </div>
                <button type="button" class="text-red-400 hover:text-red-300" onclick="removeEquipmentItem(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <label class="block text-sm text-slate-400 mb-1">สภาพ</label>
                    <select class="equipment-condition w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500">
                        <option value="excellent">ดีเยี่ยม</option>
                        <option value="good" selected>ดี</option>
                        <option value="fair">ปานกลาง</option>
                        <option value="poor">แย่</option>
                        <option value="damaged">เสียหาย</option>
                        <option value="missing">หายไป</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm text-slate-400 mb-1">จำนวน</label>
                    <input type="number" class="equipment-quantity w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500" value="1" min="0">
                </div>
                <div>
                    <label class="block text-sm text-slate-400 mb-1">หมายเหตุ</label>
                    <input type="text" class="equipment-notes w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500" placeholder="หมายเหตุเพิ่มเติม">
                </div>
            </div>
        </div>
    `).join('');
}

// Remove equipment item
function removeEquipmentItem(index) {
    const item = document.querySelector(`[data-index="${index}"]`);
    if (item) {
        item.remove();
    }
}

// Setup assessment modal event listeners
function setupAssessmentModalListeners(roomId, roomData) {
    // Add equipment item button
    const addBtn = document.getElementById('add-equipment-item');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const container = document.getElementById('equipment-checklist');
            const newIndex = container.children.length;
            
            const newItem = document.createElement('div');
            newItem.className = 'equipment-item bg-slate-800 rounded-lg p-4 border border-slate-600 animate-on-load';
            newItem.setAttribute('data-index', newIndex);
            newItem.innerHTML = `
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <input type="text" class="equipment-category bg-slate-600 text-slate-300 px-2 py-1 rounded-full text-xs w-20" placeholder="หมวดหมู่">
                        <input type="text" class="equipment-name font-medium text-white bg-transparent border-b border-slate-600 focus:border-blue-500 outline-none" placeholder="ชื่ออุปกรณ์">
                    </div>
                    <button type="button" class="text-red-400 hover:text-red-300" onclick="removeEquipmentItem(${newIndex})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-sm text-slate-400 mb-1">สภาพ</label>
                        <select class="equipment-condition w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500">
                            <option value="excellent">ดีเยี่ยม</option>
                            <option value="good" selected>ดี</option>
                            <option value="fair">ปานกลาง</option>
                            <option value="poor">แย่</option>
                            <option value="damaged">เสียหาย</option>
                            <option value="missing">หายไป</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm text-slate-400 mb-1">จำนวน</label>
                        <input type="number" class="equipment-quantity w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500" value="1" min="0">
                    </div>
                    <div>
                        <label class="block text-sm text-slate-400 mb-1">หมายเหตุ</label>
                        <input type="text" class="equipment-notes w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500" placeholder="หมายเหตุเพิ่มเติม">
                    </div>
                </div>
            `;
            container.appendChild(newItem);
        });
    }
    
    // Download assessment button
    const downloadBtn = document.getElementById('download-assessment-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            downloadAssessmentForm(roomId, roomData);
        });
    }
    
    // Save assessment button
    const saveBtn = document.getElementById('save-assessment-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveAssessmentData(roomId, roomData);
        });
    }
    
    // Close modal button
    const closeBtn = document.getElementById('close-assessment-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal('assessment-modal');
        });
    }
}

// Download assessment form as PDF/Image
function downloadAssessmentForm(roomId, roomData) {
    // Create a printable version of the assessment form
    const assessmentData = collectAssessmentData();
    
    // Create HTML content for the form
    const formHTML = generateAssessmentFormHTML(roomId, roomData, assessmentData);
    
    // Create a temporary container
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = formHTML;
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '800px';
    tempContainer.style.backgroundColor = 'white';
    tempContainer.style.color = 'black';
    tempContainer.style.padding = '20px';
    tempContainer.style.fontFamily = 'Arial, sans-serif';
    
    document.body.appendChild(tempContainer);
    
    // Use html2canvas to convert to image
    html2canvas(tempContainer, {
        scale: 2,
        backgroundColor: '#ffffff',
        width: 800,
        height: tempContainer.scrollHeight
    }).then(canvas => {
        // Create download link
        const link = document.createElement('a');
        link.download = `ใบประเมินอุปกรณ์_ห้อง${roomId}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL();
        link.click();
        
        // Clean up
        document.body.removeChild(tempContainer);
        
        showAlert('ดาวน์โหลดแบบฟอร์มสำเร็จ', 'success');
    }).catch(error => {
        console.error('Error generating assessment form:', error);
        showAlert('เกิดข้อผิดพลาดในการดาวน์โหลด', 'error');
        document.body.removeChild(tempContainer);
    });
}

// Collect assessment data from form
function collectAssessmentData() {
    const equipmentItems = [];
    const equipmentElements = document.querySelectorAll('.equipment-item');
    
    equipmentElements.forEach((element, index) => {
        const nameInput = element.querySelector('.equipment-name');
        const categoryInput = element.querySelector('.equipment-category');
        const conditionSelect = element.querySelector('.equipment-condition');
        const quantityInput = element.querySelector('.equipment-quantity');
        const notesInput = element.querySelector('.equipment-notes');
        
        equipmentItems.push({
            name: nameInput ? nameInput.value || nameInput.placeholder : `อุปกรณ์ ${index + 1}`,
            category: categoryInput ? categoryInput.value || categoryInput.placeholder : 'ไม่ระบุ',
            condition: conditionSelect ? conditionSelect.value : 'good',
            quantity: quantityInput ? parseInt(quantityInput.value) || 1 : 1,
            notes: notesInput ? notesInput.value : ''
        });
    });
    
    const notes = document.getElementById('assessment-notes') ? document.getElementById('assessment-notes').value : '';
    
    return {
        equipment: equipmentItems,
        notes: notes,
        assessmentDate: new Date().toISOString()
    };
}

// Generate HTML for assessment form
function generateAssessmentFormHTML(roomId, roomData, assessmentData) {
    const conditionLabels = {
        'excellent': 'ดีเยี่ยม',
        'good': 'ดี',
        'fair': 'ปานกลาง',
        'poor': 'แย่',
        'damaged': 'เสียหาย',
        'missing': 'หายไป'
    };
    
    return `
        <div style="font-family: 'Sarabun', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px;">
                <h1 style="font-size: 24px; font-weight: bold; margin: 0; color: #333;">ใบประเมินอุปกรณ์ในห้องพัก</h1>
                <p style="font-size: 16px; margin: 10px 0 0 0; color: #666;">Equipment Assessment Form</p>
            </div>
            
            <!-- Room Information -->
            <div style="margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="font-size: 18px; font-weight: bold; margin: 0 0 15px 0; color: #333;">ข้อมูลห้อง</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; width: 150px; font-weight: bold; color: #555;">เลขห้อง:</td>
                        <td style="padding: 8px 0; color: #333;">${roomId}</td>
                        <td style="padding: 8px 0; width: 150px; font-weight: bold; color: #555;">ผู้เช่า:</td>
                        <td style="padding: 8px 0; color: #333;">${roomData.tenantName || 'ไม่ระบุ'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold; color: #555;">ขนาดห้อง:</td>
                        <td style="padding: 8px 0; color: #333;">${roomData.roomSize || 'ไม่ระบุ'}</td>
                        <td style="padding: 8px 0; font-weight: bold; color: #555;">วันที่ตรวจสอบ:</td>
                        <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString('th-TH')}</td>
                    </tr>
                </table>
            </div>
            
            <!-- Equipment Checklist -->
            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 18px; font-weight: bold; margin: 0 0 15px 0; color: #333;">รายการตรวจสอบอุปกรณ์</h2>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
                    <thead>
                        <tr style="background-color: #f5f5f5;">
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: bold; color: #333;">ลำดับ</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: bold; color: #333;">หมวดหมู่</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: bold; color: #333;">ชื่ออุปกรณ์</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: center; font-weight: bold; color: #333;">จำนวน</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: center; font-weight: bold; color: #333;">สภาพ</th>
                            <th style="border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: bold; color: #333;">หมายเหตุ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${assessmentData.equipment.map((item, index) => `
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 12px; text-align: center; color: #333;">${index + 1}</td>
                                <td style="border: 1px solid #ddd; padding: 12px; color: #333;">${item.category}</td>
                                <td style="border: 1px solid #ddd; padding: 12px; color: #333;">${item.name}</td>
                                <td style="border: 1px solid #ddd; padding: 12px; text-align: center; color: #333;">${item.quantity}</td>
                                <td style="border: 1px solid #ddd; padding: 12px; text-align: center; color: #333;">${conditionLabels[item.condition] || item.condition}</td>
                                <td style="border: 1px solid #ddd; padding: 12px; color: #333;">${item.notes}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <!-- Notes Section -->
            ${assessmentData.notes ? `
                <div style="margin-bottom: 30px;">
                    <h2 style="font-size: 18px; font-weight: bold; margin: 0 0 15px 0; color: #333;">หมายเหตุเพิ่มเติม</h2>
                    <div style="padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9; color: #333;">
                        ${assessmentData.notes.replace(/\n/g, '<br>')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Signature Section -->
            <div style="margin-top: 50px; display: flex; justify-content: space-between;">
                <div style="text-align: center; width: 45%;">
                    <div style="border-top: 1px solid #333; padding-top: 10px; margin-bottom: 10px;"></div>
                    <p style="margin: 0; font-weight: bold; color: #333;">ผู้ตรวจสอบ</p>
                    <p style="margin: 5px 0 0 0; color: #666;">(Inspector)</p>
                </div>
                <div style="text-align: center; width: 45%;">
                    <div style="border-top: 1px solid #333; padding-top: 10px; margin-bottom: 10px;"></div>
                    <p style="margin: 0; font-weight: bold; color: #333;">ผู้เช่า</p>
                    <p style="margin: 5px 0 0 0; color: #666;">(Tenant)</p>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px;">
                <p style="margin: 0;">เอกสารนี้ถูกสร้างโดยระบบจัดการห้องพัก - ${new Date().toLocaleDateString('th-TH')}</p>
            </div>
        </div>
    `;
}

// Save assessment data to database
async function saveAssessmentData(roomId, roomData) {
    try {
        const assessmentData = collectAssessmentData();
        
        // Save to database
        const assessmentRef = db.ref(`assessments/${roomId}`);
        await assessmentRef.set({
            ...assessmentData,
            roomId: roomId,
            roomData: roomData,
            createdBy: auth.currentUser?.uid || 'unknown',
            createdAt: new Date().toISOString()
        });
        
        showAlert('บันทึกข้อมูลการประเมินสำเร็จ', 'success');
        closeModal('assessment-modal');
        
    } catch (error) {
        console.error('Error saving assessment data:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
}

// Function to add a new add-on input field
function addAddonInput() {
    const container = document.getElementById('add-ons-container');
    if (container) {
        const newAddon = document.createElement('div');
        newAddon.className = 'flex items-center gap-2 animate-on-load';
        newAddon.style.animation = 'fadeInUp 0.3s ease-out forwards';
        newAddon.innerHTML = `
            <input type="text" class="form-input flex-grow addon-name-input" placeholder="ชื่อบริการ">
            <input type="number" class="form-input w-32 addon-price-input" placeholder="ราคา">
            <button type="button" class="btn btn-danger p-2 rounded-lg h-10 w-10 flex-shrink-0" onclick="this.parentElement.remove()"><i class="fas fa-trash-alt"></i></button>
        `;
        container.appendChild(newAddon);
    }
}

// CSV Upload Functionality
function setupCSVUpload() {
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
    }

    // Process upload
    if (processBtn) {
        processBtn.addEventListener('click', processCSVUpload);
    }

    function handleDragOver(e) {
        e.preventDefault();
        dropzone.classList.add('border-blue-400', 'bg-blue-400/10');
    }

    function handleDrop(e) {
        e.preventDefault();
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
            previewHTML += `<p class="text-slate-400 text-xs mt-2">แสดง ${csvData.length - 5} แถวแรกจากทั้งหมด ${csvData.length} แถว</p>`;
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

// Initialize CSV upload when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setupCSVUpload();
});

// --- All Invoices Management Functions ---

// Global variables for all invoices
let allInvoicesData = [];
let filteredInvoicesData = [];
let currentInvoicesPage = 1;
const INVOICES_PER_PAGE = 10;

async function openAllInvoicesModal() {
    openModal('all-invoices-modal');
    await loadAllInvoices();
}

async function loadAllInvoices() {
    console.log("Loading all invoices...");
    const tbody = document.getElementById('all-invoices-table-body');
    const loadingRow = `
        <tr>
            <td colspan="9" class="text-center py-10 text-slate-400">
                <i class="fas fa-spinner fa-spin text-2xl mb-3"></i><br>
                กำลังโหลดข้อมูลใบแจ้งหนี้...
            </td>
        </tr>
    `;

    if (tbody) tbody.innerHTML = loadingRow;

    try {
        const rawData = await loadFromFirebase(); 
        
        allInvoicesData = rawData
        .filter(bill => {
            if (!bill.date) {
                console.warn('Found bill/invoice without a date, it will be excluded from the "All Invoices" table:', bill);
                return false;
            }
            return true;
        })
        .map(bill => {
            // This logic is simplified from a previous version.
            // Ensure costs are calculated correctly.
            const electricityCost = bill.total || 0;
            const waterCost = bill.waterTotal || 0;
            const rentCost = bill.rent || 0;
            const totalCost = electricityCost + waterCost + rentCost;
            
            return {
                key: bill.key,
                room: bill.room,
                name: bill.name,
                date: bill.date,
                electricityCost: electricityCost,
                waterCost: waterCost,
                rentCost: rentCost,
                totalCost: totalCost,
                dueDate: bill.dueDate,
                paymentConfirmed: bill.paymentConfirmed || false,
                evidenceUrl: bill.evidenceUrl,
                timestamp: bill.timestamp
            };
        });

        // Sort by date (newest first)
        allInvoicesData.sort((a, b) => b.timestamp - a.timestamp);
        
        filteredInvoicesData = [...allInvoicesData];
        
        // Populate filter options
        populateInvoiceFilters();
        
        // Render table
        renderAllInvoicesTable();
        
    } catch (error) {
        console.error('Error loading all invoices:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูลใบแจ้งหนี้', 'error');
    }
}

function populateInvoiceFilters() {
    const roomSelect = document.getElementById('filter-invoice-room');
    const dateSelect = document.getElementById('filter-invoice-date');
    if (!roomSelect || !dateSelect) return;

    const uniqueRooms = [...new Set(allInvoicesData.map(inv => inv.room))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const uniqueDates = [...new Set(allInvoicesData.map(inv => inv.date ? inv.date.substring(3) : null))].filter(Boolean).sort((a, b) => {
        const [monthA, yearA] = a.split('/');
        const [monthB, yearB] = b.split('/');
        return new Date(yearB, monthB - 1) - new Date(yearA, monthA - 1);
    });

    roomSelect.innerHTML = '<option value="">ทุกห้อง</option>' + uniqueRooms.map(room => `<option value="${room}">${room}</option>`).join('');
    
    dateSelect.innerHTML = '<option value="">ทุกเดือน</option>' + uniqueDates.map(date => {
        const [month, year] = date.split('/');
        return `<option value="${date}">${getThaiMonth(month)} ${year}</option>`;
    }).join('');

    // Enable download by room button if a room is selected
    roomSelect.addEventListener('change', () => {
        const downloadBtn = document.getElementById('download-filtered-invoices-btn');
        if (downloadBtn) {
            downloadBtn.disabled = !roomSelect.value;
             downloadBtn.title = roomSelect.value ? `ดาวน์โหลดใบแจ้งหนี้ทั้งหมดของห้อง ${roomSelect.value}` : 'กรุณาเลือกห้องก่อน';
        }
    });
}

function renderAllInvoicesTable() {
    const tbody = document.getElementById('all-invoices-table-body');
    if (!tbody) return;

    const startIndex = (currentInvoicesPage - 1) * INVOICES_PER_PAGE;
    const endIndex = startIndex + INVOICES_PER_PAGE;
    const paginatedInvoices = filteredInvoicesData.slice(startIndex, endIndex);

    if (paginatedInvoices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-10 text-slate-400">
                    <i class="fas fa-search text-2xl mb-3"></i><br>
                    ไม่พบใบแจ้งหนี้ที่ตรงกับเงื่อนไข
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = paginatedInvoices.map(invoice => {
        const totalCost = (invoice.total || 0) + (invoice.waterTotal || 0) + (invoice.rent || 0);
        const addonTotal = invoice.addons?.reduce((sum, addon) => sum + (parseFloat(addon.price) || 0), 0) || 0;
        invoice.totalCost = totalCost + addonTotal;

        const canDelete = hasPermission('canDeleteBills', invoice.room);

        return `
            <tr class="hover:bg-slate-700/50">
                <td class="px-2 py-3 text-center">
                    <input type="checkbox" class="invoice-select-checkbox form-checkbox bg-slate-900 border-slate-600 text-green-500 focus:ring-green-500" data-invoice-id="${invoice.id}">
                </td>
                <td class="px-4 py-3 font-medium text-white">${invoice.room}</td>
                <td class="px-4 py-3 text-slate-300">${invoice.name}</td>
                <td class="px-4 py-3 text-slate-400">${invoice.date}</td>
                <td class="px-4 py-3 text-right">${(invoice.total || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} ฿</td>
                <td class="px-4 py-3 text-right">${(invoice.waterTotal || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} ฿</td>
                <td class="px-4 py-3 text-right">${(invoice.rent || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} ฿</td>
                <td class="px-4 py-3 text-right font-bold text-white">${invoice.totalCost.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="generateInvoice('${invoice.id}')" class="text-green-400 hover:text-green-300 transition-colors" title="ดูใบแจ้งหนี้">
                            <i class="fas fa-file-invoice-dollar"></i>
                        </button>
                        ${canDelete ? `<button onclick="handleDeleteBill('${invoice.id}')" class="text-red-400 hover:text-red-300 transition-colors" title="ลบใบแจ้งหนี้">
                            <i class="fas fa-trash-alt"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    addInvoiceSelectionListeners();
}

function addInvoiceSelectionListeners() {
    const selectAllCheckbox = document.getElementById('select-all-invoices-checkbox');
    const itemCheckboxes = document.querySelectorAll('.invoice-select-checkbox');

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            itemCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
            updateDownloadSelectedButtonState();
        });
    }

    itemCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            if (!checkbox.checked) {
                if(selectAllCheckbox) selectAllCheckbox.checked = false;
            }
            updateDownloadSelectedButtonState();
        });
    });
}

function updateDownloadSelectedButtonState() {
    const downloadBtn = document.getElementById('download-selected-invoices-btn');
    if (!downloadBtn) return;

    const selectedCheckboxes = document.querySelectorAll('.invoice-select-checkbox:checked');
    
    if (selectedCheckboxes.length > 0) {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = `<i class="fas fa-download"></i> ดาวน์โหลดที่เลือก (${selectedCheckboxes.length})`;
    } else {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `<i class="fas fa-download"></i> ดาวน์โหลดที่เลือก`;
    }
}

function updateInvoicesPagination(total, start, end) {
    document.getElementById('invoices-total').textContent = total;
    document.getElementById('invoices-start').textContent = start;
    document.getElementById('invoices-end').textContent = end;
}

function updateInvoicesPaginationButtons(totalPages) {
    const prevBtn = document.getElementById('invoices-prev-page');
    const nextBtn = document.getElementById('invoices-next-page');
    
    prevBtn.disabled = currentInvoicesPage <= 1;
    nextBtn.disabled = currentInvoicesPage >= totalPages;
}

function changeInvoicesPage(direction) {
    const newPage = currentInvoicesPage + direction;
    const totalPages = Math.ceil(filteredInvoicesData.length / INVOICES_PER_PAGE);
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentInvoicesPage = newPage;
        renderAllInvoicesTable();
    }
}

function filterAllInvoices() {
    invoicesCurrentPage = 1; // Reset to page 1 on any filter change

    const searchTerm = document.getElementById('search-invoices').value.toLowerCase();
    const roomFilter = document.getElementById('filter-invoice-room').value;
    const dateFilter = document.getElementById('filter-invoice-date').value;

    if (!window.allInvoicesData) {
        window.filteredInvoicesData = [];
        renderAllInvoicesTable();
        return;
    }

    window.filteredInvoicesData = window.allInvoicesData.filter(invoice => {
        const searchMatch = !searchTerm ||
            (invoice.room && String(invoice.room).toLowerCase().includes(searchTerm)) ||
            (invoice.name && String(invoice.name).toLowerCase().includes(searchTerm)) ||
            (invoice.date && String(invoice.date).toLowerCase().includes(searchTerm));

        const roomMatch = !roomFilter || invoice.room === roomFilter;

        const dateMatch = !dateFilter || (invoice.date && typeof invoice.date === 'string' && invoice.date.includes('/') && `${invoice.date.split('/')[1]}-${invoice.date.split('/')[2]}` === dateFilter);

        return searchMatch && roomMatch && dateMatch;
    });

    renderAllInvoicesTable();
}

function getThaiMonth(monthNum) {
    const thaiMonths = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    return thaiMonths[parseInt(monthNum) - 1] || '';
}

async function downloadFilteredInvoices() {
    const roomSelect = document.getElementById('filter-invoice-room');
    const selectedRoom = roomSelect.value;

    if (!selectedRoom) {
        showAlert('กรุณาเลือกห้องที่ต้องการดาวน์โหลด', 'warning');
        return;
    }
    
    const invoicesToDownload = window.filteredInvoicesData.filter(invoice => invoice.room === selectedRoom);

    if (invoicesToDownload.length === 0) {
        showAlert(`ไม่พบใบแจ้งหนี้สำหรับห้อง ${selectedRoom} (ตามตัวกรองปัจจุบัน)`, 'info');
        return;
    }

    const downloadBtn = document.getElementById('download-filtered-invoices-btn');
    const originalBtnHTML = downloadBtn.innerHTML;
    downloadBtn.disabled = true;

    try {
        const JSZip = window.JSZip;
        if (!JSZip) {
           showAlert('เกิดข้อผิดพลาด: ไม่พบไลบรารีสำหรับบีบอัดไฟล์ (JSZip)', 'error');
           return;
        }
        const zip = new JSZip();

        for (let i = 0; i < invoicesToDownload.length; i++) {
            const invoice = invoicesToDownload[i];
            downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> กำลังเตรียม... (${i + 1}/${invoicesToDownload.length})`;
            
            try {
                const canvas = await generateInvoiceCanvas(invoice);
                const room = invoice.room || 'unknown';
                const date = invoice.date ? invoice.date.replace(/\//g, '-') : 'nodate';
                const fileName = `invoice-${room}-${date}.png`;
                
                const imageData = canvas.toDataURL('image/png').split(';base64,')[1];
                zip.file(fileName, imageData, { base64: true });

            } catch (error) {
                console.error(`Failed to generate canvas for invoice id ${invoice.id}:`, error);
            }
        }

        downloadBtn.innerHTML = `<i class="fas fa-cog fa-spin"></i> กำลังบีบอัดไฟล์...`;
        const zipBlob = await zip.generateAsync({ type: "blob" });
        
        const link = document.createElement('a');
        link.download = `invoices-room-${selectedRoom}.zip`;
        link.href = URL.createObjectURL(zipBlob);
        link.click();
        URL.revokeObjectURL(link.href);

    } catch (error) {
        console.error('Error creating zip file for filtered invoices:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้างไฟล์ ZIP', 'error');
    } finally {
        downloadBtn.innerHTML = originalBtnHTML;
        downloadBtn.disabled = false;
    }
}

async function downloadSelectedInvoices() {
    const selectedCheckboxes = document.querySelectorAll('.invoice-select-checkbox:checked');
    const keysToDownload = Array.from(selectedCheckboxes).map(cb => cb.dataset.key);

    if (keysToDownload.length === 0) {
        showAlert('กรุณาเลือกใบแจ้งหนี้ที่ต้องการดาวน์โหลด', 'warning');
        return;
    }
    
    const invoicesToDownload = window.allInvoicesData.filter(inv => keysToDownload.includes(inv.id));

    const downloadBtn = document.getElementById('download-selected-invoices-btn');
    const originalBtnHTML = downloadBtn.innerHTML;
    downloadBtn.disabled = true;

    try {
        const JSZip = window.JSZip;
        if (!JSZip) {
           showAlert('เกิดข้อผิดพลาด: ไม่พบไลบรารีสำหรับบีบอัดไฟล์ (JSZip)', 'error');
           return;
        }
        const zip = new JSZip();

        for (let i = 0; i < invoicesToDownload.length; i++) {
            const invoice = invoicesToDownload[i];
             downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> กำลังเตรียม... (${i + 1}/${invoicesToDownload.length})`;
            
            try {
                const canvas = await generateInvoiceCanvas(invoice);
                const room = invoice.room || 'unknown';
                const date = invoice.date ? invoice.date.replace(/\//g, '-') : 'nodate';
                const fileName = `invoice-${room}-${date}.png`;
                
                const imageData = canvas.toDataURL('image/png').split(';base64,')[1];
                zip.file(fileName, imageData, { base64: true });

            } catch (error) {
                console.error(`Failed to generate canvas for invoice id ${invoice.id}:`, error);
            }
        }

        downloadBtn.innerHTML = `<i class="fas fa-cog fa-spin"></i> กำลังบีบอัดไฟล์...`;
        const zipBlob = await zip.generateAsync({ type: "blob" });

        const link = document.createElement('a');
        link.download = `selected-invoices.zip`;
        link.href = URL.createObjectURL(zipBlob);
        link.click();
        URL.revokeObjectURL(link.href);

    } catch (error) {
        console.error('Error creating zip file for selected invoices:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้างไฟล์ ZIP', 'error');
    } finally {
        downloadBtn.innerHTML = originalBtnHTML;
        downloadBtn.disabled = false;
        document.getElementById('select-all-invoices-checkbox').checked = false;
        selectedCheckboxes.forEach(cb => cb.checked = false);
        updateDownloadSelectedButtonState();
    }
}

function exportInvoicesToCSV() {
    const dataToExport = window.filteredInvoicesData || [];

    if (dataToExport.length === 0) {
        showAlert('ไม่พบข้อมูลสำหรับส่งออก (ตามตัวกรองปัจจุบัน)', 'warning');
        return;
    }

    const headers = ['ห้อง', 'ชื่อผู้เช่า', 'วันที่', 'ค่าไฟ (บาท)', 'ค่าน้ำ (บาท)', 'ค่าเช่า (บาท)', 'อื่นๆ (บาท)', 'ยอดรวม (บาท)', 'วันครบกำหนด', 'สถานะ'];
    
    const csvRows = [headers.join(',')];

    for (const invoice of dataToExport) {
        const othersTotal = (invoice.addons || []).reduce((sum, addon) => sum + (addon.price || 0), 0);
        const row = [
            invoice.room || '',
            invoice.name || '',
            invoice.date || '',
            invoice.total?.toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 2 }) || '0.00',
            invoice.waterTotalAll?.toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 2 }) || '0.00',
            invoice.rent?.toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 2 }) || '0.00',
            othersTotal.toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 2 }),
            invoice.grandTotal?.toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 2 }) || '0.00',
            invoice.dueDate || '',
            invoice.paymentConfirmed ? 'ชำระแล้ว' : 'ยังไม่ชำระ'
        ].map(value => `"${String(value).replace(/"/g, '""')}"`);
        csvRows.push(row.join(','));
    }

    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoices_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showAlert('ส่งออกข้อมูลเป็น CSV สำเร็จ', 'success');
}