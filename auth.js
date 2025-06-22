// Global variables
let currentUser = null;
let userRole = 'user'; // default role

// Role hierarchy: admin > user > 1 (Owner) > level1_tenant > 2
const ROLE_HIERARCHY = {
    'admin': 5,
    'user': 4,
    '1': 3, // Level 1 Owner
    'level1_tenant': 2, // Level 1 Tenant (ลูกบ้าน)
    '2': 1 // Level 2 (อาจจะไม่ใช้แล้ว หรือมีความหมายอื่น)
};

// Role permissions
const ROLE_PERMISSIONS = {
    'admin': {
        canManageUsers: true,
        canManageRoles: true,
        canViewAllRooms: false, // Admin can only see rooms in their building
        canEditAllBills: true,
        canDeleteBills: true,
        canUploadEvidence: true,
        canViewReports: true,
        canAddNewBills: true,
        canGenerateQRCode: true,
        canViewHistory: true,
        canManageTenants: true, // Admin can manage tenants for their building
        canConfirmPayment: true, // Admin can confirm payments for their building
        canManageBuildings: false, // Admin cannot manage other buildings
    },
    'user': { // General user, might not have access to specific room data unless explicitly granted
        canManageUsers: false,
        canManageRoles: false,
        canViewAllRooms: false, // Or based on specific grants
        canEditAllBills: false,
        canDeleteBills: false,
        canUploadEvidence: false, // Or based on specific grants
        canViewReports: false,
        canAddNewBills: false,
        canGenerateQRCode: true, // Can generate for their own bills if any
        canViewHistory: true, // Can view their own history if any
        canManageTenants: false,
        canConfirmPayment: false, // General users cannot confirm payments
        canManageBuildings: false,
    },
    '1': { // Level 1 Owner (เจ้าของห้อง)
        canManageUsers: false, // Cannot manage general users, but can manage their tenants
        canManageRoles: false,
        canViewAllRooms: false, // Should only see their managed rooms
        canEditAllBills: true, // Should only edit bills for their managed rooms
        canDeleteBills: true, // Should only delete bills for their managed rooms
        canUploadEvidence: true, // For their managed rooms
        canViewReports: false, // Or specific reports for their rooms
        canAddNewBills: true, // For their managed rooms
        canGenerateQRCode: true, // For their managed rooms
        canViewHistory: true, // For their managed rooms
        canManageTenants: true, // Key permission for Level 1 Owner
        canConfirmPayment: true, // Room owners can confirm payments for their managed rooms
        canManageBuildings: false,
    },
    'level1_tenant': { // ลูกบ้าน
        canManageUsers: false,
        canManageRoles: false,
        canViewAllRooms: false, // Only accessible rooms
        canEditAllBills: false, // No editing
        canDeleteBills: false, // No deleting
        canUploadEvidence: true, // For their accessible rooms
        canViewReports: false,
        canAddNewBills: false,
        canGenerateQRCode: true, // For their accessible rooms' bills
        canViewHistory: true, // For their accessible rooms
        canManageTenants: false,
        canConfirmPayment: false, // Tenants cannot confirm payments
        canManageBuildings: false,
    },
    '2': { // Level 2 (อาจจะยังคงเดิมหรือปรับเปลี่ยนตามความเหมาะสม)
        canManageUsers: false,
        canManageRoles: false,
        canViewAllRooms: false,
        canEditAllBills: false,
        canDeleteBills: false,
        canUploadEvidence: false,
        canViewReports: false,
        canAddNewBills: false,
        canGenerateQRCode: true, // Potentially for specific cases
        canViewHistory: true,  // Potentially for specific cases
        canManageTenants: false,
        canConfirmPayment: false, // Level 2 cannot confirm payments
        canManageBuildings: false,
    }
};

