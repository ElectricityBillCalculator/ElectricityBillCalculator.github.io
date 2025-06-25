/*
    Invoice and QR Code Management for the Electricity Bill Calculator
*/

/**
 * Generate QR Code for a bill record
 * @param {Object} record - Bill record data
 */
export function generateQRCode(record) {
    console.log('Generating QR code for record:', record);
    
    // Check if PromptPay is available
    if (typeof generatePromptPayQR !== 'function') {
        console.error('PromptPay function not available');
        showAlert('ไม่สามารถสร้าง QR Code ได้: ไม่พบไลบรารี PromptPay', 'error');
        return;
    }

    try {
        // Create bill summary
        const totalAmount = (record.total || 0) + (record.waterTotal || 0) + (record.rent || 0);
        const billSummary = `ค่าไฟ-น้ำ ห้อง ${record.room} ${record.date || ''}`;
        
        // Generate QR code using PromptPay
        const qrCodeDataURL = generatePromptPayQR(totalAmount, billSummary);
        
        // Display in modal
        const qrModal = document.getElementById('qr-code-modal');
        const qrImage = document.getElementById('qr-code-image');
        const qrText = document.getElementById('qr-code-text');
        const qrAmount = document.getElementById('qr-code-amount');
        
        if (qrModal && qrImage && qrText && qrAmount) {
            qrImage.src = qrCodeDataURL;
            qrText.textContent = billSummary;
            qrAmount.textContent = `฿${Number(totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            
            qrModal.classList.remove('hidden');
            qrModal.classList.add('flex');
        }
        
    } catch (error) {
        console.error('Error generating QR code:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้าง QR Code', 'error');
    }
}

/**
 * Download QR Code as image
 */
export function downloadQRCode() {
    const qrImage = document.getElementById('qr-code-image');
    if (!qrImage || !qrImage.src) {
        showAlert('ไม่พบ QR Code ที่จะดาวน์โหลด', 'error');
        return;
    }
    
    const link = document.createElement('a');
    link.download = `promptpay-qr-${Date.now()}.png`;
    link.href = qrImage.src;
    link.click();
}

/**
 * Generate invoice for a specific bill
 * @param {string} billId - Bill ID
 */
export async function generateInvoice(billId) {
    try {
        const snapshot = await db.ref(`electricityData/${billId}`).once('value');
        const billData = snapshot.val();
        
        if (!billData) {
            showAlert('ไม่พบข้อมูลบิล', 'error');
            return;
        }
        
        // Check permissions
        if (!hasPermission('canGenerateInvoice', billData.room)) {
            showAlert('คุณไม่มีสิทธิ์สร้างใบแจ้งหนี้สำหรับห้องนี้', 'error');
            return;
        }
        
        // Generate invoice (implementation depends on invoice library/template)
        console.log('Generating invoice for bill:', billData);
        
        // This would typically call an invoice generation library
        // or redirect to an invoice page with the bill data
        const invoiceUrl = `invoice.html?billId=${billId}`;
        window.open(invoiceUrl, '_blank');
        
    } catch (error) {
        console.error('Error generating invoice:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้างใบแจ้งหนี้', 'error');
    }
}

/**
 * Generate invoice for a room (latest bill)
 * @param {string} roomId - Room ID
 */
export async function generateInvoiceForRoom(roomId) {
    try {
        const { loadFromFirebase } = await import('./firebase-data.js');
        const bills = await loadFromFirebase(roomId);
        
        if (!bills || bills.length === 0) {
            showAlert('ไม่พบข้อมูลบิลสำหรับห้องนี้', 'error');
            return;
        }
        
        // Get the latest bill
        const latestBill = bills[0];
        await generateInvoice(latestBill.id);
        
    } catch (error) {
        console.error('Error generating room invoice:', error);
        showAlert('เกิดข้อผิดพลาดในการสร้างใบแจ้งหนี้', 'error');
    }
}

/**
 * Open all invoices modal
 */
export function openAllInvoicesModal() {
    if (!hasPermission('canViewAllInvoices')) {
        showAlert('คุณไม่มีสิทธิ์ดูใบแจ้งหนี้ทั้งหมด', 'error');
        return;
    }
    
    const modal = document.getElementById('all-invoices-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        loadAllInvoices();
    }
}

/**
 * Load all invoices into the modal
 */
async function loadAllInvoices() {
    try {
        const { loadFromFirebase } = await import('./firebase-data.js');
        const allBills = await loadFromFirebase();
        
        const invoicesContainer = document.getElementById('all-invoices-container');
        if (!invoicesContainer) return;
        
        // Filter bills based on user permissions
        const userRole = window.currentUserRole;
        const userData = window.currentUserData;
        
        let filteredBills = allBills;
        if (userRole === '1' && userData && userData.managedRooms) {
            filteredBills = allBills.filter(bill => userData.managedRooms.includes(bill.room));
        } else if (userRole === 'level1_tenant' && userData && userData.accessibleRooms) {
            filteredBills = allBills.filter(bill => userData.accessibleRooms.includes(bill.room));
        }
        
        // Render invoices
        renderInvoicesList(filteredBills);
        
    } catch (error) {
        console.error('Error loading all invoices:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดใบแจ้งหนี้', 'error');
    }
}

/**
 * Render invoices list
 * @param {Array} bills - Array of bill data
 */
function renderInvoicesList(bills) {
    const container = document.getElementById('all-invoices-container');
    if (!container) return;
    
    if (!bills || bills.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-8">ไม่พบใบแจ้งหนี้</p>';
        return;
    }
    
    container.innerHTML = bills.map(bill => {
        const totalAmount = (bill.total || 0) + (bill.waterTotal || 0) + (bill.rent || 0);
        const isOverdue = bill.dueDate && new Date(bill.dueDate.split('/').reverse().join('-')) < new Date();
        
        return `
            <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-semibold text-white">ห้อง ${bill.room}</h3>
                    <span class="text-sm ${isOverdue ? 'text-red-400' : 'text-gray-400'}">${bill.date || ''}</span>
                </div>
                <div class="text-sm text-gray-400 mb-2">
                    <p>ผู้เช่า: ${bill.name || 'ไม่ระบุ'}</p>
                    <p>ยอดรวม: ฿${Number(totalAmount).toLocaleString()}</p>
                    <p>กำหนดชำระ: ${bill.dueDate || 'ไม่ระบุ'}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="generateInvoice('${bill.id}')" class="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded">
                        ใบแจ้งหนี้
                    </button>
                    <button onclick="generateQRCode(${JSON.stringify(bill).replace(/"/g, '&quot;')})" class="text-xs bg-green-600 hover:bg-green-700 px-3 py-1 rounded">
                        QR Code
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Filter all invoices based on search criteria
 */
