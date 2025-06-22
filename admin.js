// Admin panel functionality
let users = [];
let filteredUsers = [];
let stats = {
    totalUsers: 0,
    totalRooms: 0,
    totalBills: 0,
    totalAdmins: 0
};

// Check admin permission
async function checkAdminPermission() {
    const user = await checkAuth();
    if (!user) {
        window.location.href = 'login.html';
        return false;
    }
    
    // Set global variables
    window.currentUser = user;
    window.userRole = user.role;
    window.currentUserRole = user.role;
    
    if (!hasPermission('canManageUsers')) {
        window.location.href = 'home.html';
        return false;
    }
    return true;
}

// Load statistics
async function loadStats() {
    try {
        // Load users count
        const usersSnapshot = await db.ref('users').once('value');
        const usersData = usersSnapshot.val() || {};
        stats.totalUsers = Object.keys(usersData).length;
        stats.totalAdmins = Object.values(usersData).filter(user => user.role === 'admin').length;
        
        // Load rooms count
        const roomsSnapshot = await db.ref('rooms').once('value');
        const roomsData = roomsSnapshot.val() || {};
        stats.totalRooms = Object.keys(roomsData).length;
        
        // Load bills count
        const billsSnapshot = await db.ref('bills').once('value');
        const billsData = billsSnapshot.val() || {};
        stats.totalBills = Object.keys(billsData).length;
        
        // Update UI
        document.getElementById('total-users').textContent = stats.totalUsers;
        document.getElementById('total-rooms').textContent = stats.totalRooms;
        document.getElementById('total-bills').textContent = stats.totalBills;
        document.getElementById('total-admins').textContent = stats.totalAdmins;
        
    } catch (error) {
        console.error('Error loading stats:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดสถิติ', 'error');
    }
}

// Load users
async function loadUsers() {
    try {
        const snapshot = await db.ref('users').once('value');
        const usersData = snapshot.val() || {};
        
        users = Object.entries(usersData).map(([uid, userData]) => ({
            uid,
            ...userData,
            status: userData.status || 'active' // Default to active if not set
        }));
        
        filteredUsers = [...users];
        renderUsersTable();
        updateUsersStats();
        
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้', 'error');
    }
}

// Update users statistics
function updateUsersStats() {
    const activeUsers = users.filter(user => user.status === 'active').length;
    const adminUsers = users.filter(user => user.role === 'admin').length;
    
    document.getElementById('total-users').textContent = users.length;
    document.getElementById('total-admins').textContent = adminUsers;
}

// Filter users
function filterUsers() {
    const searchTerm = document.getElementById('search-users').value.toLowerCase();
    const roleFilter = document.getElementById('filter-role').value;
    
    filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm) || 
                            user.email.toLowerCase().includes(searchTerm);
        const matchesRole = !roleFilter || user.role === roleFilter;
        
        return matchesSearch && matchesRole;
    });
    
    renderUsersTable();
}

