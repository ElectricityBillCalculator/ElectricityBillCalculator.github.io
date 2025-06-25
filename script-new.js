/*
    Main entry point for the Electricity Bill Calculator.
    This file imports and orchestrates all the modular components.
    It relies on auth.js for authentication and permission handling.
*/

// Import all the modules
import './js/app-init.js';

// Re-export commonly used functions for global access (for backward compatibility)
export { loadFromFirebase, saveToFirebase, deleteBill } from './js/firebase-data.js';
export { renderHomeRoomCards, renderHistoryTable, buildCardContainer } from './js/ui-rendering.js';
export { calculateBill, openEditModal, saveEdit } from './js/bill-management.js';
export { handleAddRoom, handleRoomStatusSwitch, migrateOldData } from './js/room-management.js';
export { setupCSVUpload } from './js/csv-upload.js';
export { 
    closeModal, 
    openModal, 
    viewEvidence, 
    openEvidenceModal, 
    closeEvidenceModal, 
    handleEvidenceUpload 
} from './js/modal-controls.js';
export { 
    getDueDateInfo, 
    formatCurrency, 
    viewRoomHistory, 
    updatePreviousReadingFromDB,
    calculateWaterRatePerUnit 
} from './js/utilities.js';
export { initializeFlatpickr, initializePageContent } from './js/event-handlers.js';

// Legacy global functions that may still be referenced in HTML onclick handlers
// These are exposed through app-init.js via exposeGlobalFunctions()

/*
    The original script.js file was over 5500 lines long and contained:
    - Authentication and initialization logic
    - Firebase data operations (CRUD operations)
    - UI rendering functions for room cards and history tables
    - Bill management (calculate, edit, delete)
    - Room management (add, status updates)
    - Modal controls and evidence handling
    - Utility functions for dates, formatting, etc.
    - Event handlers and page initialization
    
    This has now been modularized into:
    - js/constants.js - Configuration and global state
    - js/firebase-data.js - All Firebase operations
    - js/ui-rendering.js - UI rendering functions
    - js/bill-management.js - Bill CRUD operations
    - js/room-management.js - Room operations
    - js/modal-controls.js - Modal handling
    - js/utilities.js - Utility functions
    - js/event-handlers.js - Event management
    - js/app-init.js - Application initialization
    
    This modular approach provides:
    - Better code organization and maintainability
    - Separation of concerns
    - Easier testing and debugging
    - Improved code reusability
    - Better performance through selective imports
*/
