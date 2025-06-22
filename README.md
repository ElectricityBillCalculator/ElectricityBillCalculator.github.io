# ⚡ Electricity Bill Calculator | คำนวณค่าไฟฟ้า

A comprehensive web application for calculating electricity bills with user management, administrative features, and detailed billing breakdowns. Built with modern web technologies and Firebase backend.

## 🌟 Overview

The Electricity Bill Calculator is a full-featured web application designed for accurate electricity bill calculations using Thailand's progressive rate structure. It includes user authentication, role-based access control, administrative panels, and comprehensive bill management features.

## 🚀 Key Features

### 💡 Core Functionality
- **Progressive Rate Calculation**: Accurate bill calculation using Thailand's tiered electricity rates
- **Real-time Results**: Instant calculation with detailed breakdowns
- **QR Code Generation**: PromptPay QR codes for easy payment
- **Bill History**: Complete historical record of all calculations
- **Receipt Generation**: Professional-looking receipts for records

### 👥 User Management
- **Role-based Access Control**: Admin, User, Level 1, Level 2 permissions
- **User Authentication**: Secure Firebase authentication
- **Profile Management**: User profiles with photo uploads
- **Account Status Management**: Active, inactive, pending status tracking

### 🛠️ Administrative Features
- **Complete User Management**: CRUD operations for user accounts
- **Advanced Search & Filtering**: Find users by name, email, or role
- **Statistics Dashboard**: Real-time system statistics
- **Role Assignment**: Flexible permission management
- **Audit Trail**: Track user activities and changes
- **Equipment Assessment**: Create and download equipment inspection forms

### 📋 Room Management
- **Room Settings**: Configure room details, rent, and add-ons
- **Tenant Management**: Manage tenant access and permissions
- **Equipment Assessment**: Comprehensive equipment inspection forms
- **Bulk Data Entry**: Add electricity/water data for multiple rooms
- **Assessment History**: Track equipment condition over time

### 📱 Modern User Experience
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Thai Language Support**: Full Thai language interface
- **Dark Theme**: Modern dark UI with glass morphism effects
- **Interactive UI**: Smooth animations and transitions
- **Accessibility**: Screen reader compatible and keyboard navigable

## 📁 Project Structure

```
bravealltime.github.io/
├── 📄 Core Pages
│   ├── index.html              # Main calculator interface
│   ├── home.html              # User dashboard
│   ├── login.html             # Authentication page
│   ├── admin.html             # Admin panel
│   ├── profile.html           # User profile management
│   └── create-admin.html      # Admin creation tool
│
├── 🔧 JavaScript Modules
│   ├── script.js              # Main calculator logic
│   ├── auth.js                # Authentication & authorization
│   ├── admin.js               # Admin panel functionality
│   ├── profile.js             # Profile management
│   ├── promptpay.js           # QR code generation
│   └── sheets.js              # Google Sheets integration
│
├── 🎨 Styling
│   └── styles.css             # Global styles and themes
│
├── 📊 Documentation
│   └── docs/                       # Complete documentation package
│       ├── PROJECT_DOCUMENTATION.md    # Complete project overview
│       ├── API_DOCUMENTATION.md        # API and function reference
│       ├── DEPLOYMENT_GUIDE.md         # Deployment instructions
│       ├── USER_MANUAL.md              # End-user guide
│       ├── FIREBASE_SETUP.md           # Firebase configuration
│       └── README.md                   # Documentation index
│
├── ⚙️ Configuration
│   ├── cors.json              # CORS settings for Firebase
│   ├── storage.rules          # Firebase Storage security rules
│   └── .gitignore             # Git ignore patterns
│
└── 🖼️ Assets
    ├── images/                # Application images
    └── docs/                  # Documentation assets
```

## 🛠️ Technology Stack

### Frontend
- **HTML5**: Semantic markup and structure
- **CSS3 + Tailwind CSS**: Utility-first styling framework
- **JavaScript (ES6+)**: Modern JavaScript features
- **Font Awesome**: Comprehensive icon library
- **Kanit Font**: Thai-optimized typography

### Backend & Services
- **Firebase Authentication**: User management and security
- **Firebase Realtime Database**: Real-time data synchronization
- **Firebase Storage**: File uploads and media storage
- **Firebase Hosting**: Fast, secure web hosting

