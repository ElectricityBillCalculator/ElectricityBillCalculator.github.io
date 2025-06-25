/*
    Event Handlers and initialization for the Electricity Bill Calculator
*/

import { DATE_FORMAT } from './constants.js';
import { renderHomeRoomCards } from './ui-rendering.js';
import { calculateWaterRatePerUnit, updatePreviousReadingFromDB } from './utilities.js';
import { calculateBill, openEditModal, saveEdit, calculateEditTotals } from './bill-management.js';
import { handleAddRoom } from './room-management.js';
import { addAddonInput, removeAddonInput } from './admin-tools.js';
import { setupCSVUpload } from './csv-upload.js';
import { 
    closeModal, 
    openModal, 
    openEvidenceModal, 
    closeEvidenceModal, 
    handleEvidenceUpload,
    viewEvidence,
    closeEvidenceViewModal
} from './modal-controls.js';

/**
 * Initialize Flatpickr date pickers
 */
export function initializeFlatpickr() {
    const commonOptions = {
        dateFormat: DATE_FORMAT.input,
        altInput: true,
        altFormat: DATE_FORMAT.display,
        locale: DATE_FORMAT.locale,
        allowInput: true
    };

    flatpickr("#add-room-date", commonOptions);
    flatpickr("#add-room-due-date", commonOptions);
    flatpickr("#bill-date", commonOptions);
    flatpickr("#due-date", commonOptions);
    flatpickr("#edit-date", commonOptions);
    flatpickr("#edit-due-date", commonOptions);
}

/**
 * Initialize page content based on current page
 */
export function initializePageContent() {
    if (document.getElementById('home-room-cards')) {
        // This is the home.html page
        initializeFlatpickr();
        renderHomeRoomCards();
        addBulkDataEntryButton();
        setupHomePageEventListeners();
        setupAdminTools();
        setupCSVUpload();
        
    } else if (document.getElementById('history-section')) {
        // This is the index.html page for a specific room
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            initializeFlatpickr();
            setupRoomPageEventListeners(roomParam);
        } else {
            showAlert('ไม่พบข้อมูลห้อง', 'error');
            window.location.href = 'home.html';
        }
    }
}

/**
 * Setup event listeners for home page
 */
function setupHomePageEventListeners() {
    // Modal close buttons
    document.getElementById('close-add-room-modal')?.addEventListener('click', () => closeModal('add-room-modal'));
    document.getElementById('close-settings-modal')?.addEventListener('click', () => closeModal('room-settings-modal'));
    document.getElementById('close-invoice-modal')?.addEventListener('click', () => closeModal('invoice-modal'));
    document.getElementById('close-tenant-modal')?.addEventListener('click', () => closeModal('add-edit-tenant-modal'));
    document.getElementById('confirm-modal-cancel-btn')?.addEventListener('click', () => closeModal('confirm-modal'));
    
    // Add room button and form
    document.getElementById('btn-add-room')?.addEventListener('click', () => openModal('add-room-modal'));
    document.getElementById('add-room-form')?.addEventListener('submit', handleAddRoom);
    
    // Add-on button
    document.getElementById('add-on-button')?.addEventListener('click', addAddonInput);
    
    // Initialize Level 1 Owner interface
    if (typeof initializeLevel1OwnerInterface === 'function') {
        initializeLevel1OwnerInterface();
    } else {
        // For non-level 1 users, ensure my-rooms-content is visible
        const myRoomsContent = document.getElementById('my-rooms-content');
        if (myRoomsContent) {
            myRoomsContent.style.display = 'block';
        }
    }
}

/**
 * Setup admin tools event listeners
 */
function setupAdminTools() {
    // Admin panel buttons
    document.getElementById('btn-view-all-invoices')?.addEventListener('click', openAllInvoicesModal);
    document.getElementById('btn-admin-panel')?.addEventListener('click', () => window.location.href = 'admin.html');
    
    // All invoices modal
    document.getElementById('close-all-invoices-modal')?.addEventListener('click', () => closeModal('all-invoices-modal'));
    document.getElementById('close-all-invoices-modal-btn')?.addEventListener('click', () => closeModal('all-invoices-modal'));
    document.getElementById('search-invoices')?.addEventListener('input', filterAllInvoices);
    document.getElementById('filter-invoice-room')?.addEventListener('change', filterAllInvoices);
    document.getElementById('filter-invoice-date')?.addEventListener('change', filterAllInvoices);
    document.getElementById('invoices-prev-page')?.addEventListener('click', () => changeInvoicesPage(-1));
    document.getElementById('invoices-next-page')?.addEventListener('click', () => changeInvoicesPage(1));
    document.getElementById('export-invoices-csv')?.addEventListener('click', exportInvoicesToCSV);
    document.getElementById('download-filtered-invoices-btn')?.addEventListener('click', downloadFilteredInvoices);
    document.getElementById('download-selected-invoices-btn')?.addEventListener('click', downloadSelectedInvoices);
}

