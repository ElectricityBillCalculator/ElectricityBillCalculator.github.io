/*
    Firebase data operations for the Electricity Bill Calculator
*/

import { setAllHistoryData } from './constants.js';

/**
 * Load data from Firebase
 * @param {string|null} room - Optional room filter
 * @returns {Array} Array of bill data
 */
export async function loadFromFirebase(room = null) {
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

/**
 * Save data to Firebase
 * @param {Object} data - Bill data to save
 * @returns {string|null} The key of the saved data or null if failed
 */
export async function saveToFirebase(data) {
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

/**
 * Delete a bill from Firebase
 * @param {string} key - The key of the bill to delete
 */
export async function deleteBill(key) {
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
                const { setCurrentPage } = await import('./constants.js');
                setCurrentPage(1);
                
                // Refresh the UI
                const { renderHistoryTable } = await import('./ui-rendering.js');
                const { updatePreviousReadingFromDB } = await import('./utilities.js');
                
                renderHistoryTable(room);
                updatePreviousReadingFromDB(room);
            }
        });
    } catch (error) {
        console.error('Error deleting bill:', error);
        showAlert('เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
    }
}

/**
 * Get room data from Firebase
 * @param {string} roomId - Room ID to fetch
 * @returns {Object|null} Room data or null if not found
 */
export async function getRoomData(roomId) {
    try {
        const snapshot = await db.ref(`rooms/${roomId}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Error getting room data:', error);
        return null;
    }
}

/**
 * Update room data in Firebase
 * @param {string} roomId - Room ID to update
 * @param {Object} data - Data to update
 */
export async function updateRoomData(roomId, data) {
    try {
        await db.ref(`rooms/${roomId}`).update(data);
    } catch (error) {
        console.error('Error updating room data:', error);
        throw error;
    }
}

/**
 * Get all rooms data from Firebase
 * @returns {Object} All rooms data
 */
export async function getAllRoomsData() {
    try {
        const snapshot = await db.ref('rooms').once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Error getting all rooms data:', error);
        return {};
    }
}