### External Libraries
- **QRCode.js**: QR code generation for payments
- **Flatpickr**: Modern date picker component
- **PromptPay**: Thai payment system integration

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase project with Authentication, Database, and Storage enabled
- Internet connection for real-time features

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/bravealltime.github.io.git
   cd bravealltime.github.io
   ```

2. **Set up Firebase**
   - Create a new Firebase project
   - Enable Authentication (Email/Password)
   - Enable Realtime Database
   - Enable Storage
   - Copy your Firebase configuration

3. **Configure the application**
   - Update Firebase config in all HTML files
   - Set up database security rules
   - Configure storage rules

4. **Deploy to Firebase Hosting**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   firebase deploy
   ```

### Local Development

```bash
# Start local development server
firebase serve --only hosting

# Or use any local server
python3 -m http.server 8080
npx live-server .
```

## 📖 Documentation

### Complete Documentation Package
📚 **[View All Documentation](docs/README.md)** - Complete documentation index

### For Developers
- **[Project Documentation](docs/PROJECT_DOCUMENTATION.md)**: Complete technical overview
- **[API Documentation](docs/API_DOCUMENTATION.md)**: Function reference and code structure
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)**: Step-by-step deployment instructions
- **[Equipment Assessment Feature](docs/EQUIPMENT_ASSESSMENT_FEATURE.md)**: Equipment inspection form system

### For Users
- **[User Manual](docs/USER_MANUAL.md)**: Complete user guide with screenshots
- **[Firebase Setup](docs/FIREBASE_SETUP.md)**: Firebase configuration instructions

## 🔐 Security Features

### Authentication & Authorization
- **Secure Authentication**: Firebase Auth with email/password
- **Role-based Permissions**: Granular access control
- **Session Management**: Automatic session handling
- **Password Security**: Firebase security standards

### Data Protection
- **Database Rules**: Strict Firebase security rules
- **Input Validation**: Client and server-side validation
- **XSS Protection**: Sanitized user inputs
- **CORS Configuration**: Proper cross-origin settings

## 📊 User Roles & Permissions

| Feature | Admin | User | Level 1 | Level 2 |
|---------|-------|------|---------|---------|
| Calculate Bills | ✅ | ✅ | ✅ | ✅ |
| View Own History | ✅ | ✅ | ✅ | ✅ |
| Manage Profile | ✅ | ✅ | ✅ | ✅ |
| View All Rooms | ✅ | ✅ | ❌ | ❌ |
| Edit All Bills | ✅ | ✅ | ❌ | ❌ |
| Delete Bills | ✅ | ❌ | ❌ | ❌ |
| Upload Evidence | ✅ | ✅ | ✅ | ❌ |
| View Reports | ✅ | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ | ❌ |
| Manage Roles | ✅ | ❌ | ❌ | ❌ |
| Equipment Assessment | ✅ | ✅ | ✅ | ❌ |

## 🌐 Browser Support

- **Chrome**: 80+
- **Firefox**: 75+
- **Safari**: 13+
- **Edge**: 80+
- **Mobile browsers**: iOS Safari, Chrome Mobile

## 📱 Mobile Compatibility

- **Responsive Design**: Adapts to all screen sizes
- **Touch Optimized**: Mobile-friendly interactions
- **Fast Loading**: Optimized for mobile networks
- **Offline Viewing**: Limited offline functionality

## 🔧 Configuration

### Firebase Configuration
Update the Firebase configuration in all HTML files:

```javascript
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "your-database-url",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};
```

### Database Rules Example
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'"
      }
    }
  }
}
```

## 🚀 Deployment

### Production Deployment
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project
firebase init

# Deploy to production
firebase deploy
```

### Environment Variables
Configure these in your Firebase project:
- Authentication providers
- Database URL
- Storage bucket
- API keys

## 🐛 Troubleshooting

### Common Issues

**CORS Errors**
```bash
gsutil cors set cors.json gs://your-bucket.appspot.com
```

**Authentication Issues**
- Check Firebase Authentication settings
- Verify authorized domains
- Review API key configuration

**Database Permission Errors**
- Review Firebase Database Rules
- Check user authentication status
- Verify role assignments

## 📈 Performance Optimizations

- **Lazy Loading**: Images and non-critical resources
- **Caching**: Firebase caching for faster load times
- **Minification**: CSS and JavaScript optimization
- **CDN**: External library delivery via CDN

