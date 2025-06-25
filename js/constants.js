/*
    Constants and configuration for the Electricity Bill Calculator
*/

// Pagination and display settings
export const ITEMS_PER_PAGE = 5;

// Global state variables
export let currentPage = 1;
export let editingIndex = -1;
export let allHistoryData = []; // This will hold all data for the current room, for sorting
export let keyForEvidence = null; // For evidence upload modal
export let keyToDelete = null; // For delete confirmation modal

// State setters
export function setCurrentPage(page) {
    currentPage = page;
}

export function setEditingIndex(index) {
    editingIndex = index;
}

export function setAllHistoryData(data) {
    allHistoryData = data;
}

export function setKeyForEvidence(key) {
    keyForEvidence = key;
}

export function setKeyToDelete(key) {
    keyToDelete = key;
}

// File upload settings
export const FILE_UPLOAD_CONFIG = {
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.8,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 5 * 1024 * 1024 // 5MB
};

// Date format settings
export const DATE_FORMAT = {
    display: "j F Y",
    input: "d/m/Y",
    locale: "th"
};

// Amount color thresholds
export const AMOUNT_THRESHOLDS = {
    low: 1000,
    medium: 3000,
    high: 4000
};

/**
 * Compress image file
 * @param {File} file - Image file to compress
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @param {number} quality - Compression quality (0-1)
 * @returns {Promise<Blob>} Compressed image blob
 */
export function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.8) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function() {
            // Calculate new dimensions
            let { width, height } = img;
            
            if (width > height) {
                if (width > maxWidth) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = width * (maxHeight / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(resolve, 'image/jpeg', quality);
        };

        img.src = URL.createObjectURL(file);
    });
}
