/*
    This script handles the core functionality of the Electricity Bill Calculator.
    It relies on auth.js for authentication and permission handling.
*/

// Global variables
const ITEMS_PER_PAGE = 5;
let currentPage = 1;
let editingIndex = -1;
let allHistoryData = []; // This will hold all data for the current room, for sorting
let keyForEvidence = null; // For evidence upload modal
let keyToDelete = null; // For delete confirmation modal

// --- Authentication & Initialization ---

document.addEventListener('DOMContentLoaded', async function() {
    // This check is for all pages that require authentication
    // Add the 'requires-auth' class to the body tag of pages that need it.
    if (document.body.classList.contains('requires-auth')) {
        // checkAuth() now resolves with the user object or null
        const user = await checkAuth(); // from auth.js
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        
        // Set global user variables (already done in auth.js, but ensure consistency)
        window.currentUser = user;
        window.currentUserRole = user.role;
        // window.currentUserData is also set in auth.js after getUserData

        // Update UI elements like navbar, user profile icon etc.
        updateAuthUI(user); // Pass the user object to updateAuthUI

        // Load page-specific data after authentication is confirmed
        initializePageContent();
    }

    // Add a global click listener to close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        // Check if the click is on the dropdown itself or its trigger
        if (!event.target.closest('#global-actions-menu') && !event.target.closest('[onclick^="openActionsMenu"]')) {
             closeActionsMenu();
        }
    });
});

function initializePageContent() {
    // Route to the correct function based on the current page
    if (document.getElementById('home-room-cards') || document.getElementById('level1-owner-tabs-container')) { // Check for L1 tabs too
        renderHomeRoomCards(); // This will now use global currentUser, currentUserRole, currentUserData
        
        // Initialize Level 1 Owner specific UI if applicable
        if (window.currentUserRole === '1') {
            if (typeof initializeLevel1OwnerInterface === 'function') {
                initializeLevel1OwnerInterface();
            } else {
                console.error('initializeLevel1OwnerInterface function not found. Make sure tenantManagement.js is loaded.');
            }
        } else {
            // Hide L1 specific elements if user is not L1
            const l1Tabs = document.getElementById('level1-owner-tabs-container');
            if (l1Tabs) l1Tabs.classList.add('hidden');
            const tenantManagementSection = document.getElementById('manage-tenants-content');
            if (tenantManagementSection) tenantManagementSection.classList.add('hidden');
            // Ensure default room content is visible for non-L1 if L1 tabs were planned
             const myRoomsContent = document.getElementById('my-rooms-content');
             if (myRoomsContent) myRoomsContent.classList.remove('hidden');
        }

        // Add event listeners for the 'Add Room' modal - permission check inside handler or here
        // This button might be visible to Admin and Level 1 Owner
        const addRoomBtn = document.getElementById('btn-add-room');
        const closeAddRoomModalBtn = document.getElementById('close-add-room-modal');
        const addRoomModal = document.getElementById('add-room-modal');
        const addRoomForm = document.getElementById('add-room-form');

        // Show/hide add room button based on permissions
        if (addRoomBtn) {
            if (hasPermission('canAddNewBills')) {
                addRoomBtn.classList.remove('hidden');
                addRoomBtn.addEventListener('click', () => addRoomModal.classList.remove('hidden'));
            } else {
                addRoomBtn.classList.add('hidden');
            }
        }
        
        if(closeAddRoomModalBtn) closeAddRoomModalBtn.addEventListener('click', () => addRoomModal.classList.add('hidden'));
        if(addRoomForm) addRoomForm.addEventListener('submit', handleAddRoom);
        
        // Initialize evidence modal listeners for home page - only for admin
        if (hasPermission('canUploadEvidence')) {
            setupEvidenceModalListeners();
        }

    } else if (document.getElementById('history-section')) {
        // This is the index.html page for a specific room
        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        if (roomParam) {
            document.title = `ประวัติค่าไฟ - ห้อง ${roomParam}`;
            renderHistoryTable(roomParam);
            updatePreviousReadingFromDB(roomParam);
            
            // Initialize evidence modal listeners - only for admin
            if (hasPermission('canUploadEvidence')) {
                setupEvidenceModalListeners();
            }
        } else {
            // Handle case where room is not specified
            const historySection = document.getElementById('history-section');
            if (historySection) {
                 historySection.innerHTML = `<p class="text-center text-red-400">ไม่พบข้อมูลห้อง</p>`;
            }
        }
    }
}


