// src/components/ReadingForm.tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation'; // For potential redirect or refresh

// Define a type for the form data
interface ReadingFormData {
  meterType: 'electricity' | 'water';
  previousReading: string; // Input as string, convert to number on submit
  currentReading: string;
  ratePerUnit: string;
  readingDate: string; // ISO date string "YYYY-MM-DD"
  dueDate?: string;     // Optional
}

interface ReadingFormProps {
  userId: string; // Or get from session/context later
  onReadingAdded?: () => void; // Callback after successful submission
}

export default function ReadingForm({ userId, onReadingAdded }: ReadingFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<ReadingFormData>({
    meterType: 'electricity',
    previousReading: '',
    currentReading: '',
    ratePerUnit: '',
    readingDate: new Date().toISOString().split('T')[0], // Default to today
    dueDate: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear messages on new input
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Basic client-side validation
    const prevReadingNum = parseFloat(formData.previousReading);
    const currReadingNum = parseFloat(formData.currentReading);
    const rateNum = parseFloat(formData.ratePerUnit);

    if (isNaN(prevReadingNum) || isNaN(currReadingNum) || isNaN(rateNum)) {
      setError('Please enter valid numbers for readings and rate.');
      setIsLoading(false);
      return;
    }

    if (currReadingNum < prevReadingNum) {
      setError('Current reading cannot be less than previous reading.');
      setIsLoading(false);
      return;
    }
    if (rateNum <= 0) {
        setError('Rate per unit must be a positive number.');
        setIsLoading(false);
        return;
    }
     if (!formData.readingDate) {
        setError('Reading date is required.');
        setIsLoading(false);
        return;
    }


    try {
      const response = await fetch('/api/readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-USER-ID': userId, // Temporary for testing, replace with auth token
        },
        body: JSON.stringify({
          meterType: formData.meterType,
          previousReading: prevReadingNum,
          currentReading: currReadingNum,
          ratePerUnit: rateNum,
          readingDate: new Date(formData.readingDate).toISOString(), // Ensure full ISO string for backend
          dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to add reading');
      }

      setSuccessMessage('Reading added successfully!');
      setFormData({ // Reset form
        meterType: 'electricity',
        previousReading: '',
        currentReading: '',
        ratePerUnit: '',
        readingDate: new Date().toISOString().split('T')[0],
        dueDate: '',
      });
      if (onReadingAdded) {
        onReadingAdded(); // Trigger callback e.g. to refresh list
      }
      // router.refresh(); // Or use Next.js router to refresh server components data
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white shadow-xl rounded-lg max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold text-slate-700 mb-6 text-center">บันทึกค่ามิเตอร์รอบใหม่</h2>

      {error && <p className="text-red-600 bg-red-100 p-3 rounded-md text-sm">{error}</p>}
      {successMessage && <p className="text-green-700 bg-green-100 p-3 rounded-md text-sm">{successMessage}</p>}

      <div>
        <label htmlFor="meterType" className="block text-sm font-medium text-slate-700 mb-1">ประเภทมิเตอร์</label>
        <select
          id="meterType"
          name="meterType"
          value={formData.meterType}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
          required
        >
          <option value="electricity">ไฟฟ้า</option>
          <option value="water">น้ำประปา</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label htmlFor="readingDate" className="block text-sm font-medium text-slate-700 mb-1">วันที่จดมิเตอร์</label>
          <input
            type="date"
            id="readingDate"
            name="readingDate"
            value={formData.readingDate}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
            required
          />
        </div>
        <div>
          <label htmlFor="dueDate" className="block text-sm font-medium text-slate-700 mb-1">วันครบกำหนดชำระ (ถ้ามี)</label>
          <input
            type="date"
            id="dueDate"
            name="dueDate"
            value={formData.dueDate}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
          />
        </div>

        <div>
          <label htmlFor="previousReading" className="block text-sm font-medium text-slate-700 mb-1">เลขมิเตอร์ครั้งก่อน</label>
          <input
            type="number"
            id="previousReading"
            name="previousReading"
            value={formData.previousReading}
            onChange={handleChange}
            placeholder="เช่น 12345.67"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
            required
            step="any" // Allows decimals
          />
        </div>
        <div>
          <label htmlFor="currentReading" className="block text-sm font-medium text-slate-700 mb-1">เลขมิเตอร์ปัจจุบัน</label>
          <input
            type="number"
            id="currentReading"
            name="currentReading"
            value={formData.currentReading}
            onChange={handleChange}
            placeholder="เช่น 12400.50"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
            required
            step="any" // Allows decimals
          />
        </div>
      </div>

      <div>
        <label htmlFor="ratePerUnit" className="block text-sm font-medium text-slate-700 mb-1">อัตราค่าบริการต่อหน่วย (บาท)</label>
        <input
          type="number"
          id="ratePerUnit"
          name="ratePerUnit"
          value={formData.ratePerUnit}
          onChange={handleChange}
          placeholder="เช่น 4.75"
          className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
          required
          step="any" // Allows decimals
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-150 ease-in-out"
        >
          {isLoading ? (
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : 'บันทึกข้อมูล'}
        </button>
      </div>
    </form>
  );
}