export function filterAllInvoices() {
    const searchTerm = document.getElementById('search-invoices')?.value?.toLowerCase() || '';
    const roomFilter = document.getElementById('filter-invoice-room')?.value || '';
    const dateFilter = document.getElementById('filter-invoice-date')?.value || '';
    
    // Implementation for filtering invoices
    console.log('Filtering invoices:', { searchTerm, roomFilter, dateFilter });
    // This would re-render the filtered list
}

/**
 * Change invoices page
 * @param {number} direction - Page change direction (-1 or 1)
 */
export function changeInvoicesPage(direction) {
    // Implementation for pagination
    console.log('Changing invoices page:', direction);
}

/**
 * Export invoices to CSV
 */
export function exportInvoicesToCSV() {
    // Implementation for CSV export
    console.log('Exporting invoices to CSV');
    showAlert('ฟีเจอร์ส่งออก CSV กำลังพัฒนา', 'info');
}

/**
 * Download filtered invoices
 */
export function downloadFilteredInvoices() {
    // Implementation for downloading filtered invoices
    console.log('Downloading filtered invoices');
    showAlert('ฟีเจอร์ดาวน์โหลดกำลังพัฒนา', 'info');
}

/**
 * Download selected invoices
 */
export function downloadSelectedInvoices() {
    // Implementation for downloading selected invoices
    console.log('Downloading selected invoices');
    showAlert('ฟีเจอร์ดาวน์โหลดกำลังพัฒนา', 'info');
}
