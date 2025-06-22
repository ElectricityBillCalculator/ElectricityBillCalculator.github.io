import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-4"> {/* Adjust min-h based on nav/footer height */}
      <div className="bg-white p-10 rounded-xl shadow-2xl max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 text-slate-800">
          ยินดีต้อนรับ!
        </h1>
        <p className="text-lg md:text-xl mb-8 text-slate-600">
          ระบบคำนวณและติดตามค่าไฟฟ้าและค่าน้ำของคุณ เริ่มต้นจัดการค่าใช้จ่ายได้อย่างง่ายดายและมีประสิทธิภาพ
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <Link href="/dashboard" legacyBehavior>
            <a className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out text-lg">
              ไปที่ Dashboard
            </a>
          </Link>
          <Link href="/register" legacyBehavior>
            <a className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out text-lg">
              ลงทะเบียนใช้งาน
            </a>
          </Link>
        </div>
        <p className="mt-10 text-sm text-slate-500">
          มีบัญชีอยู่แล้ว? <Link href="/login" className="text-blue-600 hover:underline">เข้าสู่ระบบที่นี่</Link>
        </p>
      </div>
    </div>
  );
}