// Check if user is authenticated. This should only be called once on page load.
function checkAuth() {
    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    // User is signed in. Fetch their data.
                    const snapshot = await db.ref('users/' + user.uid).once('value');
                    const userData = snapshot.val() || {}; // Ensure userData is an object
                    
                    // Construct the complete user object
                    const fullUser = {
                        uid: user.uid,
                        email: user.email,
                        name: userData.name || user.displayName,
                        photoURL: userData.photoURL || user.photoURL,
                        role: userData.role || 'user',
                        createdAt: user.metadata.creationTime,
                        metadata: { lastSignInTime: user.metadata.lastSignInTime },
                        ...userData // Add other db fields
                    };
                    
                    // Force 'admin' role and add demo data for specific email
                    if (user.email === 'admin@electricity.com') {
                        fullUser.role = 'admin';
                        // Add demo data if it doesn't exist from DB
                        if (!userData.name) fullUser.name = 'แอดมินทดสอบ';
                        if (!userData.phone) fullUser.phone = '081-234-5678';
                        if (!userData.address) fullUser.address = '123/456 ถนนพัฒนาการ กรุงเทพมหานคร 10250';
                    }

                    resolve(fullUser); // Resolve with the user object
                } catch (error) {
                    console.error("Error fetching user data:", error);
                    resolve(null); // Resolve with null on error
                }
            } else {
                // User is not signed in.
                resolve(null);
            }
        });
    });
}

// Fetches all necessary user data from the database.
async function getUserData(uid) {
    try {
        const snapshot = await db.ref(`users/${uid}`).once('value');
        const userData = snapshot.val() || {};
        // Set a default role if none exists
        if (!userData.role) {
            userData.role = 'user';
        }
        return userData;
    } catch (error) {
        console.error('Error getting user data:', error);
        return { role: 'user' }; // Return default user object on error
    }
}

// Check if user has permission
function hasPermission(permission, roomToCheck = null) {
    const userRole = window.currentUserRole;
    const currentUserData = window.currentUserData || (window.currentUser ? window.currentUser.dbData : {}); // Ensure currentUserData is available

    // Admin role has all permissions unconditionally.
    if (userRole === 'admin') {
        // For admin, check if they have access to the specific building
        if (roomToCheck && currentUserData.buildingCode) {
            // Admin can only access rooms in their building
            // Room codes should start with building code (e.g., A101 for building A)
            if (!roomToCheck.startsWith(currentUserData.buildingCode)) {
                return false;
            }
        }
        return true;
    }

    if (!userRole || !ROLE_PERMISSIONS[userRole]) {
        return false; // Role not defined or no permissions for role
    }

    // Basic permission check based on role
    const hasBasicPermission = !!ROLE_PERMISSIONS[userRole][permission];
    if (!hasBasicPermission) {
        return false;
    }

    // Role-specific logic for room access
    if (roomToCheck) {
        if (userRole === '1') { // Level 1 Owner
            // Check if the room is one of their managed rooms
            const managedRooms = currentUserData.managedRooms || [];
            if (!managedRooms.includes(roomToCheck)) {
                // If permission is to view history or QR, also check tenant accessible rooms
                if (permission === 'canViewHistory' || permission === 'canGenerateQRCode') {
                    // This part is complex as it requires fetching all tenants and their rooms.
                    // For now, let's assume Level 1 can see history/QR of their own managed rooms.
                    // A more advanced check would iterate through their tenants' accessibleRooms.
                    return false;
                } else if (permission !== 'canManageTenants') { // Owners can always manage tenants
                     return false;
                }
            }
        } else if (userRole === 'level1_tenant') { // Level 1 Tenant
            // Check if the room is one of their accessible rooms
            const accessibleRooms = currentUserData.accessibleRooms || [];
            if (!accessibleRooms.includes(roomToCheck)) {
                return false;
            }
            // Tenants have limited write access, e.g., cannot edit bills but can upload evidence
            if (permission === 'canEditAllBills' || permission === 'canDeleteBills' || permission === 'canAddNewBills') {
                return false; // Tenants generally don't have these rights even for accessible rooms
            }
        }
        // For 'user' or '2', if they have basic permission, roomToCheck logic might depend on other criteria
        // (e.g. if a 'user' is assigned to a specific room through another mechanism).
        // For now, if basic permission exists and it's not L1 or L1_Tenant, we assume access if roomToCheck is involved.
    } else {
        // If no roomToCheck, and it's a permission that implies viewing multiple rooms
        if (userRole === '1' || userRole === 'level1_tenant') {
            // These roles have limited scope, so some permissions might be restricted
            if (permission === 'canViewAllRooms') {
                return false; // They can't view ALL rooms, only their managed/accessible ones
            }
        }
    }

    return true;
}