/**
 * Setup event listeners for room page
 * @param {string} room - Room ID
 */
function setupRoomPageEventListeners(room) {
    // Bill calculation form
    document.getElementById('calculate-btn')?.addEventListener('click', calculateBill);
    
    // Water rate calculation
    document.getElementById('total-water-units-household')?.addEventListener('input', calculateWaterRatePerUnit);
    document.getElementById('total-water-bill-household')?.addEventListener('input', calculateWaterRatePerUnit);
    
    // Edit modal
    document.getElementById('save-edit-btn')?.addEventListener('click', saveEdit);
    document.getElementById('close-edit-modal')?.addEventListener('click', () => closeModal('edit-modal'));
    
    // Edit form calculations
    ['edit-current', 'edit-previous', 'edit-rate', 'edit-current-water', 'edit-previous-water', 'edit-water-rate'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', calculateEditTotals);
    });
    
    // Evidence modal
    document.getElementById('close-evidence-modal')?.addEventListener('click', closeEvidenceModal);
    document.getElementById('evidence-save-btn')?.addEventListener('click', handleEvidenceUpload);
    document.getElementById('close-evidence-view-modal')?.addEventListener('click', closeEvidenceViewModal);
    
    // Evidence file inputs
    setupEvidenceFileInputs();
    
    // Load initial data
    const { renderHistoryTable } = import('./ui-rendering.js');
    renderHistoryTable.then(fn => fn(room));
    updatePreviousReadingFromDB(room);
}

/**
 * Setup evidence file input event listeners
 */
function setupEvidenceFileInputs() {
    const fileInput = document.getElementById('evidence-image-input');
    const cameraInput = document.getElementById('evidence-camera-input');
    
    if (fileInput) {
        fileInput.addEventListener('change', handleEvidenceFileSelect);
    }
    
    if (cameraInput) {
        cameraInput.addEventListener('change', handleEvidenceFileSelect);
    }
}

/**
 * Handle evidence file selection
 * @param {Event} event - File input change event
 */
function handleEvidenceFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const preview = document.getElementById('evidence-preview');
    const placeholder = document.getElementById('evidence-placeholder');
    const saveBtn = document.getElementById('evidence-save-btn');
    const errorMsg = document.getElementById('evidence-error');
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        if (errorMsg) {
            errorMsg.textContent = 'กรุณาเลือกไฟล์รูปภาพ (JPEG, PNG, GIF, WebP)';
            errorMsg.style.display = 'block';
        }
        event.target.value = '';
        return;
    }
    
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        if (errorMsg) {
            errorMsg.textContent = 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)';
            errorMsg.style.display = 'block';
        }
        event.target.value = '';
        return;
    }
    
    // Clear error message
    if (errorMsg) {
        errorMsg.style.display = 'none';
    }
    
    // Show preview
    if (preview && placeholder) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
            
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Add bulk data entry button (placeholder function)
 */
function addBulkDataEntryButton() {
    // Implementation depends on specific requirements
    console.log('Bulk data entry button setup');
}

/**
 * Global click handler for closing dropdowns
 */
export function setupGlobalClickHandler() {
    document.addEventListener('click', (event) => {
        // Check if the click is on the dropdown itself or its trigger
        if (!event.target.closest('#global-actions-menu') && !event.target.closest('[onclick^="openActionsMenu"]')) {
            if (typeof closeActionsMenu === 'function') {
                closeActionsMenu();
            }
        }
    });
}

/**
 * Global functions that need to be available on window object
 */
