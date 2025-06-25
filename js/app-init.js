/*
    Main application initialization for the Electricity Bill Calculator
*/

import { initializeFlatpickr, initializePageContent, setupGlobalClickHandler, exposeGlobalFunctions } from './event-handlers.js';

/**
 * Main application initialization
 */
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

    // Setup global event handlers
    setupGlobalClickHandler();

    // Initialize Flatpickr for date fields
    initializeFlatpickr();

    // Setup search functionality
    const searchInvoicesInput = document.getElementById('search-invoices');
    if (searchInvoicesInput) {
        searchInvoicesInput.addEventListener('input', filterAllInvoices);
    }

    // Expose global functions for onclick handlers
    exposeGlobalFunctions();
});
