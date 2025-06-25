/*
    Utility functions for the Electricity Bill Calculator
*/

import { loadFromFirebase } from './firebase-data.js';
import { DATE_FORMAT, AMOUNT_THRESHOLDS } from './constants.js';

/**
 * Check if the current user has permission for a specific action
 * @param {string} permission - The permission to check
 * @param {string} roomId - Optional room ID for room-specific permissions
 * @returns {boolean} Whether the user has the permission
 */
export function hasPermission(permission, roomId = null) {
    const userRole = window.currentUserRole;
    const userData = window.currentUserData;
    
    // Admin always has all permissions
    if (userRole === 'admin') return true;
    
    // Level 1 Owner permissions
    if (userRole === '1') {
        // Check if they manage this specific room (if roomId provided)
        if (roomId && userData && userData.managedRooms) {
            if (!userData.managedRooms.includes(roomId)) {
                return false;
            }
        }
        
        // Level 1 owners can do most things
        switch (permission) {
            case 'canViewHistory':
            case 'canAddNewBills':
            case 'canEditAllBills':
            case 'canDeleteBills':
            case 'canConfirmPayment':
            case 'canUploadEvidence':
            case 'canGenerateInvoice':
            case 'canManageRooms':
                return true;
            case 'canManageUsers':
            case 'canViewAllInvoices':
                return true; // Level 1 can manage users in their building
            default:
                return false;
        }
    }
    
    // Level 1 Tenant permissions (limited access)
    if (userRole === 'level1_tenant') {
        // Check if they can access this specific room
        if (roomId && userData && userData.accessibleRooms) {
            if (!userData.accessibleRooms.includes(roomId)) {
                return false;
            }
        }
        
        switch (permission) {
            case 'canViewHistory':
            case 'canUploadEvidence':
                return true;
            case 'canAddNewBills':
            case 'canEditAllBills':
            case 'canDeleteBills':
            case 'canConfirmPayment':
            case 'canGenerateInvoice':
            case 'canManageRooms':
            case 'canManageUsers':
            case 'canViewAllInvoices':
                return false;
            default:
                return false;
        }
    }
    
    // Default: no permissions for unknown roles
    return false;
}

/**
 * Get amount color class based on amount value
 * @param {number} amount - The amount to check
 * @returns {string} CSS class name
 */
export function getAmountColorClass(amount) {
    if (amount <= AMOUNT_THRESHOLDS.low) return 'low';
    if (amount <= AMOUNT_THRESHOLDS.medium) return 'medium';
    return 'high';
}

/**
 * Get amount color for display
 * @param {number} amount - The amount to check
 * @returns {string} CSS color class
 */
export function getAmountColor(amount) {
    if (amount <= 1500) return 'text-green-400';
    if (amount <= 2500) return 'text-yellow-400';
    if (amount <= 4000) return 'text-orange-400';
    return 'text-red-500';
}

/**
 * Sort rooms array by ID
 * @param {Array} rooms - Array of room objects
 * @returns {Array} Sorted array
 */
export function sortRooms(rooms) {
    if (!Array.isArray(rooms)) return [];
    return rooms.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/**
 * Get due date information with formatting and color
 * @param {string|Date} dueDateStr - Due date string or Date object
 * @returns {Object} Object with show, text, and color properties
 */
export function getDueDateInfo(dueDateStr) {
    if (!dueDateStr) return { show: false, text: '', color: 'text-slate-500' };

    let dueDate;
    if (typeof dueDateStr === 'string') {
        const parts = dueDateStr.split('/');
        if (parts.length !== 3) return { show: false, text: '', color: 'text-slate-500' };
        dueDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else {
        dueDate = new Date(dueDateStr);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today's date
    dueDate.setHours(0, 0, 0, 0); // Normalize due date

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { show: true, text: `เกินกำหนด ${Math.abs(diffDays)} วัน`, color: 'text-red-500 animate-pulse' };
    }
    if (diffDays === 0) {
        return { show: true, text: `ครบกำหนดวันนี้`, color: 'text-red-400 font-bold' };
    }
    if (diffDays <= 7) {
        return { show: true, text: `ครบกำหนดใน ${diffDays} วัน`, color: 'text-yellow-400' };
    }

    return { show: true, text: `ครบกำหนดวันที่ ${dueDateStr}`, color: 'text-gray-400' };
}

/**
 * Get room name from user data
 * @param {string} room - Room ID
 * @returns {string} Room name or empty string
 */
export async function getRoomName(room) {
    if (!room || typeof room !== 'string' || room.trim() === '') return '';

    try {
        // Get all users from the database
        const usersSnapshot = await db.ref('users').once('value');
        console.log('Fetching users for room:', usersSnapshot);
        const usersData = usersSnapshot.val();

        if (!usersData) return '';

        // Find the first user who has access to this room
        for (const userId in usersData) {
            const user = usersData[userId];
            if (user.accessibleRooms && Array.isArray(user.accessibleRooms) && user.accessibleRooms.includes(room)) {
                console.log(`Found user for room ${room}:`, user);
                return user.name || user.displayName || user.email || '';
            }
        }

        return '';
    } catch (error) {
        console.error('Error getting room name:', error);
        return '';
    }
}

/**
 * Update previous reading from database
 * @param {string} room - Room ID
 */
export async function updatePreviousReadingFromDB(room) {
    if (!room) return;
    
    const bills = await loadFromFirebase(room);
    const previousReadingInput = document.getElementById('previous-reading');
    if (previousReadingInput) {
        previousReadingInput.value = bills.length > 0 ? bills[0].current : '';
    }
    
    const previousWaterReadingInput = document.getElementById('previous-water-reading');
    if (previousWaterReadingInput) {
        previousWaterReadingInput.value = bills.length > 0 && bills[0].currentWater ? bills[0].currentWater : '';
    }
}

/**
 * Calculate water rate per unit
 */
export function calculateWaterRatePerUnit() {
    const totalWaterUnits = parseFloat(document.getElementById('total-water-units-household').value);
    const totalWaterBill = parseFloat(document.getElementById('total-water-bill-household').value);
    const waterRateInput = document.getElementById('water-rate');

    if(totalWaterUnits > 0 && totalWaterBill > 0) {
        const rate = totalWaterBill / totalWaterUnits;
        waterRateInput.value = rate.toFixed(4);
    } else {
        waterRateInput.value = 0;
    }
}

/**
 * Check if device is mobile
 * @returns {boolean} True if mobile device
 */
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Format number as currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
    return Number(amount).toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
}

/**
 * Parse date string to Date object
 * @param {string} dateStr - Date string in d/m/Y format
 * @returns {Date|null} Date object or null if invalid
 */
export function parseDate(dateStr) {
    if (!dateStr) return null;
    
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
}

/**
 * Format Date object to string
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    if (!date) return '';
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}

/**
 * Navigate to room history page
 * @param {string} room - Room ID
 */
export function viewRoomHistory(room) {
    if (!hasPermission('canViewHistory')) {
        showAlert('คุณไม่มีสิทธิ์ดูประวัติข้อมูล', 'error');
        return;
    }
    
    window.location.href = `index.html?room=${encodeURIComponent(room)}`;
}