export function exposeGlobalFunctions() {
    // Make functions available globally for onclick handlers
    window.viewRoomHistory = async (room) => {
        const { viewRoomHistory } = await import('./utilities.js');
        viewRoomHistory(room);
    };
    
    window.openEditModal = async (key) => {
        const { openEditModal } = await import('./bill-management.js');
        openEditModal(key);
    };
    
    window.openEvidenceModal = async (key) => {
        const { openEvidenceModal } = await import('./modal-controls.js');
        openEvidenceModal(key);
    };
    
    window.viewEvidence = async (url, fileName) => {
        const { viewEvidence } = await import('./modal-controls.js');
        viewEvidence(url, fileName);
    };
    
    window.calculateBill = async () => {
        const { calculateBill } = await import('./bill-management.js');
        calculateBill();
    };
    
    window.saveEdit = async () => {
        const { saveEdit } = await import('./bill-management.js');
        saveEdit();
    };
    
    window.closeModal = async (modalId) => {
        const { closeModal } = await import('./modal-controls.js');
        closeModal(modalId);
    };
    
    window.openModal = async (modalId) => {
        const { openModal } = await import('./modal-controls.js');
        openModal(modalId);
    };
    
    window.handleAddRoom = async (event) => {
        const { handleAddRoom } = await import('./room-management.js');
        handleAddRoom(event);
    };
    
    // Invoice and payment functions
    window.generateInvoiceForRoom = async (roomId) => {
        const { generateInvoiceForRoom } = await import('./invoice-management.js');
        generateInvoiceForRoom(roomId);
    };
    
    window.generateInvoice = async (billId) => {
        const { generateInvoice } = await import('./invoice-management.js');
        generateInvoice(billId);
    };
    
    window.generateQRCode = async (record) => {
        const { generateQRCode } = await import('./invoice-management.js');
        generateQRCode(record);
    };
    
    window.confirmPayment = async (key) => {
        const { confirmPayment } = await import('./payment-management.js');
        confirmPayment(key);
    };
    
    window.deleteEvidence = async (key) => {
        const { deleteEvidence } = await import('./payment-management.js');
        deleteEvidence(key);
    };
    
    // Admin tools functions
    window.openAssessmentModal = async (roomId) => {
        const { openAssessmentModal } = await import('./admin-tools.js');
        openAssessmentModal(roomId);
    };
    
    window.openRoomSettingsModal = async (roomId) => {
        const { openRoomSettingsModal } = await import('./admin-tools.js');
        openRoomSettingsModal(roomId);
    };
    
    window.openActionsMenu = async (event, billData) => {
        const { openActionsMenu } = await import('./admin-tools.js');
        openActionsMenu(event, billData);
    };
    
    window.closeActionsMenu = async () => {
        const { closeActionsMenu } = await import('./admin-tools.js');
        closeActionsMenu();
    };
    
    window.addAddonInput = addAddonInput;
    
    window.removeAddonInput = removeAddonInput;
    
    // Modal confirmation functions
    window.openDeleteConfirmModal = async (key) => {
        const { openDeleteConfirmModal } = await import('./modal-controls.js');
        openDeleteConfirmModal(key);
    };
    
    window.handleDeleteBill = async (key) => {
        const { handleDeleteBill } = await import('./modal-controls.js');
        handleDeleteBill(key);
    };
    
    // Invoice management
    window.openAllInvoicesModal = async () => {
        const { openAllInvoicesModal } = await import('./invoice-management.js');
        openAllInvoicesModal();
    };
    
    window.filterAllInvoices = async () => {
        const { filterAllInvoices } = await import('./invoice-management.js');
        filterAllInvoices();
    };
    
    window.changeInvoicesPage = async (direction) => {
        const { changeInvoicesPage } = await import('./invoice-management.js');
        changeInvoicesPage(direction);
    };
    
    window.exportInvoicesToCSV = async () => {
        const { exportInvoicesToCSV } = await import('./invoice-management.js');
        exportInvoicesToCSV();
    };
    
    window.downloadFilteredInvoices = async () => {
        const { downloadFilteredInvoices } = await import('./invoice-management.js');
        downloadFilteredInvoices();
    };
    
    window.downloadSelectedInvoices = async () => {
        const { downloadSelectedInvoices } = await import('./invoice-management.js');
        downloadSelectedInvoices();
    };
    
    window.downloadQRCode = async () => {
        const { downloadQRCode } = await import('./invoice-management.js');
        downloadQRCode();
    };
}
