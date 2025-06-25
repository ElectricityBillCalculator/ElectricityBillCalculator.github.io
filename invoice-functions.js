// Invoice generation functions for the Electricity Bill Calculator

// Function to generate invoice HTML content
async function generateInvoiceHTML(billData) {
    if (!billData) {
        throw new Error('ไม่พบข้อมูลบิล');
    }

    // --- ดึง addon จาก rooms database ถ้า billData.addons ไม่มีหรือว่าง ---
    let mergedAddons = Array.isArray(billData.addons) ? [...billData.addons] : [];
    if ((!mergedAddons || mergedAddons.length === 0) && billData.room && typeof db !== 'undefined') {
        try {
            const roomAddonsSnap = await db.ref(`rooms/${billData.room}/addons`).once('value');
            const roomAddons = roomAddonsSnap.val();
            if (Array.isArray(roomAddons)) {
                mergedAddons = [...roomAddons];
            } else if (roomAddons && typeof roomAddons === 'object') {
                mergedAddons = Object.values(roomAddons);
            }
        } catch (e) {
            // ignore error, fallback to empty
        }
    }

    // Calculate totals
    const electricityCost = billData.total || 0;
    const waterCost = billData.waterTotal || 0;
    const rentCost = billData.rent || 0;
    const addonTotal = mergedAddons.reduce((sum, addon) => sum + (parseFloat(addon.price) || 0), 0);
    const grandTotal = electricityCost + waterCost + rentCost + addonTotal;

    // Format date
    const currentDate = new Date().toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Get room name (with fallback)
    let roomName = 'ไม่ระบุ';
    try {
        if (typeof getRoomName === 'function') {
            roomName = await getRoomName(billData.room);
        } else {
            roomName = `ห้อง ${billData.room}`;
        }
    } catch (error) {
        console.warn('Could not get room name:', error);
        roomName = `ห้อง ${billData.room}`;
    }

    // --- สร้าง HTML แสดงรายละเอียดแต่ละยอด ---
    let addonRows = '';
    if (addonTotal > 0 && mergedAddons.length > 0) {
        mergedAddons.forEach(addon => {
            addonRows += `<tr><td class='px-4 py-3 text-sm'>${addon.name || 'บริการเสริม'}</td><td class='px-4 py-3 text-sm text-right'>${(parseFloat(addon.price) || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>`;
        });
    }

    return `
        <div class="max-w-lg mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 class="text-2xl font-bold text-green-600 mb-2 flex items-center"><i class="fas fa-file-invoice-dollar mr-2"></i>ใบแจ้งค่าใช้จ่าย</h2>
            <div class="mb-4 text-sm text-gray-600">วันที่ออกใบแจ้งหนี้: ${currentDate}</div>
            <div class="mb-6">
                <div class="flex justify-between text-base font-semibold mb-1">
                    <span>ห้อง: <span class="font-bold">${roomName}</span></span>
                    <span>รอบบิล: <span class="font-bold">${billData.date || '-'}</span></span>
                </div>
                <div class="flex justify-between text-base mb-1">
                    <span>ชื่อผู้เช่า:</span>
                    <span>${billData.name || '-'}</span>
                </div>
                <div class="flex justify-between text-base mb-1">
                    <span>วันครบกำหนด:</span>
                    <span>${billData.dueDate || '-'}</span>
                </div>
            </div>

            <!-- ยอดรวมใหญ่ -->
            <div class="mb-8 text-center">
                <div class="text-lg text-gray-700">ยอดรวมทั้งสิ้น</div>
                <div class="text-4xl font-bold text-green-600 my-2">฿${grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
            </div>

            <!-- Cost Breakdown -->
            <div class="mb-8">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">รายละเอียดค่าใช้จ่าย</h3>
                <div class="border border-gray-300 rounded-lg overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-800">รายการ</th>
                                <th class="px-4 py-3 text-right text-sm font-semibold text-gray-800">จำนวนเงิน (บาท)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            <tr>
                                <td class="px-4 py-3 text-sm">ค่าไฟฟ้า</td>
                                <td class="px-4 py-3 text-sm text-right">${electricityCost.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                            <tr>
                                <td class="px-4 py-3 text-sm">ค่าน้ำ</td>
                                <td class="px-4 py-3 text-sm text-right">${waterCost.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                            <tr>
                                <td class="px-4 py-3 text-sm">ค่าเช่า</td>
                                <td class="px-4 py-3 text-sm text-right">${rentCost.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                            ${addonRows}
                        </tbody>
                        <tfoot class="bg-gray-50">
                            <tr>
                                <td class="px-4 py-3 text-sm font-semibold">รวมทั้งสิ้น</td>
                                <td class="px-4 py-3 text-sm font-semibold text-right">${grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- Payment Instructions -->
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
                <h4 class="font-semibold text-yellow-800 mb-2">วิธีการชำระเงิน</h4>
                <div class="text-sm text-yellow-700 space-y-1">
                    <p>• กรุณาชำระเงินภายในวันที่ ${billData.dueDate || 'ไม่ระบุ'}</p>
                    <p>• ชำระผ่าน QR Code หรือโอนเงินเข้าบัญชี</p>
                    <p>• เก็บหลักฐานการชำระเงินไว้เป็นหลักฐาน</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="text-center text-sm text-gray-500 border-t border-gray-300 pt-4">
                <p>ใบแจ้งหนี้นี้สร้างโดยระบบอัตโนมัติ</p>
                <p>หากมีข้อสงสัย กรุณาติดต่อผู้ดูแล</p>
            </div>
        </div>
    `;
}

// Function to generate invoice canvas for download
async function generateInvoiceCanvas(billData) {
    return new Promise((resolve, reject) => {
        try {
            // Create a temporary container
            const tempContainer = document.createElement('div');
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.style.top = '-9999px';
            tempContainer.style.width = '800px';
            tempContainer.style.backgroundColor = 'white';
            document.body.appendChild(tempContainer);

            // Generate HTML content
            generateInvoiceHTML(billData).then(html => {
                tempContainer.innerHTML = html;
                
                // Use html2canvas to convert to canvas
                if (typeof html2canvas !== 'undefined') {
                    html2canvas(tempContainer, {
                        scale: 2,
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: '#ffffff',
                        width: 800,
                        height: tempContainer.scrollHeight
                    }).then(canvas => {
                        document.body.removeChild(tempContainer);
                        resolve(canvas);
                    }).catch(error => {
                        document.body.removeChild(tempContainer);
                        reject(error);
                    });
                } else {
                    // Fallback: create a simple canvas with text
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 800;
                    canvas.height = 600;
                    
                    // Set background
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // Add text
                    ctx.fillStyle = 'black';
                    ctx.font = '24px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('ใบแจ้งค่าใช้จ่าย', canvas.width / 2, 50);
                    
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(`ห้อง: ${billData.room}`, 50, 100);
                    ctx.fillText(`ชื่อ: ${billData.name || 'ไม่ระบุ'}`, 50, 130);
                    ctx.fillText(`เดือน: ${billData.date || 'ไม่ระบุ'}`, 50, 160);
                    
                    const total = (billData.total || 0) + (billData.waterTotal || 0) + (billData.rent || 0);
                    ctx.fillText(`รวม: ${total.toLocaleString('en-US', {minimumFractionDigits: 2})} บาท`, 50, 190);
                    
                    document.body.removeChild(tempContainer);
                    resolve(canvas);
                }
            }).catch(error => {
                document.body.removeChild(tempContainer);
                reject(error);
            });
        } catch (error) {
            reject(error);
        }
    });
} 