// --- Data Rendering (Functions moved to uiHandlers.js) ---

// renderHomeRoomCards -> uiHandlers.js
// renderHistoryTable -> uiHandlers.js


// --- Data Manipulation (Functions moved to firebaseService.js or to be moved to appLogic.js) ---

// loadFromFirebase -> firebaseService.js
// saveToFirebase -> firebaseService.js
// deleteBill -> Orchestration in appLogic.js, Firebase interaction in firebaseService.js
// handleAddRoom -> Orchestration in appLogic.js, Firebase interaction in firebaseService.js
// calculateBill -> Orchestration in appLogic.js, Firebase interaction in firebaseService.js
// openEditModal -> UI in uiHandlers.js, data loading via firebaseService.js, orchestration in appLogic.js
// saveEdit -> Orchestration in appLogic.js, Firebase interaction in firebaseService.js
// migrateOldData -> Orchestration in appLogic.js, Firebase interaction in firebaseService.js


// --- UI & Utility (Functions moved to uiHandlers.js or to be moved to appLogic.js) ---

// viewRoomHistory -> appLogic.js (navigation)
// updatePagination -> uiHandlers.js (renamed to updatePaginationUI)
// updatePreviousReadingFromDB -> uiHandlers.js (depends on loadFromFirebase)
// calculateWaterRatePerUnit -> appLogic.js (calculation)

// --- Helper Functions for Home Cards (Moved to uiHandlers.js) ---
// getAmountColor -> uiHandlers.js
// getDueDateInfo -> uiHandlers.js

// --- Modal Controls (Moved to uiHandlers.js, some orchestration to appLogic.js) ---
// closeModal -> uiHandlers.js (specific to edit-modal, may need generalization or specific versions)
// viewEvidence -> uiHandlers.js
// closeEvidenceViewModal -> uiHandlers.js
// openEvidenceModal -> Orchestration in appLogic.js, UI part in uiHandlers.js (as openEvidenceModalUI)
// closeEvidenceModal -> uiHandlers.js
// openDeleteConfirmModal -> Orchestration in appLogic.js, UI part in uiHandlers.js (as openDeleteConfirmModalUI)
// closeDeleteConfirmModal -> uiHandlers.js (two instances were present, consolidated)
// closeQrCodeModal -> uiHandlers.js
// handleDeleteBill -> Orchestration in appLogic.js
// handleEvidenceUpload -> Orchestration in appLogic.js
// handleFileSelect -> Orchestration/event handling in appLogic.js
// clearEvidenceSelection -> Orchestration/event handling in appLogic.js
// setupEvidenceModalListeners -> appLogic.js
// generateQRCode -> appLogic.js (orchestrates QR generation and UI update via uiHandlers.js)
// downloadQRCode -> appLogic.js (if kept, likely part of QR generation logic)
// deleteEvidence -> Orchestration in appLogic.js
// confirmPayment -> Orchestration in appLogic.js
// showConfirmModal -> uiHandlers.js
// openEditRoomNameModal -> Orchestration in appLogic.js, UI part in uiHandlers.js (as openEditRoomNameModalUI)
// closeEditRoomNameModal -> uiHandlers.js
// saveRoomNameEdit -> Orchestration in appLogic.js
// openDeleteRoomConfirmModal (for room) -> Orchestration in appLogic.js, UI part in uiHandlers.js (as openDeleteRoomConfirmModalUI)
// closeDeleteRoomConfirmModal (for room) -> uiHandlers.js
// confirmDeleteRoom -> Orchestration in appLogic.js
// toggleDropdown -> This was likely for old dropdowns, new one is openActionsMenu.
// closeAllDropdowns -> Related to old dropdowns.
// closeActionsMenu -> uiHandlers.js
// openActionsMenu -> uiHandlers.js