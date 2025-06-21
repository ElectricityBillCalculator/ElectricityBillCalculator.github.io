// tenantManagement.js

// Function to initialize UI elements and event listeners for Level 1 Owner
function initializeLevel1OwnerInterface() {
    const userRole = window.currentUserRole;
    const tabsContainer = document.getElementById('level1-owner-tabs-container');
    const myRoomsContent = document.getElementById('my-rooms-content');
    const manageTenantsContent = document.getElementById('manage-tenants-content');

    if (userRole === '1' && tabsContainer) {
        tabsContainer.classList.remove('hidden');
        // By default, "My Rooms" tab is active, and "Manage Tenants" is hidden.
        // If manageTenantsContent exists, ensure it's hidden initially unless specified otherwise.
        if (manageTenantsContent) {
            manageTenantsContent.classList.add('hidden');
        }
        if (myRoomsContent) {
            myRoomsContent.classList.remove('hidden'); // Ensure my rooms is shown by default
        }

        // Setup tab switching
        document.getElementById('tab-my-rooms').addEventListener('click', () => switchL1OwnerTab('my-rooms'));
        document.getElementById('tab-manage-tenants').addEventListener('click', () => switchL1OwnerTab('manage-tenants'));

        // Setup "Add Tenant" button
        const addTenantBtn = document.getElementById('btn-add-tenant');
        if (addTenantBtn) {
            addTenantBtn.addEventListener('click', () => openAddEditTenantModal());
        }
        const addFirstTenantBtn = document.getElementById('btn-add-first-tenant');
        if (addFirstTenantBtn) {
            addFirstTenantBtn.addEventListener('click', () => openAddEditTenantModal());
        }

        // Setup modal close button
        const closeTenantModalBtn = document.getElementById('close-tenant-modal');
        if (closeTenantModalBtn) {
            closeTenantModalBtn.addEventListener('click', closeAddEditTenantModal);
        }

        // Setup form submission
        const tenantForm = document.getElementById('add-edit-tenant-form');
        if (tenantForm) {
            tenantForm.addEventListener('submit', handleAddEditTenantFormSubmit);
        }

        // Load managed rooms into modal checkboxes when "Manage Tenants" tab is potentially active or modal is opened
        // This can be deferred until the modal is opened to save initial load.
        loadManagedRoomsForTenantModal();
        loadTenantsForLevel1Owner(); // Load tenants if this tab is active or by default

    } else if (tabsContainer) {
        tabsContainer.classList.add('hidden');
        if (myRoomsContent) myRoomsContent.classList.remove('hidden'); // Non-L1 users see default room content
        if (manageTenantsContent) manageTenantsContent.classList.add('hidden');
    }
}

function switchL1OwnerTab(tabIdToActivate) {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.L1tab-content');

    tabButtons.forEach(button => {
        button.classList.remove('text-blue-500', 'border-blue-500');
        button.classList.add('text-slate-400', 'border-transparent', 'hover:text-slate-300', 'hover:border-slate-500');
        button.removeAttribute('aria-current');
    });

    tabContents.forEach(content => {
        content.classList.add('hidden');
    });

    const activeButton = document.getElementById(`tab-${tabIdToActivate}`);
    if (activeButton) {
        activeButton.classList.add('text-blue-500', 'border-blue-500');
        activeButton.classList.remove('text-slate-400', 'border-transparent', 'hover:text-slate-300', 'hover:border-slate-500');
        activeButton.setAttribute('aria-current', 'page');
    }

    const activeContent = document.getElementById(`${tabIdToActivate}-content`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
    }

    if (tabIdToActivate === 'manage-tenants') {
        loadTenantsForLevel1Owner(); // Reload or refresh tenant list when tab is activated
    }
}

