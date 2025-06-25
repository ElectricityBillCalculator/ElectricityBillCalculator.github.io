/*
    Room Management functions for the Electricity Bill Calculator
*/

import { updateRoomData, getRoomData } from './firebase-data.js';
import { renderHomeRoomCards } from './ui-rendering.js';

/**
 * Handle room status switch toggle
 * @param {Object} room - Room object
 * @param {boolean} isOccupied - New occupied status
 */
export async function handleRoomStatusSwitch(room, isOccupied) {
    const newStatus = isOccupied ? 'occupied' : 'vacant';
    try {
        await updateRoomData(room.id, { status: newStatus });
        showAlert(`อัปเดตสถานะห้อง ${room.id} เป็น "${isOccupied ? 'มีผู้เช่า' : 'ว่าง'}" สำเร็จ`, 'success');
        
        if (typeof renderHomeRoomCards === 'function') {
            await renderHomeRoomCards();
        }
    } catch (error) {
        showAlert(`เกิดข้อผิดพลาดในการอัปเดตสถานะห้อง: ${error.message}`, 'error');
    }
}

/**
 * Prompt for tenant name update
 * @param {string} roomId - Room ID
 * @param {string} currentName - Current tenant name
 */
export async function promptForTenantName(roomId, currentName) {
    const newName = prompt(`แก้ไขชื่อผู้เช่าสำหรับห้อง ${roomId}:`, currentName);
    if (newName && newName.trim() !== '' && newName !== currentName) {
        try {
            await updateRoomData(roomId, { tenantName: newName.trim() });
            showAlert('อัปเดตชื่อผู้เช่าสำเร็จ', 'success');
            renderHomeRoomCards();
        } catch (error) {
            // If the room doesn't exist in the 'rooms' collection yet, create it.
            if (error.message.includes("permission_denied")) {
                try {
                    await db.ref(`rooms/${roomId}`).set({ 
                        tenantName: newName.trim(),
                        createdAt: new Date().toISOString() 
                    });
                    showAlert('อัปเดตชื่อผู้เช่าสำเร็จ', 'success');
                    renderHomeRoomCards();
                } catch (e) {
                    console.error('Error creating room with tenant name:', e);
                    showAlert('เกิดข้อผิดพลาดในการบันทึกชื่อ', 'error');
                }
            } else {
                console.error('Error updating tenant name:', error);
                showAlert('เกิดข้อผิดพลาดในการบันทึกชื่อ', 'error');
            }
        }
    }
}

/**
 * Handle adding a new room
 * @param {Event} event - Form submit event
 */
export async function handleAddRoom(event) {
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

        // Update user's managed rooms
        if (userData && userData.managedRooms) {
            userData.managedRooms.push(roomNumber);
        }
        
        await roomRef.set(newRoomData);
        
        await db.ref(`users/${auth.currentUser.uid}`).update({
            managedRooms: userData.managedRooms
        });

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

        await db.ref(`users/${auth.currentUser.uid}`).update({
            managedRooms: userData.managedRooms
        });
        
        showAlert(`สร้างห้อง ${roomNumber} สำเร็จ`, 'success');
        
        // Close modal and reset form
        const { closeModal } = await import('./modal-controls.js');
        closeModal('add-room-modal');
        document.getElementById('add-room-form').reset();
        renderHomeRoomCards();

    } catch (error) {
        console.error('Error adding new room:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้างห้องใหม่', 'error');
    }
}

/**
 * Migrate old data that doesn't have room information
 */
export async function migrateOldData() {
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
            showAlert('ไม่พบข้อมูลในฐานข้อมูล', 'info');
            return;
        }

        const updates = {};
        let migrationCount = 0;

        for (const key in data) {
            const entry = data[key];
            if (!entry.room || entry.room.trim() === '') {
                const defaultRoom = prompt(`พบข้อมูลโดยไม่มีการระบุห้อง (วันที่: ${entry.date || 'ไม่ระบุ'}, ชื่อ: ${entry.name || 'ไม่ระบุ'})\nกรุณาระบุเลขห้อง:`, '101');
                
                if (defaultRoom && defaultRoom.trim() !== '') {
                    updates[`electricityData/${key}/room`] = defaultRoom.trim();
                    migrationCount++;
                } else {
                    console.log(`Skipping migration for entry ${key} - no room specified`);
                }
            }
        }

        if (migrationCount > 0) {
            await db.ref().update(updates);
            showAlert(`อัปเดตข้อมูลเก่าเรียบร้อยแล้ว จำนวน ${migrationCount} รายการ`, 'success');
        } else {
            showAlert('ไม่พบข้อมูลที่ต้องการอัปเดต', 'info');
        }

        // Refresh the view
        renderHomeRoomCards();

    } catch (error) {
        console.error("Error migrating old data:", error);
        showAlert(`เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ${error.message}`, 'error');
    }
}
