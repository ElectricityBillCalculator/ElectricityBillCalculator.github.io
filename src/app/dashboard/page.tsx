// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react'; // Import useSession
import { useRouter } from 'next/navigation';   // Import useRouter
import ReadingForm from '@/components/ReadingForm';
import ReadingItem, { ReadingRecord } from '@/components/ReadingItem';
import { PlusCircle, Edit3, AlertTriangle, X, Loader2 } from 'lucide-react';

interface EditReadingFormData {
  id: string;
  meterType: 'electricity' | 'water';
  previousReading: string;
  currentReading: string;
  ratePerUnit: string;
  readingDate: string;
  dueDate?: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession(); // Get session and status
  const router = useRouter();

  const [readings, setReadings] = useState<ReadingRecord[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(true); // For initial page load, including session check
  const [isLoadingData, setIsLoadingData] = useState(false); // For data fetching specifically
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingReading, setEditingReading] = useState<EditReadingFormData | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Effect for redirecting if not authenticated
  useEffect(() => {
    if (status === 'loading') {
      setIsLoadingPage(true); // Keep showing page loader while session is loading
      return;
    }
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/dashboard'); // Redirect to login if not authenticated
    } else if (status === 'authenticated') {
      setIsLoadingPage(false); // Session loaded and authenticated, can proceed to load data
    }
  }, [status, router]);


  const fetchReadings = useCallback(async () => {
    if (!session?.user?.id) return; // Don't fetch if no user ID

    setIsLoadingData(true);
    setError(null);
    try {
      // API will now use session internally, no need to pass X-USER-ID header
      const response = await fetch('/api/readings', { method: 'GET' });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to fetch readings');
      }
      const data: ReadingRecord[] = await response.json();
      setReadings(data);
    } catch (err: any) {
      setError(err.message);
      setReadings([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [session]); // Depend on session

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchReadings();
    }
  }, [status, session, fetchReadings]); // Re-fetch if session changes (e.g., user logs in)

  const handleReadingAdded = () => {
    fetchReadings();
    setShowForm(false);
  };

  const handleOpenEditModal = (reading: ReadingRecord) => {
    // ... (เหมือนเดิม)
    setShowForm(false);
    setEditingReading({
      id: reading.id,
      meterType: reading.meterType,
      previousReading: reading.previousReading.toString(),
      currentReading: reading.currentReading.toString(),
      ratePerUnit: reading.ratePerUnit.toString(),
      readingDate: reading.readingDate.split('T')[0],
      dueDate: reading.dueDate ? reading.dueDate.split('T')[0] : '',
    });
    setEditError(null);
    setIsEditing(true);
  };

  const handleCloseEditModal = () => {
    // ... (เหมือนเดิม)
    setIsEditing(false);
    setEditingReading(null);
    setEditError(null);
  }

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    // ... (เหมือนเดิม)
    if (!editingReading) return;
    const { name, value } = e.target;
    setEditingReading(prev => ({ ...prev!, [name]: value }));
    setEditError(null);
  };

  const handleSaveChanges = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingReading || !session?.user?.id) return;
    // ... (validation เหมือนเดิม)
    setIsSavingEdit(true);
    setEditError(null);

    const prevReadingNum = parseFloat(editingReading.previousReading);
    const currReadingNum = parseFloat(editingReading.currentReading);
    const rateNum = parseFloat(editingReading.ratePerUnit);

    if (isNaN(prevReadingNum) || isNaN(currReadingNum) || isNaN(rateNum)) {
      setEditError('Please enter valid numbers for readings and rate.');
      setIsSavingEdit(false);
      return;
    }
    if (currReadingNum < prevReadingNum) {
      setEditError('Current reading cannot be less than previous reading.');
      setIsSavingEdit(false);
      return;
    }
    if (rateNum <= 0) {
        setEditError('Rate per unit must be a positive number.');
        setIsSavingEdit(false);
        return;
    }
    if (!editingReading.readingDate) {
        setEditError('Reading date is required.');
        setIsSavingEdit(false);
        return;
    }

    try {
      // API will use session internally
      const response = await fetch(`/api/readings/${editingReading.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meterType: editingReading.meterType,
          previousReading: prevReadingNum,
          currentReading: currReadingNum,
          ratePerUnit: rateNum,
          readingDate: new Date(editingReading.readingDate).toISOString(),
          dueDate: editingReading.dueDate ? new Date(editingReading.dueDate).toISOString() : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to update reading');
      }
      handleCloseEditModal();
      fetchReadings();
    } catch (err: any) {
      setEditError(err.message || 'An unexpected error occurred during update.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteReading = async (readingId: string) => {
    if (!session?.user?.id) return;
    // ... (เหมือนเดิม)
    setDeletingId(readingId);
    setError(null);
    try {
      // API will use session internally
      const response = await fetch(`/api/readings/${readingId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete reading');
      }
      setReadings(prevReadings => prevReadings.filter(r => r.id !== readingId));
    } catch (err: any) {
      setError(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleShowForm = () => {
    // ... (เหมือนเดิม)
    if (isEditing) {
        handleCloseEditModal();
    }
    setShowForm(prev => !prev);
  }

  // Show loading spinner for the whole page if session is loading or user is not yet authenticated
  if (isLoadingPage || status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-250px)]">
        <Loader2 size={48} className="animate-spin text-blue-600"/>
        <p className="mt-4 text-slate-500">Loading Dashboard...</p>
      </div>
    );
  }

  // If authenticated, render the dashboard content
  if (status === 'authenticated' && session?.user) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-white shadow rounded-lg">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Dashboard</h1>
          <button
            onClick={toggleShowForm}
            className="w-full sm:w-auto flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out"
          >
            <PlusCircle size={20} className="mr-2" />
            {showForm ? 'ซ่อนฟอร์ม' : 'เพิ่มรายการใหม่'}
          </button>
        </div>

        {showForm && (
          <div className="my-6 transition-all duration-300 ease-in-out">
            {/* Pass the actual user ID from session to ReadingForm */}
            <ReadingForm userId={session.user.id!} onReadingAdded={handleReadingAdded} />
          </div>
        )}

        {isEditing && editingReading && (
          // Edit Modal (เหมือนเดิม, แต่ userId จะมาจาก session ใน API calls)
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <form onSubmit={handleSaveChanges} className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative transform transition-all duration-300 ease-out scale-100">
              <div className="flex justify-between items-center mb-2">
                  <h2 className="text-xl font-semibold text-slate-700">แก้ไขรายการ</h2>
                  <button type="button" onClick={handleCloseEditModal} className="text-slate-400 hover:text-slate-600">
                      <X size={24}/>
                  </button>
              </div>
              {editError && <p className="text-red-600 bg-red-100 p-2.5 rounded-md text-sm mb-3">{editError}</p>}

              <div>
                <label htmlFor="editMeterType" className="block text-sm font-medium text-slate-600 mb-1">ประเภท</label>
                <select id="editMeterType" name="meterType" value={editingReading.meterType} onChange={handleEditFormChange} className="mt-1 block w-full p-2.5 border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors">
                  <option value="electricity">ไฟฟ้า</option>
                  <option value="water">น้ำประปา</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label htmlFor="editReadingDate" className="block text-sm font-medium text-slate-600 mb-1">วันที่จด</label>
                      <input type="date" id="editReadingDate" name="readingDate" value={editingReading.readingDate} onChange={handleEditFormChange} className="mt-1 block w-full p-2.5 border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors" required/>
                  </div>
                  <div>
                      <label htmlFor="editDueDate" className="block text-sm font-medium text-slate-600 mb-1">วันครบกำหนด</label>
                      <input type="date" id="editDueDate" name="dueDate" value={editingReading.dueDate || ''} onChange={handleEditFormChange} className="mt-1 block w-full p-2.5 border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors"/>
                  </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label htmlFor="editPreviousReading" className="block text-sm font-medium text-slate-600 mb-1">ครั้งก่อน</label>
                      <input type="number" id="editPreviousReading" name="previousReading" value={editingReading.previousReading} onChange={handleEditFormChange} className="mt-1 block w-full p-2.5 border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors" step="any" required/>
                  </div>
                  <div>
                      <label htmlFor="editCurrentReading" className="block text-sm font-medium text-slate-600 mb-1">ปัจจุบัน</label>
                      <input type="number" id="editCurrentReading" name="currentReading" value={editingReading.currentReading} onChange={handleEditFormChange} className="mt-1 block w-full p-2.5 border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors" step="any" required/>
                  </div>
              </div>
              <div>
                  <label htmlFor="editRatePerUnit" className="block text-sm font-medium text-slate-600 mb-1">เรท/หน่วย</label>
                  <input type="number" id="editRatePerUnit" name="ratePerUnit" value={editingReading.ratePerUnit} onChange={handleEditFormChange} className="mt-1 block w-full p-2.5 border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors" step="any" required/>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200 mt-5">
                <button type="button" onClick={handleCloseEditModal} className="px-5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md shadow-sm transition-colors">
                  ยกเลิก
                </button>
                <button type="submit" disabled={isSavingEdit} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px] transition-colors">
                  {isSavingEdit && ( <Loader2 size={16} className="animate-spin -ml-1 mr-2"/> )}
                  {isSavingEdit ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-2xl font-semibold text-slate-700 mb-5">ประวัติการบันทึก</h2>
          {isLoadingData && ( /* Loader for data fetching specifically */
            <div className="flex flex-col justify-center items-center p-10 text-center">
              <Loader2 size={36} className="animate-spin text-blue-600 mb-3"/>
              <p className="text-slate-500">กำลังโหลดรายการ...</p>
            </div>
          )}
          {error && !isLoadingData && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-md relative shadow" role="alert">
              <strong className="font-bold flex items-center"><AlertTriangle size={20} className="mr-2"/>พบข้อผิดพลาด:</strong>
              <span className="block sm:inline ml-1">{error}</span>
            </div>
          )}
          {!isLoadingData && !error && readings.length === 0 && (
            <div className="text-center text-slate-500 py-12 bg-white rounded-lg shadow">
               <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-search mx-auto mb-3 text-slate-400"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><path d="M14 2v6h6"/><circle cx="10.5" cy="15.5" r="2.5"/><path d="m12.5 17.5-1.5-1.5"/></svg>
              <p className="text-lg">ยังไม่มีรายการบันทึก</p>
              <p className="text-sm">ลองกดปุ่ม "เพิ่มรายการใหม่" เพื่อเริ่มต้น</p>
            </div>
          )}
          {!isLoadingData && !error && readings.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {readings.map((reading) => (
                <ReadingItem
                  key={reading.id}
                  reading={reading}
                  onEdit={handleOpenEditModal}
                  onDelete={handleDeleteReading}
                  isDeletingId={deletingId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback for any other unhandled status, though should be covered by isLoadingPage
  return null;
}
