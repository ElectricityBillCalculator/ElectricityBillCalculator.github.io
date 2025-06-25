// Invoice generation functions for the Electricity Bill Calculator

// Function to generate invoice HTML content
async function generateInvoiceHTML(billData) {
    if (!billData) {
        throw new Error('ไม่พบข้อมูลบิล');
    }

    // Calculate totals
    const electricityCost = billData.total || 0;
    const waterCost = billData.waterTotal || 0;
    const rentCost = billData.rent || 0;
    const addonTotal = billData.addons?.reduce((sum, addon) => sum + (parseFloat(addon.price) || 0), 0) || 0;
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

    // --- สร้าง HTML สำหรับ Addon ---
    let addonRows = '';
    if (billData.addons && billData.addons.length > 0) {
        addonRows = billData.addons.map(addon => `
            <tr>
                <td class="px-4 py-3 text-sm">${addon.name || 'อื่นๆ'}</td>
                <td class="px-4 py-3 text-sm text-right">${(parseFloat(addon.price) || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
        `).join('');
    }

    return `
        <div class="invoice-container bg-white text-black p-8 max-w-2xl mx-auto" id="invoice-content">
            <!-- Header -->
            <div class="text-center mb-8 border-b-2 border-gray-300 pb-4">
                <h1 class="text-3xl font-bold text-gray-800 mb-2">ใบแจ้งค่าใช้จ่าย</h1>
                <p class="text-gray-600">หอพัก</p>
                <p class="text-sm text-gray-500 mt-2">วันที่ออกใบแจ้ง: ${currentDate}</p>
            </div>

            <!-- Customer Info -->
            <div class="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">ข้อมูลผู้เช่า</h3>
                    <div class="space-y-2 text-sm">
                        <div><strong>เลขห้อง:</strong> ${billData.room}</div>
                        <div><strong>ชื่อ:</strong> ${billData.name || 'ไม่ระบุ'}</div>
                        <div><strong>ชื่อห้อง:</strong> ${roomName}</div>
                    </div>
                </div>
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">ข้อมูลการชำระ</h3>
                    <div class="space-y-2 text-sm">
                        <div><strong>เดือน:</strong> ${billData.date || 'ไม่ระบุ'}</div>
                        <div><strong>วันครบกำหนด:</strong> ${billData.dueDate || 'ไม่ระบุ'}</div>
                        <div><strong>สถานะ:</strong> 
                            <span class="${billData.paymentConfirmed ? 'text-green-600' : 'text-red-600'} font-semibold">
                                ${billData.paymentConfirmed ? 'ชำระแล้ว' : 'ยังไม่ชำระ'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Usage Details -->
            <div class="mb-8">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">รายละเอียดการใช้</h3>
                
                <!-- Electricity -->
                ${billData.currentReading && billData.previousReading ? `
                <div class="bg-gray-50 p-4 rounded-lg mb-4">
                    <h4 class="font-semibold text-gray-800 mb-3">ค่าไฟฟ้า</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><strong>มิเตอร์ปัจจุบัน:</strong> ${billData.currentReading} หน่วย</div>
                        <div><strong>มิเตอร์ก่อนหน้า:</strong> ${billData.previousReading} หน่วย</div>
                        <div><strong>จำนวนที่ใช้:</strong> ${billData.currentReading - billData.previousReading} หน่วย</div>
                        <div><strong>อัตราค่าไฟ:</strong> ${billData.rate || 0} บาท/หน่วย</div>
                    </div>
                </div>
                ` : ''}

                <!-- Water -->
                ${billData.waterCurrentReading && billData.waterPreviousReading ? `
                <div class="bg-gray-50 p-4 rounded-lg mb-4">
                    <h4 class="font-semibold text-gray-800 mb-3">ค่าน้ำ</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><strong>มิเตอร์ปัจจุบัน:</strong> ${billData.waterCurrentReading} หน่วย</div>
                        <div><strong>มิเตอร์ก่อนหน้า:</strong> ${billData.waterPreviousReading} หน่วย</div>
                        <div><strong>จำนวนที่ใช้:</strong> ${billData.waterCurrentReading - billData.waterPreviousReading} หน่วย</div>
                        <div><strong>อัตราค่าน้ำ:</strong> ${billData.waterRate || 0} บาท/หน่วย</div>
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Cost Breakdown -->
            <div class="mb-8">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">รายการค่าใช้จ่าย</h3>
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