function openAddEditTenantModal(tenantData = null) {
    console.log("Opening Add/Edit Tenant Modal", tenantData);
    const modal = document.getElementById('add-edit-tenant-modal');
    const form = document.getElementById('add-edit-tenant-form');
    const modalTitle = document.getElementById('tenant-modal-title');
    const saveButtonText = document.getElementById('save-tenant-button-text');
    const passwordGroup = document.getElementById('tenant-password-group');
    const passwordInput = document.getElementById('tenant-password');
    const passwordHelpText = document.getElementById('password-help-text');
    const editTenantIdInput = document.getElementById('edit-tenant-id');
    
    // Add null checks for all elements
    if (!modal || !form || !modalTitle || !saveButtonText || !passwordInput || !editTenantIdInput) {
        console.error('Required modal elements not found');
        return;
    }
    
    editTenantIdInput.value = '';
    form.reset(); // Reset form for new entries or before populating for edit
    loadManagedRoomsForTenantModal(); // Ensure rooms are loaded/reloaded

    if (tenantData && tenantData.uid) { // Editing existing tenant
        modalTitle.textContent = 'แก้ไขข้อมูลลูกบ้าน';
        saveButtonText.textContent = 'บันทึกการเปลี่ยนแปลง';
        editTenantIdInput.value = tenantData.uid;
        
        const tenantNameInput = document.getElementById('tenant-name');
        const tenantEmailInput = document.getElementById('tenant-email');
        const tenantStatusSelect = document.getElementById('tenant-status');
        
        if (tenantNameInput) tenantNameInput.value = tenantData.name || '';
        if (tenantEmailInput) {
            tenantEmailInput.value = tenantData.email || '';
            tenantEmailInput.disabled = true; // Usually email is not changed or requires special handling
        }

        passwordInput.required = false;
        passwordInput.placeholder = "ปล่อยว่างไว้หากไม่ต้องการเปลี่ยน";
        if(passwordHelpText) passwordHelpText.textContent = "(ปล่อยว่างไว้หากไม่ต้องการเปลี่ยน)";

        // Check accessible rooms
        if (tenantData.accessibleRooms && Array.isArray(tenantData.accessibleRooms)) {
            tenantData.accessibleRooms.forEach(roomKey => {
                const checkbox = document.querySelector(`#tenant-accessible-rooms-checkboxes input[value="${roomKey}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });
        }
        if (tenantStatusSelect) tenantStatusSelect.value = tenantData.status || 'active';

    } else { // Adding new tenant
        modalTitle.textContent = 'เพิ่มลูกบ้านใหม่';
        saveButtonText.textContent = 'เพิ่มลูกบ้าน';
        
        const tenantEmailInput = document.getElementById('tenant-email');
        if (tenantEmailInput) tenantEmailInput.disabled = false;
        
        passwordInput.required = true;
        passwordInput.placeholder = "ตั้งรหัสผ่านเริ่มต้น";
        if(passwordHelpText) passwordHelpText.textContent = "(อย่างน้อย 6 ตัวอักษร)";
    }

    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function closeAddEditTenantModal() {
    const modal = document.getElementById('add-edit-tenant-modal');
    const form = document.getElementById('add-edit-tenant-form');
    const editTenantIdInput = document.getElementById('edit-tenant-id');
    
    if (modal) modal.classList.add('hidden');
    if (form) form.reset();
    if (editTenantIdInput) editTenantIdInput.value = '';
}

async function loadManagedRoomsForTenantModal() {
    const checkboxesContainer = document.getElementById('tenant-accessible-rooms-checkboxes');
    const noRoomsMessage = document.getElementById('no-managed-rooms-message');
    if (!checkboxesContainer || !window.currentUserData) {
        if (noRoomsMessage) noRoomsMessage.classList.remove('hidden');
        return;
    }

    const managedRooms = window.currentUserData.managedRooms || [];

    if (managedRooms.length === 0) {
        checkboxesContainer.innerHTML = '<p class="text-slate-400 text-sm">คุณยังไม่ได้กำหนดห้องที่ดูแลในระบบ</p>';
        if (noRoomsMessage) noRoomsMessage.classList.remove('hidden');
        return;
    }

    if (noRoomsMessage) noRoomsMessage.classList.add('hidden');
    checkboxesContainer.innerHTML = ''; // Clear previous checkboxes

    // Fetch all existing rooms to display their names/details if needed
    // For now, just use the room keys from managedRooms
    managedRooms.forEach(roomKey => {
        const checkboxId = `room-${roomKey.replace(/\s+/g, '-')}`; // Sanitize roomKey for ID
        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        label.className = 'flex items-center space-x-2 p-2 rounded-md hover:bg-slate-700 cursor-pointer transition-colors';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = roomKey;
        checkbox.name = 'accessibleRooms';
        checkbox.className = 'form-checkbox h-5 w-5 text-teal-500 bg-slate-800 border-slate-600 rounded focus:ring-teal-400';

        const span = document.createElement('span');
        span.textContent = `ห้อง ${roomKey}`; // Display room key, ideally fetch room name/details
        span.className = 'text-slate-300';

        label.appendChild(checkbox);
        label.appendChild(span);
        checkboxesContainer.appendChild(label);
    });
}

async function handleAddEditTenantFormSubmit(event) {
    event.preventDefault();
    const saveButton = document.getElementById('save-tenant-button');
    const saveButtonText = document.getElementById('save-tenant-button-text');
    
    if (!saveButton || !saveButtonText) {
        console.error('Save button elements not found');
        return;
    }
    
    saveButton.disabled = true;
    const originalButtonText = saveButtonText.textContent;
    saveButtonText.textContent = 'กำลังบันทึก...';

    const tenantIdInput = document.getElementById('edit-tenant-id');
    const nameInput = document.getElementById('tenant-name');
    const emailInput = document.getElementById('tenant-email');
    const passwordInput = document.getElementById('tenant-password');
    const statusSelect = document.getElementById('tenant-status');
    
    if (!tenantIdInput || !nameInput || !emailInput || !passwordInput || !statusSelect) {
        console.error('Required form elements not found');
        saveButton.disabled = false;
        saveButtonText.textContent = originalButtonText;
        return;
    }

    const tenantId = tenantIdInput.value;
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value; // Don't trim password
    const status = statusSelect.value;

    const selectedRoomCheckboxes = document.querySelectorAll('#tenant-accessible-rooms-checkboxes input[type="checkbox"]:checked');
    const accessibleRooms = Array.from(selectedRoomCheckboxes).map(cb => cb.value);

    if (!name || !email) {
        showAlert('กรุณากรอกชื่อและอีเมลของลูกบ้าน', 'error');
        saveButton.disabled = false;
        saveButtonText.textContent = originalButtonText;
        return;
    }
    if (accessibleRooms.length === 0) {
        showAlert('กรุณาเลือกห้องที่อนุญาตให้ลูกบ้านเข้าถึงอย่างน้อย 1 ห้อง', 'error');
        saveButton.disabled = false;
        document.getElementById('save-tenant-button-text').textContent = originalButtonText;
        return;
    }

    try {
        if (tenantId) { // Editing existing tenant
            const updates = {
                name: name,
                accessibleRooms: accessibleRooms,
                status: status,
                updatedAt: new Date().toISOString(),
                updatedBy: window.currentUser.uid
            };
            // Note: Email & password changes for existing users are more complex and usually handled separately.
            // For simplicity here, we are not allowing email change via this form for existing users.
            // Password change for existing user would require re-authentication or admin SDK.
            if (password) {
                 showAlert('การเปลี่ยนรหัสผ่านสำหรับผู้ใช้ที่มีอยู่แล้วยังไม่รองรับในหน้านี้', 'warning');
                 // For now, we won't update password for existing user to avoid complexity without Admin SDK or re-auth flow
            }
            await db.ref(`users/${tenantId}`).update(updates);
            showAlert('อัปเดตข้อมูลลูกบ้านสำเร็จ!', 'success');
        } else { // Adding new tenant
            if (!password || password.length < 6) {
                showAlert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
                saveButton.disabled = false;
                document.getElementById('save-tenant-button-text').textContent = originalButtonText;
                return;
            }
            // 1. Create user in Firebase Auth
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const newTenantUser = userCredential.user;

            // 2. Save tenant data to Realtime Database
            const tenantData = {
                uid: newTenantUser.uid,
                name: name,
                email: email,
                role: 'level1_tenant',
                status: status,
                accessibleRooms: accessibleRooms,
                ownerUid: window.currentUser.uid, // UID of the Level 1 Owner creating this tenant
                createdAt: new Date().toISOString(),
                createdBy: window.currentUser.uid,
                profileImage: null // Default profile image
            };
            await db.ref(`users/${newTenantUser.uid}`).set(tenantData);
            showAlert('เพิ่มลูกบ้านใหม่สำเร็จ!', 'success');
        }
        closeAddEditTenantModal();
        loadTenantsForLevel1Owner();
    } catch (error) {
        console.error('Error saving tenant:', error);
        let errorMessage = 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลูกบ้าน';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'รหัสผ่านไม่ปลอดภัย (ต้องมีอย่างน้อย 6 ตัวอักษร)';
        }
        showAlert(errorMessage, 'error');
    } finally {
        saveButton.disabled = false;
        document.getElementById('save-tenant-button-text').textContent = originalButtonText;
    }
}

async function loadTenantsForLevel1Owner() {
    const tableBody = document.getElementById('tenants-table-body');
    const emptyState = document.getElementById('tenants-empty-state');
    if (!tableBody || !emptyState) return;

    tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>`;
    emptyState.classList.add('hidden');

    try {
        const ownerUid = window.currentUser.uid;
        const usersSnapshot = await db.ref('users').orderByChild('ownerUid').equalTo(ownerUid).once('value');
        const usersData = usersSnapshot.val();

        if (!usersData) {
            tableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        const tenants = Object.values(usersData).filter(user => user.role === 'level1_tenant');

        // Apply search and filter (to be implemented based on search/filter inputs)
        // const searchTerm = document.getElementById('search-tenants').value.toLowerCase();
        // const statusFilter = document.getElementById('filter-tenant-status').value;
        // let filteredTenants = tenants.filter(tenant => {
        //     const matchesSearch = (!searchTerm || tenant.name.toLowerCase().includes(searchTerm) || tenant.email.toLowerCase().includes(searchTerm));
        //     const matchesStatus = (!statusFilter || tenant.status === statusFilter);
        //     return matchesSearch && matchesStatus;
        // });


        if (tenants.length === 0) {
            tableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
        } else {
            renderTenantsTable(tenants); // Pass the (potentially filtered) tenants
            emptyState.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading tenants:', error);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูลลูกบ้าน</td></tr>`;
        emptyState.classList.add('hidden');
    }
}

function renderTenantsTable(tenants) {
    const tableBody = document.getElementById('tenants-table-body');
    tableBody.innerHTML = ''; // Clear existing rows

    if (!tenants || tenants.length === 0) {
        // This case should be handled by loadTenantsForLevel1Owner showing emptyState
        return;
    }

    tenants.forEach(tenant => {
        const row = tableBody.insertRow();
        row.className = 'hover:bg-slate-700/50 transition-colors';

        const nameCell = row.insertCell();
        nameCell.className = 'py-3 px-4 text-slate-200 text-sm';
        nameCell.textContent = tenant.name;

        const emailCell = row.insertCell();
        emailCell.className = 'py-3 px-4 text-slate-300 text-sm';
        emailCell.textContent = tenant.email;

        const roomsCell = row.insertCell();
        roomsCell.className = 'py-3 px-4 text-slate-300 text-sm';
        roomsCell.textContent = tenant.accessibleRooms && tenant.accessibleRooms.length > 0 ? tenant.accessibleRooms.join(', ') : 'ยังไม่ได้กำหนด';

        const statusCell = row.insertCell();
        statusCell.className = 'py-3 px-4 text-sm';
        const statusBadge = document.createElement('span');
        statusBadge.textContent = tenant.status === 'active' ? 'ใช้งาน' : 'ไม่ใช้งาน';
        statusBadge.className = `px-2.5 py-1 rounded-full text-xs font-medium ${
            tenant.status === 'active'
            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
            : 'bg-red-500/20 text-red-300 border border-red-500/30'
        }`;
        statusCell.appendChild(statusBadge);

        const actionsCell = row.insertCell();
        actionsCell.className = 'py-3 px-4 text-center';

        const editButton = document.createElement('button');
        editButton.className = 'px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs transition-colors mr-2 shadow';
        editButton.innerHTML = '<i class="fas fa-edit"></i> แก้ไข';
        editButton.onclick = () => openAddEditTenantModal(tenant); // Pass full tenant object

        const deleteButton = document.createElement('button');
        deleteButton.className = 'px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs transition-colors shadow';
        deleteButton.innerHTML = '<i class="fas fa-trash"></i> ลบ';
        deleteButton.onclick = () => handleDeleteTenant(tenant.uid, tenant.name);

        actionsCell.appendChild(editButton);
        actionsCell.appendChild(deleteButton);
    });
}

async function handleDeleteTenant(tenantUid, tenantName) {
    if (!tenantUid) return;

    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบลูกบ้าน "${tenantName}"?\nการกระทำนี้จะลบข้อมูลผู้ใช้ออกจากระบบ แต่จะไม่ลบข้อมูลบิลที่เกี่ยวข้อง`)) {
        try {
            // IMPORTANT: Deleting a user from Firebase Authentication CANNOT be done from the client-side SDK
            // without the user re-authenticating or using the Admin SDK on a backend.
            // For now, we will only "soft delete" or mark the user as inactive in the Realtime Database.
            // Or, if this is a Level 1 Owner action, they might not have rights to delete Auth users.
            // A proper implementation would involve a backend function.

            // Option 1: Mark as inactive (soft delete)
            // await db.ref(`users/${tenantUid}`).update({
            //     status: 'deleted', // or 'inactive'
            //     accessibleRooms: [], // Clear accessible rooms
            //     deletedAt: new Date().toISOString(),
            //     deletedBy: window.currentUser.uid
            // });
            // showAlert(`ผู้ใช้ "${tenantName}" ถูกปิดการใช้งานแล้ว`, 'success');

            // Option 2: Actually remove from database (if allowed and Auth deletion is handled elsewhere or accepted as limitation)
            // This does NOT remove them from Firebase Authentication.
            await db.ref(`users/${tenantUid}`).remove();
            showAlert(`ข้อมูลลูกบ้าน "${tenantName}" ถูกลบออกจากฐานข้อมูลแล้ว (แต่ยังคงอยู่ในระบบ Authentication)`, 'success');

            loadTenantsForLevel1Owner(); // Refresh the list
        } catch (error) {
            console.error('Error deleting tenant:', error);
            showAlert('เกิดข้อผิดพลาดในการลบข้อมูลลูกบ้าน', 'error');
        }
    }
}


// Initial call if on home page and user is authenticated
// This should be called after auth.js has confirmed authentication and set currentUser, currentUserRole
// It's better to call this explicitly from auth.js or script.js after user data is ready.
// For example, in script.js's initializePageContent or directly in auth.js after user is resolved.

// Example of how it might be integrated in script.js after auth is confirmed:
/*
function initializePageContent() {
    // ... other initializations ...
    if (window.currentUserRole === '1') {
        initializeLevel1OwnerInterface();
    }
    // ...
}
*/

// Ensure this script is loaded after auth.js and script.js (or called by them)
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization until currentUser is definitely available
    // A more robust way is to have auth.js call this function once user data is ready.
    const checkUserAndInit = () => {
        if (window.currentUser && window.currentUserRole) {
            if (window.currentUserRole === '1') {
                 console.log("Initializing L1 Owner Interface...");
                initializeLevel1OwnerInterface();
            }
        } else {
            // If user data isn't ready, try again shortly.
            // This is a simple polling, a better approach would be a callback or event from auth.js
            // console.log("Waiting for user data...");
            // setTimeout(checkUserAndInit, 200);
        }
    };
    // Call it directly if auth.js is expected to have finished
    // checkUserAndInit();
    // Or, rely on script.js to call initializeLevel1OwnerInterface if role is '1'
});