// Redirect to login if not authenticated
function requireAuth() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Show alert message
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        console.error('Alert container not found!');
        return;
    }
    
    const alertId = 'alert-' + Date.now();
    
    const alertDiv = document.createElement('div');
    alertDiv.id = alertId;
    alertDiv.className = `alert-item mb-4 p-4 rounded-lg shadow-lg max-w-sm flex items-center justify-between ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        type === 'warning' ? 'bg-yellow-500 text-white' :
        'bg-blue-500 text-white'
    }`;
    
    alertDiv.innerHTML = `
        <div class="flex items-center">
             <i class="fas ${
                type === 'success' ? 'fa-check-circle' :
                type === 'error' ? 'fa-exclamation-circle' :
                type === 'warning' ? 'fa-exclamation-triangle' :
                'fa-info-circle'
            } mr-3"></i>
            <span>${message}</span>
        </div>
        <button onclick="removeAlert('${alertId}')" class="ml-4 text-xl font-semibold leading-none">&times;</button>
    `;
    
    alertContainer.appendChild(alertDiv);

    // Trigger the animation
    setTimeout(() => {
        alertDiv.classList.add('show');
    }, 10);

    // Auto remove after 5 seconds
    setTimeout(() => {
        removeAlert(alertId);
    }, 5000);
}

function removeAlert(alertId) {
    const alertElement = document.getElementById(alertId);
    if (alertElement) {
        alertElement.classList.remove('show');
        setTimeout(() => {
            alertElement.remove();
        }, 500); // Wait for fade out animation
    }
}

function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300); // Corresponds to transition duration
    }
}

function togglePasswordVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function showForm(formToShowId, fromLeft = false) {
    const forms = ['login-form', 'forgot-form'];
    const container = document.querySelector('.form-container');

    const formToShow = document.getElementById(formToShowId);

    if (!formToShow || !container) return;

    // Hide all other forms
    forms.forEach(formId => {
        if (formId !== formToShowId) {
            const formToHide = document.getElementById(formId);
            if (formToHide && !formToHide.classList.contains('hidden')) {
                formToHide.classList.remove('active');
                formToHide.classList.add('hidden');
                if(fromLeft) {
                    formToHide.classList.remove('left');
                } else {
                    formToHide.classList.add('left');
                }
            }
        }
    });

    // Show the target form
    formToShow.classList.remove('hidden');
    if(fromLeft) {
       formToShow.classList.add('left');
    } else {
       formToShow.classList.remove('left');
    }

    // Defer the active class to trigger transition
    setTimeout(() => {
        // Adjust container height
        const formContent = formToShow.querySelector('.glass-effect');
        if (formContent) {
            container.style.minHeight = `${formContent.offsetHeight}px`;
        }
        formToShow.classList.add('active');
    }, 50); // Small delay to allow browser to apply 'hidden' removal first
}

async function loginUser(email, password, rememberMe = false) {
    showLoading();
    try {
        const persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
        await auth.setPersistence(persistence);
        
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        showAlert('เข้าสู่ระบบสำเร็จ!', 'success');
        
        // Wait a bit for the user to see the message before redirecting
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMessage = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        }
        showAlert(errorMessage, 'error');
    } finally {
        hideLoading();
    }
}

async function forgotPassword(email) {
    showLoading();
    try {
        await auth.sendPasswordResetEmail(email);
        showAlert('ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว', 'success');
        showForm('login-form', true); // Switch back to login form
    } catch (error) {
        console.error('Forgot password error:', error);
        let errorMessage = 'เกิดข้อผิดพลาด';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'ไม่พบอีเมลนี้ในระบบ';
        }
        showAlert(errorMessage, 'error');
    } finally {
        hideLoading();
    }
}

async function logout() {
    try {
        await auth.signOut();
        currentUser = null;
        userRole = 'user';
        console.log('Logout successful');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        showAlert('Logout failed: ' + error.message, 'error');
    }
}