## 🔄 Updates & Maintenance

### Regular Maintenance
- **Weekly**: Monitor usage and performance
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and update documentation

### Version History
- **v2.0.0**: Complete user management system
- **v1.5.0**: Added admin panel
- **v1.0.0**: Initial calculator implementation

## 🤝 Contributing

### Development Guidelines
1. Follow existing code style
2. Add comments for complex functions
3. Test on multiple browsers
4. Update documentation

### Pull Request Process
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## 📄 License

This project is proprietary software. All rights reserved.

## 📞 Support

### Getting Help
- **Documentation**: Check the comprehensive docs
- **Issues**: Report bugs via GitHub issues
- **Email**: Contact system administrator

### Community
- **Discussions**: GitHub Discussions
- **Updates**: Watch repository for updates

---

**🔗 Live Demo**: [Visit Application](https://your-domain.com)  
**📧 Contact**: your-email@domain.com  
**📅 Last Updated**: June 21, 2025  
**🏷️ Version**: 2.0.0

---

*Built with ❤️ for accurate electricity bill calculations in Thailand*
```bash
gsutil cors set cors.json gs://YOUR_BUCKET_NAME
```

โดยแทนที่ `YOUR_BUCKET_NAME` ด้วยชื่อ bucket ของคุณ (เช่น `electricity-bill-calcula-ea4a2.appspot.com`)

#### วิธีที่ 2: ใช้ Google Cloud Console

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. เลือกโปรเจค Firebase ของคุณ
3. ไปที่ Cloud Storage > Browser
4. เลือก bucket ของคุณ
5. ไปที่ Settings > CORS
6. อัปโหลดไฟล์ `cors.json` ที่มีอยู่ในโปรเจคนี้

### 3. การใช้งาน

1. เปิดไฟล์ `index.html` ในเว็บเบราว์เซอร์
2. เลือกห้องที่ต้องการบันทึกข้อมูล
3. กรอกข้อมูลค่าไฟ
4. คำนวณและบันทึกข้อมูล
5. สามารถแนบรูปภาพหลักฐานได้

### 4. ฟีเจอร์หลัก

- ✅ คำนวณค่าไฟอัตโนมัติ
- ✅ บันทึกข้อมูลลง Firebase Realtime Database
- ✅ แนบรูปภาพหลักฐานลง Firebase Storage
- ✅ ดูประวัติการคำนวณ
- ✅ แก้ไขและลบข้อมูล
- ✅ สร้าง QR Code สำหรับชำระเงิน
- ✅ รองรับหลายห้อง

### 5. การแก้ไขปัญหา

#### ปัญหา CORS
หากยังเกิดปัญหา CORS ให้ตรวจสอบ:
1. Firebase Storage Rules อนุญาตให้เขียนไฟล์
2. CORS configuration ถูกตั้งค่าอย่างถูกต้อง
3. Firebase Storage SDK ถูกโหลดในหน้าเว็บ

#### ปัญหาการอัปโหลดรูปภาพ
1. ตรวจสอบ Console ใน Developer Tools
2. ดู error message ที่แสดง
3. ตรวจสอบขนาดไฟล์ (ไม่ควรเกิน 5MB)
4. ตรวจสอบประเภทไฟล์ (ต้องเป็นรูปภาพ)

### 6. โครงสร้างไฟล์

```
electricity-bill-calculator/
├── index.html          # หน้าหลัก
├── home.html           # หน้าเลือกห้อง
├── script.js           # JavaScript หลัก
├── styles.css          # CSS
├── storage.rules       # Firebase Storage Rules
├── cors.json           # CORS Configuration
└── README.md           # คู่มือการใช้งาน
```

## การพัฒนา

### การเพิ่มฟีเจอร์ใหม่

1. แก้ไขไฟล์ `script.js` เพื่อเพิ่มฟังก์ชันใหม่
2. อัปเดต HTML เพื่อเพิ่ม UI elements
3. ทดสอบการทำงาน
4. อัปเดตเอกสาร

### การปรับปรุง UI

1. แก้ไขไฟล์ `styles.css` หรือใช้ Tailwind CSS classes
2. ปรับปรุง responsive design
3. ทดสอบบนอุปกรณ์ต่างๆ

## การสนับสนุน

หากพบปัญหาหรือต้องการความช่วยเหลือ กรุณาเปิด Issue ใน GitHub repository นี้ 