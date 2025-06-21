// This file will contain all direct Firebase Realtime Database and Storage interactions.
console.log("firebaseService.js loaded");

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
        // showAlert is not defined here, it will be in uiHandlers.js
        // Consider returning error or throwing it to be handled by caller
        throw error;
    }
}

async function updateFirebaseData(path, data) {
    try {
        await db.ref(path).update(data);
    } catch (error) {
        console.error('Error updating Firebase data:', error);
        throw error;
    }
}

async function removeFirebaseData(path) {
    try {
        await db.ref(path).remove();
    } catch (error) {
        console.error('Error removing Firebase data:', error);
        throw error;
    }
}

async function getFirebaseData(path) {
    try {
        const snapshot = await db.ref(path).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Error getting Firebase data:', error);
        throw error;
    }
}


async function migrateOldDataToFirebase() { // Renamed to avoid conflict if migrateOldData is an orchestrator
    if (!hasPermission('canManageUsers')) { // Admin-only permission
        // This function should be called by an orchestrator that handles showAlert
        // showAlert('คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้', 'error');
        console.error('Permission denied for migrating old data.');
        return false; // Indicate failure or lack of permission
    }

    // Confirmation should be handled by the caller in appLogic.js
    // if (!confirm('คุณต้องการอัปเดตข้อมูลเก่าทั้งหมดที่ไม่มีการระบุห้องหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
    //     return false;
    // }

    // showAlert('กำลังเริ่มกระบวนการอัปเดตข้อมูลเก่า...', 'info'); // Handled by caller

    try {
        const snapshot = await db.ref('electricityData').once('value');
        const data = snapshot.val();
        if (!data) {
            // showAlert('ไม่พบข้อมูลในฐานข้อมูล', 'warning');
            console.warn('No data found in Firebase for migration.');
            return { migrated: false, message: 'ไม่พบข้อมูลในฐานข้อมูล' };
        }

        const updates = {};
        let migrationCount = 0;

        for (const key in data) {
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
            // showAlert(`อัปเดตข้อมูลเก่าจำนวน ${migrationCount} รายการสำเร็จ!`, 'success');
            return { migrated: true, count: migrationCount, message: `อัปเดตข้อมูลเก่าจำนวน ${migrationCount} รายการสำเร็จ!` };
        } else {
            // showAlert('ไม่พบข้อมูลเก่าที่ต้องอัปเดต', 'info');
            return { migrated: false, message: 'ไม่พบข้อมูลเก่าที่ต้องอัปเดต' };
        }
    } catch (error) {
        console.error("Error migrating old data in Firebase service:", error);
        // showAlert(`เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ${error.message}`, 'error');
        throw error; // Re-throw to be handled by caller
    }
}

async function uploadFileToStorage(path, file, metadata) {
    try {
        if (!firebase.storage) {
            console.error('Firebase Storage not available');
            throw new Error('Firebase Storage ไม่พร้อมใช้งาน');
        }
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(path);
        const uploadTask = fileRef.put(file, metadata);
        return uploadTask; // Return the task to allow progress monitoring by the caller
    } catch (error) {
        console.error('Error uploading file to Firebase Storage:', error);
        throw error;
    }
}

async function getDownloadURLFromStorage(uploadTaskSnapshot) {
    try {
        return await uploadTaskSnapshot.ref.getDownloadURL();
    } catch (error) {
        console.error('Error getting download URL from Firebase Storage:', error);
        throw error;
    }
}

async function deleteFileFromStorage(fileUrl) {
    try {
        if (!firebase.storage) {
            console.warn('Firebase Storage not available for deletion.');
            return; // Or throw an error if this is critical
        }
        const storageRef = firebase.storage().refFromURL(fileUrl);
        await storageRef.delete();
        console.log('File deleted from storage:', fileUrl);
    } catch (error) {
        console.error('Error deleting file from Firebase Storage:', error);
        // Not throwing here, as sometimes DB update is more critical,
        // but the caller might want to know.
        // Consider returning a status or specific error type.
        throw error; // For now, rethrow.
    }
}