// This is the single function to update all auth-related UI elements.
function updateAuthUI(user) {
    console.log("[Auth] Updating UI for user:", user);
    const authContainer = document.getElementById('auth-container');
    const adminToolsContainer = document.getElementById('admin-tools');

    // If no user is logged in, show the login button.
    if (!user) {
        if (authContainer) {
            authContainer.innerHTML = `
                <a href="login.html" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center shadow transition">
                    <i class="fas fa-sign-in-alt mr-2"></i>เข้าสู่ระบบ
                </a>
            `;
        }
        return;
    }

    // If a user is logged in, update the UI.
    try {
        const userDisplayName = user.name || user.email.split('@')[0];
        const profileImage = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName)}&background=0D8ABC&color=fff`;
        
        let dropdownMenu = `
            <a href="profile.html" class="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-600 hover:text-white w-full text-left">
                <i class="fas fa-user-circle w-4 mr-2"></i>โปรไฟล์
            </a>
        `;

        if (user.role === 'admin') {
            dropdownMenu += `
                <a href="admin.html" class="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-600 hover:text-white w-full text-left">
                    <i class="fas fa-user-shield w-4 mr-2"></i>จัดการผู้ใช้
                </a>
            `;
        }

        dropdownMenu += `
            <button onclick="logout()" class="block px-4 py-2 text-sm text-red-400 hover:bg-slate-600 hover:text-white w-full text-left">
                <i class="fas fa-sign-out-alt w-4 mr-2"></i>ออกจากระบบ
            </button>
        `;

        authContainer.innerHTML = `
            <div class="relative" x-data="{ open: false }" @click.outside="open = false">
                <button @click="open = !open" class="flex items-center space-x-2">
                    <span class="text-white font-medium text-sm hidden sm:block">${userDisplayName}</span>
                    <img id="nav-user-img" src="${profileImage}" alt="Profile" class="w-10 h-10 rounded-full object-cover border-2 border-slate-600 hover:border-blue-500 transition">
                </button>

                <div x-show="open" x-transition 
                    class="absolute right-0 mt-2 w-48 bg-slate-700 rounded-lg shadow-xl z-50 overflow-hidden border border-slate-600 py-1"
                    style="display: none;">
                    ${dropdownMenu}
                </div>
            </div>
        `;
        
        // Update the admin-specific tools area (admin-tools)
        if (adminToolsContainer) {
            if (user.role === 'admin') {
                console.log("[Auth] User is admin, showing admin tools.");
                adminToolsContainer.innerHTML = `
                    <button onclick="migrateOldData()" class="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full font-bold text-lg shadow flex items-center gap-2 transition-all duration-200 border border-yellow-600">
                        <i class="fas fa-database"></i> อัปเดตข้อมูลเก่า
                    </button>`;
            } else {
                adminToolsContainer.innerHTML = ''; // Ensure non-admins see nothing.
            }
        }

    } catch (error) {
        console.error("Error updating UI:", error);
    }
}

// --- Profile Update Functions ---

async function updateUserProfile(data) {
    const user = auth.currentUser;
    if (!user) throw new Error("ไม่พบผู้ใช้งาน");

    const { displayName, ...customData } = data;

    // Update Firebase Auth profile (for displayName)
    if (displayName && displayName !== user.displayName) {
        await user.updateProfile({ displayName });
    }

    // Update custom data in Realtime Database
    await db.ref('users/' + user.uid).update(customData);
}

/**
 * Uploads a profile photo to Firebase Storage and updates the user's profile.
 * @param {File} file The image file to upload.
 * @param {Function} progressCallback A function to call with upload progress (0-100).
 * @returns {Promise<string>} A promise that resolves with the new photo URL.
 */
async function uploadProfilePhoto(file, progressCallback = () => {}) {
    if (!auth.currentUser) {
        throw new Error("ผู้ใช้ไม่ได้เข้าสู่ระบบ");
    }

    const userId = auth.currentUser.uid;
    const filePath = `profile-photos/${userId}/${Date.now()}_${file.name}`;
    const storageRef = storage.ref(filePath);

    return new Promise((resolve, reject) => {
        const uploadTask = storageRef.put(file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressCallback(progress);
            }, 
            (error) => {
                console.error("Upload failed:", error);
                reject(error);
            }, 
            async () => {
                try {
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                    
                    // Update Firebase Auth profile
                    await auth.currentUser.updateProfile({ photoURL: downloadURL });
                    
                    // Update Realtime Database
                    await db.ref(`users/${userId}`).update({ photoURL: downloadURL });

                    // Update local cache
                    window.auth.currentUser = auth.currentUser;
                    if(window.auth.currentUserData) {
                        window.auth.currentUserData.photoURL = downloadURL;
                    }

                    resolve(downloadURL);
                } catch (error) {
                    console.error("Error updating profile with new photo URL:", error);
                    reject(error);
                }
            }
        );
    });
}

async function updateUserPassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error("กรุณาเข้าสู่ระบบก่อนเปลี่ยนรหัสผ่าน");

    // Re-authenticate user before changing password
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    await user.reauthenticateWithCredential(credential);

    // If re-authentication is successful, update the password
    await user.updatePassword(newPassword);
}

// Initialize authentication
document.addEventListener('DOMContentLoaded', async function() {
    if (document.body.classList.contains('requires-auth')) {
        const user = await checkAuth();
        window.currentUser = user; // Set global user object

        if (user) {
            const userData = await getUserData(user.uid);
            window.currentUserRole = user.role; // Set global role for hasPermission()
            window.currentUserData = userData; // Make full user data from DB globally available for permissions
            
            // This is for profile.js and other modules needing auth functions
            window.auth = {
                currentUser: user, // Firebase auth user object + merged DB data
                userData: userData, // Specific DB data for the user
                updateUserProfile: updateUserProfile,
                updateUserPassword: updateUserPassword,
                uploadProfilePhoto: uploadProfilePhoto,
            };

            updateAuthUI(user); // user here is the merged object from checkAuth()
            
            if(typeof initializePageContent === 'function') {
                initializePageContent();
            }
            if(typeof initializeProfilePage === 'function') {
                initializeProfilePage();
            }
        } else {
            window.location.href = 'login.html';
        }
    }

    // This listener is for the login page specifically.
    if (document.getElementById('loginForm')) {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // User is already logged in, redirect
                const { role } = await getUserData(user.uid);
                // Admin can access both home and admin pages, default to home
                window.location.href = 'home.html';
            }
        });
    }

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            loginUser(email, password);
        });
    }

    // Forgot password form
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value;
            forgotPassword(email);
        });
    }

    // Toggle password visibility
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', function() {
            togglePasswordVisibility('loginPassword', 'togglePassword');
        });
    }

    // Show forgot password form
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', function() {
            showForm('forgot-form');
        });
    }

    // Back to login form
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', function() {
            showForm('login-form');
        });
    }
});

// Export functions for global use
window.loginUser = loginUser;
window.forgotPassword = forgotPassword;
window.logout = logout;
window.showAlert = showAlert;
window.removeAlert = removeAlert;
window.hasPermission = hasPermission;
window.checkAuth = checkAuth;
window.requireAuth = requireAuth;

// =================================================================================
// MAIN SCRIPT EXECUTION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the login page by looking for the login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const forgotForm = document.getElementById('forgotForm');
        const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
        const backToLoginBtn = document.getElementById('backToLoginBtn');
        const togglePasswordBtn = document.getElementById('togglePassword');

        // Initial form setup to prevent blank page on load
        const container = document.querySelector('.form-container');
        const loginFormElement = document.getElementById('login-form');
        if (container && loginFormElement) {
            const formContent = loginFormElement.querySelector('.glass-effect');
            if (formContent) {
                 container.style.minHeight = `${formContent.offsetHeight}px`;
            }
        }

        // Event Listeners
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const rememberMe = document.getElementById('rememberMe').checked;
            loginUser(email, password, rememberMe);
        });

        forgotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value;
            forgotPassword(email);
        });

        forgotPasswordBtn.addEventListener('click', () => {
            showForm('forgot-form', false);
        });

        backToLoginBtn.addEventListener('click', () => {
            showForm('login-form', true);
        });
        
        if (togglePasswordBtn) {
            togglePasswordBtn.addEventListener('click', () => {
                togglePasswordVisibility('loginPassword', 'togglePassword');
            });
        }
    }

    // This part of the script runs on ALL pages
    checkAuth().then(user => {
        if (user) {
            currentUser = user;
            userRole = user.role;
            window.currentUserData = user; // Make user data globally available
            
            // This function should be defined in your main script.js for other pages
            if (typeof initializePageContent === 'function') {
                initializePageContent();
            }
        } else {
            // If not on login page and not authenticated, redirect
            if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('create-admin.html')) {
                requireAuth();
            }
        }
    });

    // Logout button for other pages
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}); 