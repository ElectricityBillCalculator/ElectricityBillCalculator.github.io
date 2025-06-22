// src/components/ReadingItem.tsx
'use client';

import { useState } from 'react';
import { Edit3, Trash2, AlertTriangle } from 'lucide-react'; // Using lucide-react for icons

// Define the type for a single reading record (matching backend Reading model)
export interface ReadingRecord {
  id: string;
  userId: string;
  meterType: 'electricity' | 'water';
  previousReading: number;
  currentReading: number;
  unitsConsumed: number;
  ratePerUnit: number;
  totalCost: number;
  readingDate: string; // ISO date string
  dueDate?: string | null; // ISO date string or null
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

interface ReadingItemProps {
  reading: ReadingRecord;
  onEdit: (reading: ReadingRecord) => void; // Callback when edit is clicked
  onDelete: (readingId: string) => Promise<void>;   // Callback when delete is clicked, now async
  isDeletingId?: string | null; // Optional: to show loading state on a specific delete button
}

// Helper to format date string (YYYY-MM-DDTHH:mm:ss.sssZ) to a more readable format
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    console.error("Error formatting date:", dateString, e);
    return 'Invalid Date';
  }
};

// Helper to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
};

export default function ReadingItem({ reading, onEdit, onDelete, isDeletingId }: ReadingItemProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const itemIsCurrentlyDeleting = isDeletingId === reading.id;

  const handleDeleteClick = () => {
    setShowConfirmDelete(true);
  };

  const confirmDelete = async () => {
    await onDelete(reading.id);
    setShowConfirmDelete(false); // Hide confirmation after attempting delete
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-5 border border-slate-200 hover:shadow-xl transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">
          {reading.meterType === 'electricity' ? 'ค่าไฟฟ้า' : 'ค่าน้ำประปา'} - <span className="text-blue-600">{formatDate(reading.readingDate)}</span>
        </h3>
        <div className="flex space-x-1">
          <button
            onClick={() => onEdit(reading)}
            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full transition-colors duration-150"
            aria-label="Edit reading"
            title="แก้ไข"
          >
            <Edit3 size={18} />
          </button>
          <button
            onClick={handleDeleteClick}
            disabled={itemIsCurrentlyDeleting || showConfirmDelete}
            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition-colors duration-150 disabled:opacity-50"
            aria-label="Delete reading"
            title="ลบ"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm text-slate-600">
        <div><span className="font-medium text-slate-700">ครั้งก่อน:</span> {reading.previousReading.toLocaleString()}</div>
        <div><span className="font-medium text-slate-700">ปัจจุบัน:</span> {reading.currentReading.toLocaleString()}</div>
        <div><span className="font-medium text-slate-700">หน่วยที่ใช้:</span> {reading.unitsConsumed.toLocaleString()} หน่วย</div>
        <div><span className="font-medium text-slate-700">เรท/หน่วย:</span> {formatCurrency(reading.ratePerUnit)}</div>
        <div className="col-span-2 sm:col-span-1"><span className="font-medium text-slate-700">รวมเป็นเงิน:</span> <span className="text-xl font-bold text-green-600">{formatCurrency(reading.totalCost)}</span></div>
        {reading.dueDate && <div><span className="font-medium text-slate-700">ครบกำหนด:</span> {formatDate(reading.dueDate)}</div>}
      </div>

      <p className="text-xs text-slate-400 mt-4 pt-2 border-t border-slate-100">
        บันทึกเมื่อ: {formatDate(reading.createdAt)} (แก้ไขล่าสุด: {formatDate(reading.updatedAt)})
      </p>

      {showConfirmDelete && (
        <div className="mt-4 p-4 bg-red-50 border-t border-red-200 rounded-b-md">
          <p className="text-sm font-semibold text-red-700 flex items-center">
            <AlertTriangle size={20} className="mr-2 flex-shrink-0" />
            ยืนยันการลบรายการนี้?
          </p>
          <p className="text-xs text-slate-600 mt-1">ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้</p>
          <div className="mt-3 flex items-center space-x-3">
            <button
              onClick={confirmDelete}
              disabled={itemIsCurrentlyDeleting}
              className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px] transition-colors"
            >
              {itemIsCurrentlyDeleting ? (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <><Trash2 size={14} className="mr-1.5"/> ยืนยันลบ</>
              )}
            </button>
            <button
              onClick={() => setShowConfirmDelete(false)}
              disabled={itemIsCurrentlyDeleting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 disabled:opacity-50 transition-colors"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
