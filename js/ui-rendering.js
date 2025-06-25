/*
    UI Rendering functions for the Electricity Bill Calculator
*/

import { loadFromFirebase, getAllRoomsData } from './firebase-data.js';
import { ITEMS_PER_PAGE, currentPage, setAllHistoryData } from './constants.js';
import { sortRooms, getDueDateInfo, formatCurrency, hasPermission } from './utilities.js';

/**
 * Update room status summary
 * @param {number} total - Total rooms
 * @param {number} occupied - Occupied rooms
 * @param {number} vacant - Vacant rooms
 */
export function updateRoomStatusSummary(total, occupied, vacant) {
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

/**
 * Render home page room cards
 */
export async function renderHomeRoomCards() {
    const cardsContainer = document.getElementById('home-room-cards');
    if (!cardsContainer) {
        return;
    }

    cardsContainer.innerHTML = '<p class="text-center text-gray-400 col-span-full py-8">กำลังโหลดข้อมูลห้องพัก (เริ่มต้น)...</p>';

    try {
        const allRoomsSettings = await getAllRoomsData();
        const allBills = await loadFromFirebase();

        const allRoomIdsFromBills = allBills.map(b => b.room);
        const allRoomIdsFromRooms = Object.keys(allRoomsSettings);
        const allRoomIds = [...new Set([...allRoomIdsFromBills, ...allRoomIdsFromRooms])].filter(Boolean);

        const userRole = window.currentUserRole;
        const userData = window.currentUserData;
        
        let displayableRoomIds = allRoomIds; 
        if (userRole === 'admin') {
            if (userData && userData.buildingCode) {
                // Filter rooms by building code if admin has one
                displayableRoomIds = allRoomIds.filter(roomId => {
                    const roomSettings = allRoomsSettings[roomId];
                    const roomBills = allBills.filter(b => b.room === roomId);
                    return (roomSettings && roomSettings.buildingCode === userData.buildingCode) ||
                           (roomBills.length > 0 && roomBills.some(b => b.buildingCode === userData.buildingCode));
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
       
        await buildCardContainer(cardsContainer, sortedRooms);

    } catch (error) {
        console.error('An error occurred during renderHomeRoomCards:', error); 
        cardsContainer.innerHTML = `<p class="text-center text-red-400 col-span-full py-8">เกิดข้อผิดพลาด: ${error.message}</p>`;
        updateRoomStatusSummary(0, 0, 0);
    }
}

/**
 * Build card container with room cards
 * @param {HTMLElement} cardsContainer - Container element
 * @param {Array} sortedRooms - Sorted rooms array
 */
export async function buildCardContainer(cardsContainer, sortedRooms) {
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

    for (const room of sortedRooms) {
        try {
            const { id, bill, status, tenantName, roomSize } = room;
            const billExists = bill && bill.id;
            const currentTenantName = tenantName || (billExists ? bill.name : 'ไม่มีผู้เช่า');
            const roomStatus = status || (billExists ? 'occupied' : 'vacant');

            // Get addon data from rooms database
            let mergedAddons = Array.isArray(bill?.addons) ? [...bill.addons] : [];
            try {
                const roomAddonsSnap = await window.db.ref(`rooms/${id}/addons`).once('value');
                const roomAddons = roomAddonsSnap.val();
                if (Array.isArray(roomAddons)) {
                    mergedAddons = [...mergedAddons, ...roomAddons];
                }
            } catch (e) { /* ignore */ }

            const electricity = billExists ? (bill.total !== undefined ? bill.total : 0) : 0;
            const water = billExists ? (bill.waterTotal !== undefined ? bill.waterTotal : 0) : 0;
            const rent = billExists ? (bill.rent !== undefined ? bill.rent : 0) : 0;
            const addonTotal = mergedAddons.reduce((sum, addon) => sum + (parseFloat(addon.price) || 0), 0);
            const totalAmount = electricity + water + rent + addonTotal;

            // Create HTML for displaying each amount detail
            let detailRows = '';
            if (electricity > 0) detailRows += `<div class='flex justify-between text-xs'><span>ค่าไฟ</span><span>฿${formatCurrency(electricity)}</span></div>`;
            if (water > 0) detailRows += `<div class='flex justify-between text-xs'><span>ค่าน้ำ</span><span>฿${formatCurrency(water)}</span></div>`;
            if (rent > 0) detailRows += `<div class='flex justify-between text-xs'><span>ค่าเช่า</span><span>฿${formatCurrency(rent)}</span></div>`;
            if (addonTotal > 0) detailRows += `<div class='flex justify-between text-xs'><span>บริการเสริม</span><span>฿${formatCurrency(addonTotal)}</span></div>`;

            const dueDateInfo = billExists ? getDueDateInfo(bill.dueDate) : { text: 'ไม่มีข้อมูล', color: 'text-slate-500' };
            const lastBillDate = billExists ? (bill.date || 'ไม่มีข้อมูล') : 'ไม่มีข้อมูล';

            const card = document.createElement('div');
            card.className = `room-card bg-slate-800 rounded-xl shadow-lg border border-slate-700/80 p-4 flex flex-col transition-all duration-300 hover:border-blue-500/70 hover:shadow-blue-500/10 relative`;
            card.dataset.roomId = id;

            // Room status switch
            const statusSwitchId = `room-status-switch-${id}`;
            const isOccupied = roomStatus === 'occupied' || roomStatus === 'มีผู้เช่า';
            
            const statusSwitchHTML = `
                <div class="flex items-center mb-2">
                    <h3 class="text-3xl font-bold text-white tracking-wider">${id}</h3>
                </div>
            `;

            let statusBadgeHTML = '<div class="absolute top-3 right-3 z-10 items-center space-x-2">';
            if (roomStatus === 'occupied' || roomStatus === 'มีผู้เช่า') {
                statusBadgeHTML += `<div class="text-xs font-bold px-2 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-400/30">มีคนอยู่</div>`;
            } else {
                statusBadgeHTML += `<div class="text-xs font-bold px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-400/30">ว่าง</div>`;
            }
            
            statusBadgeHTML += `
                <div class="lamp-switch-container">
                    <div class="lamp-switch-group">
                        <span class="lamp-label"></span>
                        <label class="lamp-switch">
                            <input type="checkbox" id="${statusSwitchId}" class="room-status-switch" ${isOccupied ? 'checked' : ''} />
                            <span class="lamp-slider"></span>
                        </label>
                        <span class="lamp-label"></span>
                    </div>
                </div>
            </div>`;

            const totalAmountColor = totalAmount > 0 ? 'text-red-400' : 'text-slate-300';

            card.innerHTML = `
                ${statusBadgeHTML}
                ${statusSwitchHTML}
                <div class="flex-grow flex flex-col">
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
                           ฿${formatCurrency(totalAmount)}
                        </p>
                        <div class='mt-2 space-y-1'>${detailRows}</div>
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

            // Add event listener for room status switch
            setTimeout(() => {
                const switchEl = document.getElementById(statusSwitchId);
                if (switchEl) {
                    switchEl.addEventListener('change', async function() {
                        const { handleRoomStatusSwitch } = await import('./room-management.js');
                        await handleRoomStatusSwitch(room, this.checked);
                    });
                }
            }, 0);
            
        } catch (error) {
            console.error(`CRITICAL: Failed to build card for room ID: ${room.id}.`, error);
            const errorCard = document.createElement('div');
            errorCard.className = 'bg-red-900/50 border border-red-700 rounded-lg p-4 text-center';
            errorCard.innerHTML = `<p class="font-semibold text-red-300">เกิดข้อผิดพลาดในการแสดงผลห้อง ${room.id}</p><p class="text-xs text-red-400">${error.message}</p>`;
            cardsContainer.appendChild(errorCard);
        }
    }
}

/**
 * Render history table for a specific room
 * @param {string} room - Room ID
 */
export async function renderHistoryTable(room) {
    const historyBody = document.getElementById('history-body');
    const noHistory = document.getElementById('no-history');
    const historySection = document.getElementById('history-section');
    
    if (!historyBody || !noHistory || !historySection) return;

    // Permission check for viewing history of this specific room
    if (!hasPermission('canViewHistory', room)) {
        historyBody.innerHTML = '';
        noHistory.innerHTML = `<p class="text-center text-red-400">คุณไม่มีสิทธิ์ดูประวัติของห้อง ${room}</p>`;
        noHistory.classList.remove('hidden');
        historySection.style.display = 'none';
        
        // Also hide the form for adding new bills if it exists on this page
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
            console.log('Rendering bill:', bill);
            
            const actionsHtml = `
                <div class="flex items-center justify-center gap-4">
                    ${hasPermission('canGenerateInvoice', room) ? `
                        <button onclick="generateInvoice('${bill.id}')" class="text-green-400 hover:text-green-300 transition-colors" title="ใบแจ้งหนี้">
                            <i class="fas fa-file-invoice-dollar fa-lg"></i>
                        </button>
                    ` : ''}

                    ${!bill.evidenceUrl && hasPermission('canUploadEvidence', room) ? `
                        <button onclick="openEvidenceModal('${bill.id}')" class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold shadow-md transition-all" title="แนบหลักฐาน">
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
                        <button onclick="confirmPayment('${bill.id}')" class="text-emerald-400 hover:text-emerald-300 transition-colors" title="ยืนยันการชำระเงิน">
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

/**
 * Update pagination controls
 * @param {number} totalItems - Total number of items
 * @param {number} totalPages - Total number of pages
 */
export function updatePagination(totalItems, totalPages) {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer || totalPages <= 1) {
        if(paginationContainer) paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    // Add pagination implementation here based on your UI requirements
}
