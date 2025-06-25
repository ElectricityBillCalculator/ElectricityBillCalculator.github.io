/*
    Bill Management functions for the Electricity Bill Calculator
*/

import { saveToFirebase, loadFromFirebase } from './firebase-data.js';
import { setCurrentPage, setEditingIndex, editingIndex } from './constants.js';
import { updatePreviousReadingFromDB } from './utilities.js';
import { renderHistoryTable } from './ui-rendering.js';

/**
 * Calculate and save a new bill
 */
export async function calculateBill() {
    const room = new URLSearchParams(window.location.search).get('room');
    
    // Permission Check
    if (!hasPermission('canAddNewBills', room)) {
        showAlert('คุณไม่มีสิทธิ์เพิ่มข้อมูลใหม่สำหรับห้องนี้', 'error');
        return;
    }

    // Getting values from the form
    const billDate = document.getElementById('bill-date').value;
    const dueDate = document.getElementById('due-date').value;
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
    const waterFieldsEntered = !isNaN(currentWaterReading) || !isNaN(previousWaterReading) || 
                              !isNaN(totalWaterUnitsHousehold) || !isNaN(totalWaterBillHousehold) || !isNaN(waterRate);
    
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
    } else if (waterFieldsEntered && !isNaN(currentWaterReading) && isNaN(previousWaterReading) && !isNaN(waterRate)) {
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
        setCurrentPage(1); // Reset to first page to see the new entry
        renderHistoryTable(room);
        updatePreviousReadingFromDB(room);
    }
}

/**
 * Open edit modal for a bill
 * @param {string} key - Bill key to edit
 */
export async function openEditModal(key) {
    try {
        const snapshot = await db.ref(`electricityData/${key}`).once('value');
        const data = snapshot.val();
        if (!data) {
            showAlert('ไม่พบข้อมูลที่ต้องการแก้ไข', 'error');
            return;
        }
        
        // Permission Check for the specific room
        if (!hasPermission('canEditAllBills', data.room)) {
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
        setEditingIndex(key);

        // Show modal
        const { openModal } = await import('./modal-controls.js');
        openModal('edit-modal');

        // Calculate and display totals
        calculateEditTotals();

    } catch (error) {
        console.error('Error opening edit modal:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    }
}

/**
 * Save edited bill data
 */
export async function saveEdit() {
    if (editingIndex === -1) {
        showAlert('ไม่พบข้อมูลที่ต้องการแก้ไข (No editing index)', 'error');
        return;
    }

    try {
        // Get original room to check permission before saving
        const originalSnapshot = await db.ref(`electricityData/${editingIndex}`).once('value');
        const originalData = originalSnapshot.val();
        if (!originalData) {
            showAlert('ไม่พบข้อมูลเดิมที่ต้องการแก้ไข', 'error');
            setEditingIndex(-1); // Reset
            const { closeModal } = await import('./modal-controls.js');
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
            showAlert('กรุณากรอกวันที่และวันครบกำหนดให้ครบถ้วน', 'error');
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
        const { closeModal } = await import('./modal-controls.js');
        closeModal('edit-modal');

        // Refresh the table
        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        if (roomParam) {
            renderHistoryTable(roomParam);
        } else {
            const { renderHomeRoomCards } = await import('./ui-rendering.js');
            renderHomeRoomCards();
        }

        // Reset editing index
        setEditingIndex(-1);

    } catch (error) {
        console.error('Error saving edit:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
}

/**
 * Calculate totals in edit modal
 */
export function calculateEditTotals() {
    // Get current values
    const current = parseFloat(document.getElementById('edit-current').value) || 0;
    const previous = parseFloat(document.getElementById('edit-previous').value) || 0;
    const rate = parseFloat(document.getElementById('edit-rate').value) || 0;
    
    const currentWater = parseFloat(document.getElementById('edit-current-water').value) || 0;
    const previousWater = parseFloat(document.getElementById('edit-previous-water').value) || 0;
    const waterRate = parseFloat(document.getElementById('edit-water-rate').value) || 0;

    // Calculate units and totals
    const units = current - previous;
    const total = units * rate;
    const waterUnits = currentWater - previousWater;
    const waterTotal = waterUnits * waterRate;

    // Update display elements if they exist
    const unitsDisplay = document.getElementById('edit-units-display');
    const totalDisplay = document.getElementById('edit-total-display');
    const waterUnitsDisplay = document.getElementById('edit-water-units-display');
    const waterTotalDisplay = document.getElementById('edit-water-total-display');

    if (unitsDisplay) unitsDisplay.textContent = units.toFixed(0);
    if (totalDisplay) totalDisplay.textContent = total.toFixed(2);
    if (waterUnitsDisplay) waterUnitsDisplay.textContent = waterUnits.toFixed(0);
    if (waterTotalDisplay) waterTotalDisplay.textContent = waterTotal.toFixed(2);
}