// Render users table
function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    const emptyState = document.getElementById('users-empty-state');
    
    if (filteredUsers.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    tbody.innerHTML = '';
    
    filteredUsers.forEach(user => {
        const row = document.createElement('tr');
        row.className = 'border-b border-white/10 hover:bg-white/5 transition-colors';
        
        const roleIcon = getRoleIcon(user.role);
        const roleColor = getRoleColor(user.role);
        const statusColor = getStatusColor(user.status);
        const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString('th-TH') : 'ไม่ระบุ';
        
        row.innerHTML = `
            <td class="py-3 px-4">
                <div class="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center relative">
                    ${user.photoURL ? 
                        `<img src="${user.photoURL}" alt="Profile" class="w-10 h-10 rounded-full object-cover">` :
                        `<i class="fas fa-user text-white/70"></i>`
                    }
                    <div class="absolute -bottom-1 -right-1 w-4 h-4 ${statusColor} rounded-full border-2 border-slate-800"></div>
                </div>
            </td>
            <td class="py-3 px-4 text-white">${user.name || 'ไม่ระบุ'}</td>
            <td class="py-3 px-4 text-white/80">${user.email}</td>
            <td class="py-3 px-4">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${roleColor}">
                    ${roleIcon} ${getRoleText(user.role)}
                </span>
            </td>
            <td class="py-3 px-4 text-white/70">${createdAt}</td>
            <td class="py-3 px-4">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(user.status)}">
                    ${getStatusText(user.status)}
                </span>
            </td>
            <td class="py-3 px-4">
                <div class="flex space-x-2">
                    <button onclick="editUser('${user.uid}')" 
                            class="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors" 
                            title="แก้ไขผู้ใช้">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="toggleUserStatus('${user.uid}')" 
                            class="px-3 py-1 ${user.status === 'active' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded text-sm transition-colors" 
                            title="${user.status === 'active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}">
                        <i class="fas fa-${user.status === 'active' ? 'ban' : 'check'}"></i>
                    </button>
                    <button onclick="deleteUser('${user.uid}')" 
                            class="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition-colors" 
                            title="ลบผู้ใช้">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Get role icon
function getRoleIcon(role) {
    switch (role) {
        case 'admin': return '<i class="fas fa-crown"></i>';
        case 'user': return '<i class="fas fa-user"></i>';
        case '1': return '<i class="fas fa-user-tie"></i>'; // Owner
        case 'level1_tenant': return '<i class="fas fa-house-user"></i>'; // Tenant
        case '2': return '<i class="fas fa-user-cog"></i>'; // Level 2 - perhaps a different icon
        default: return '<i class="fas fa-user"></i>';
    }
}

// Get role color
function getRoleColor(role) {
    switch (role) {
        case 'admin': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        case 'user': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
        case '1': return 'bg-green-500/20 text-green-400 border border-green-500/30'; // Owner
        case 'level1_tenant': return 'bg-teal-500/20 text-teal-400 border border-teal-500/30'; // Tenant
        case '2': return 'bg-purple-500/20 text-purple-400 border border-purple-500/30'; // Level 2
        default: return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    }
}

// Get role text
function getRoleText(role) {
    switch (role) {
        case 'admin': return 'ผู้ดูแลระบบ';
        case 'user': return 'ผู้ใช้งานทั่วไป';
        case '1': return 'ระดับ 1 (เจ้าของห้อง)';
        case 'level1_tenant': return 'ระดับ 1 (ลูกบ้าน)';
        case '2': return 'ระดับ 2';
        default: return 'ไม่ระบุ';
    }
}

// Get status color (for status indicator dot)
function getStatusColor(status) {
    switch (status) {
        case 'active': return 'bg-green-500';
        case 'inactive': return 'bg-red-500';
        case 'pending': return 'bg-yellow-500';
        default: return 'bg-gray-500';
    }
}

// Get status badge color
function getStatusBadgeColor(status) {
    switch (status) {
        case 'active': return 'bg-green-500/20 text-green-400 border border-green-500/30';
        case 'inactive': return 'bg-red-500/20 text-red-400 border border-red-500/30';
        case 'pending': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        default: return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    }
}

// Get status text
function getStatusText(status) {
    switch (status) {
        case 'active': return 'ใช้งานได้';
        case 'inactive': return 'ระงับการใช้งาน';
        case 'pending': return 'รอการยืนยัน';
        default: return 'ไม่ระบุ';
    }
}

// Add new user
async function addUser(name, email, password, role, status = 'active') {
    try {
        // Create user in Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        let userData = {
            name: name,
            email: email,
            role: role,
            status: status,
            createdAt: new Date().toISOString(),
            profileImage: null
        };

        // Initialize fields for level1 or level1_tenant if necessary
        if (role === '1') { // Level 1 Owner
            userData.managedRooms = [];
        } else if (role === 'level1_tenant') { // Level 1 Tenant
            userData.accessibleRooms = [];
            userData.ownerUid = null; // This should be set by the Level 1 owner later
        }

        // Save user data to database
        await db.ref(`users/${user.uid}`).set(userData);
        
        showAlert('เพิ่มผู้ใช้สำเร็จ!', 'success');
        loadUsers();
        loadStats();
        
    } catch (error) {
        console.error('Error adding user:', error);
        let errorMessage = 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'อีเมลนี้ถูกใช้งานแล้ว';
                break;
            case 'auth/invalid-email':
                errorMessage = 'รูปแบบอีเมลไม่ถูกต้อง';
                break;
            case 'auth/weak-password':
                errorMessage = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
                break;
        }
        
        showAlert(errorMessage, 'error');
    }
}

// Toggle user status
async function toggleUserStatus(uid) {
    const user = users.find(u => u.uid === uid);
    if (!user) return;
    
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? 'เปิดใช้งาน' : 'ระงับการใช้งาน';
    
    if (!confirm(`คุณแน่ใจหรือไม่ที่จะ${action}ผู้ใช้นี้?`)) return;
    
    try {
        await db.ref(`users/${uid}`).update({
            status: newStatus,
            updatedAt: new Date().toISOString()
        });
        
        showAlert(`${action}ผู้ใช้สำเร็จ!`, 'success');
        loadUsers();
        
    } catch (error) {
        console.error('Error toggling user status:', error);
        showAlert(`เกิดข้อผิดพลาดในการ${action}ผู้ใช้`, 'error');
    }
}

// Edit user
async function editUser(uid) {
    const user = users.find(u => u.uid === uid);
    if (!user) return;
    
    // Fill edit form
    document.getElementById('edit-user-id').value = uid;
    document.getElementById('edit-user-name').value = user.name || '';
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-role').value = user.role;
    document.getElementById('edit-user-status').value = user.status || 'active';
    
    // Show modal
    document.getElementById('edit-user-modal').classList.remove('hidden');
}

// Update user
async function updateUser(uid, name, email, role, status) {
    try {
        await db.ref(`users/${uid}`).update({
            name: name,
            email: email,
            role: role,
            status: status,
            updatedAt: new Date().toISOString()
        });
        
        showAlert('อัปเดตผู้ใช้สำเร็จ!', 'success');
        loadUsers();
        loadStats();
        
    } catch (error) {
        console.error('Error updating user:', error);
        showAlert('เกิดข้อผิดพลาดในการอัปเดตผู้ใช้', 'error');
    }
}

// Delete user
async function deleteUser(uid) {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบผู้ใช้นี้?')) return;
    
    try {
        // Delete from database
        await db.ref(`users/${uid}`).remove();
        
        // Delete from Firebase Auth (requires admin SDK, so we'll just remove from database)
        showAlert('ลบผู้ใช้สำเร็จ!', 'success');
        loadUsers();
        loadStats();
        
    } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('เกิดข้อผิดพลาดในการลบผู้ใช้', 'error');
    }
}

// Switch tabs
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('[id$="-tab"]').forEach(tab => {
        tab.classList.remove('bg-secondary', 'text-white');
        tab.classList.add('text-white/70', 'hover:text-white');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('bg-secondary', 'text-white');
    document.getElementById(`${tabName}-tab`).classList.remove('text-white/70', 'hover:text-white');
    
    // Update content
    document.querySelectorAll('[id$="-content"]').forEach(content => {
        content.classList.add('hidden');
    });
    
    document.getElementById(`${tabName}-content`).classList.remove('hidden');
    
    // Load specific content
    if (tabName === 'reports') {
        loadReports();
    }
}

// Load reports
async function loadReports() {
    // This would load charts and reports
    // For now, just show placeholder
    console.log('Loading reports...');
}

// Show modal
function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

// Hide modal
function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Go back function
function goBack() {
    // Check if there's previous history
    if (window.history.length > 1) {
        window.history.back();
    } else {
        // If no history, go to home page
        window.location.href = 'home.html';
    }
}

// Make goBack function global
window.goBack = goBack;

// Export functions for global use
window.editUser = editUser;
window.deleteUser = deleteUser;
window.toggleUserStatus = toggleUserStatus;

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Permission check
    const hasPermission = await checkAdminPermission();
    if (!hasPermission) return;
    
    // Set current user
    if (window.currentUser) {
        document.getElementById('current-user').textContent = `ยินดีต้อนรับ, ${window.currentUser.email}`;
    }
    
    // Setup UI components like tabs
    setupTabs();
    
    // Initial data load
    await loadStats();
    await loadUsers();
    
    // Tab switching
    const usersTab = document.getElementById('users-tab');
    usersTab.addEventListener('click', () => switchTab('users'));
    document.getElementById('roles-tab').addEventListener('click', () => switchTab('roles'));
    document.getElementById('reports-tab').addEventListener('click', () => switchTab('reports'));
    
    // Search and filter functionality
    document.getElementById('search-users').addEventListener('input', filterUsers);
    document.getElementById('filter-role').addEventListener('change', filterUsers);
    
    // Add user modal
    document.getElementById('add-user-btn').addEventListener('click', () => showModal('add-user-modal'));
    document.getElementById('close-add-user-modal').addEventListener('click', () => hideModal('add-user-modal'));
    
    // Add user form
    document.getElementById('add-user-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('new-user-name').value;
        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;
        const status = document.getElementById('new-user-status').value;
        
        await addUser(name, email, password, role, status);
        hideModal('add-user-modal');
        this.reset();
    });
    
    // Edit user modal
    document.getElementById('close-edit-user-modal').addEventListener('click', () => hideModal('edit-user-modal'));
    
    // Edit user form
    document.getElementById('edit-user-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const uid = document.getElementById('edit-user-id').value;
        const name = document.getElementById('edit-user-name').value;
        const email = document.getElementById('edit-user-email').value;
        const role = document.getElementById('edit-user-role').value;
        const status = document.getElementById('edit-user-status').value;
        
        await updateUser(uid, name, email, role, status);
        hideModal('edit-user-modal');
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('[id$="-modal"]').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideModal(this.id);
            }
        });
    });
});

// Export functions for global use
window.editUser = editUser;
window.deleteUser = deleteUser;
window.toggleUserStatus = toggleUserStatus;

function setupTabs() {
    // Show users tab by default
    switchTab('users');
}

// --- Report Generator ---
async function initializeReportGenerator() {
    try {
        // Initialize flatpickr date picker
        flatpickr("#report-date", {
            dateFormat: "d/m/Y",
            altInput: true,
            altFormat: "j F Y",
            locale: "th"
        });

        // Populate room dropdown
        const roomSelect = document.getElementById('report-room');
        const snapshot = await db.ref('electricityData').once('value');
        const data = snapshot.val();
        if (!data) {
            roomSelect.innerHTML = '<option value="">ไม่พบข้อมูลห้อง</option>';
            return;
        }

        const rooms = [...new Set(Object.values(data).map(bill => bill.room))].sort();
        roomSelect.innerHTML = '<option value="">-- เลือกห้อง --</option>';
        rooms.forEach(room => {
            const option = document.createElement('option');
            option.value = room;
            option.textContent = room;
            roomSelect.appendChild(option);
        });

        // Add form submit listener
        const reportForm = document.getElementById('report-form');
        reportForm.addEventListener('submit', handleReportGeneration);

    } catch (error) {
        console.error("Error initializing report generator:", error);
        document.getElementById('report-error').textContent = 'ไม่สามารถโหลดข้อมูลห้องได้';
    }
}

async function handleReportGeneration(event) {
    event.preventDefault();
    const room = document.getElementById('report-room').value;
    const date = document.getElementById('report-date').value;
    const errorEl = document.getElementById('report-error');
    errorEl.textContent = '';

    if (!room || !date) {
        errorEl.textContent = 'กรุณาเลือกห้องและวันที่';
        return;
    }

    try {
        const snapshot = await db.ref('electricityData')
            .orderByChild('room')
            .equalTo(room)
            .once('value');
            
        const data = snapshot.val();
        if (!data) {
            errorEl.textContent = 'ไม่พบบิลสำหรับห้องที่เลือก';
            return;
        }

        // Find the specific bill for that date
        const bill = Object.values(data).find(b => b.date === date);

        if (bill) {
            // Found the bill, now generate the receipt using the global function
            if (typeof generateInvoice === 'function') {
                generateInvoice(bill.key);
            } else {
                console.error('generateInvoice function is not available.');
                errorEl.textContent = 'เกิดข้อผิดพลาด: ฟังก์ชันสร้างใบแจ้งหนี้ไม่พร้อมใช้งาน';
            }
        } else {
            errorEl.textContent = 'ไม่พบบิลสำหรับวันที่ที่เลือก';
        }
    } catch (error) {
        console.error("Error fetching report data:", error);
        errorEl.textContent = 'เกิดข้อผิดพลาดในการค้นหาข้อมูล';
    }
}