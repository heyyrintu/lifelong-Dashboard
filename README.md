# Drona MIS V2 - Management Information System

A modern, responsive dashboard application for Tata DEF logistics operations, built with Next.js, TypeScript, and Tailwind CSS.

## 🚀 Project Overview

**Drona MIS V2** is a comprehensive Management Information System designed to track and manage logistics operations for Tata DEF. This Phase 1 implementation provides a fully functional UI shell with navigation, placeholder data, and a clean, professional interface.

### Current Status: **Phase 2 - Outbound with Backend Complete**

Phase 2 delivers:
- ✅ **NestJS Backend** - Full TypeScript REST API
- ✅ **PostgreSQL Database** - Real data persistence with Prisma ORM
- ✅ **Excel Upload & Parsing** - Outbound file processing
- ✅ **Real-time Data** - Outbound page with live backend data
- ✅ **Category Normalization** - Automatic customer group classification
- ✅ **Date Filtering** - Filter by month or date range
- ✅ **No Mock Data** - Outbound uses 100% real data from database

Previous Phase 1:
- ✅ Modern, responsive dashboard layout
- ✅ Complete navigation structure
- ✅ Reusable component library
- ✅ Professional dark/light theme design

## 📋 Features

### Dashboard Pages

1. **Quick Summary** (`/summary`)
   - Key performance metrics and statistics
   - Activity feed
   - Placeholder chart areas for future data visualization

2. **Inbound Management** (`/inbound`)
   - Purchase order tracking
   - Pending GRN monitoring
   - Supplier management
   - Filterable data tables

3. **Inventory Management** (`/inventory`)
   - Stock level monitoring
   - SKU tracking
   - Location management
   - Ageing analysis

4. **Outbound Management** (`/outbound`)
   - Order dispatch tracking
   - LR (Lorry Receipt) documentation status
   - Multi-channel order management (B2B, B2C, E-commerce)
   - Shipment status tracking

5. **Upload** (`/upload`)
   - Manual Excel file upload interface
   - Drag-and-drop functionality
   - File type selection (Inbound, Outbound, Inventory, Billing)
   - Upload history tracking

6. **Billing** (`/billing`)
   - Invoice management
   - Payment tracking
   - Billing discrepancy monitoring
   - Revenue analytics

## 🛠 Tech Stack

### Frontend
- **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Theme:** next-themes (Light/Dark mode)

### Backend (Phase 2)
- **Framework:** [NestJS](https://nestjs.com/)
- **Language:** TypeScript
- **Database:** PostgreSQL 15+
- **ORM:** [Prisma](https://www.prisma.io/)
- **File Upload:** Multer
- **Excel Parsing:** xlsx

### DevOps
- **Database Container:** Docker Compose
- **Package Manager:** npm
- **Code Quality:** ESLint + Prettier

## 📦 Installation

### Prerequisites

- **Node.js** 18.x or higher
- **Docker Desktop** (recommended) OR PostgreSQL 15+
- npm or pnpm

### Quick Start (Phase 2 - Full Stack)

**📖 For detailed setup instructions, see [PHASE2_SETUP.md](./PHASE2_SETUP.md)**

**Quick commands:**

```bash
# 1. Install frontend dependencies
npm install

# 2. Install backend dependencies
cd backend
npm install

# 3. Start PostgreSQL (Docker)
cd ..
docker-compose up -d

# 4. Setup database
cd backend
npm run prisma:generate
npm run prisma:migrate

# 5. Start backend (in one terminal)
npm run start:dev

# 6. Start frontend (in another terminal)
cd ..
npm run dev
```

**Access the application:**
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:3001](http://localhost:3001)
- Prisma Studio: Run `npm run prisma:studio` in backend folder

### Frontend-Only Setup (Phase 1)

If you only want to run the frontend with placeholder data:

```bash
npm install
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
Lifelong Dashboard/
├── app/                      # Next.js Frontend (App Router)
│   ├── (dashboard)/
│   │   ├── summary/         # Quick Summary page
│   │   ├── inbound/         # Inbound management (placeholder)
│   │   ├── inventory/       # Inventory tracking (placeholder)
│   │   ├── outbound/        # ✨ Outbound (REAL DATA - Phase 2)
│   │   ├── upload/          # ✨ File upload (FUNCTIONAL - Phase 2)
│   │   ├── billing/         # Billing management (placeholder)
│   │   └── layout.tsx       # Dashboard layout
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── common/              # Reusable UI components
│   │   ├── StatCard.tsx
│   │   ├── PageHeader.tsx
│   │   ├── Table.tsx
│   │   └── Badge.tsx
│   └── layout/              # Layout components
│       ├── Header.tsx
│       └── Sidebar.tsx
├── backend/                 # ✨ NestJS Backend (Phase 2)
│   ├── src/
│   │   ├── main.ts         # Application entry point
│   │   ├── app.module.ts   # Root module
│   │   ├── prisma/         # Database service
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   └── outbound/       # Outbound domain module
│   │       ├── outbound.controller.ts    # REST endpoints
│   │       ├── outbound.service.ts       # Business logic
│   │       ├── outbound.module.ts
│   │       └── category-normalizer.service.ts
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   ├── package.json
│   ├── .env                # Environment variables
│   └── README.md           # Backend documentation
├── docker-compose.yml       # ✨ PostgreSQL setup (Phase 2)
├── PHASE2_SETUP.md         # ✨ Detailed setup guide
├── package.json
└── README.md               # This file
```

## 🎨 Design System

### Color Palette

- **Background:** Slate 950/900 (dark theme)
- **Primary Accent:** Cyan/Blue 500
- **Card Background:** Slate 800/50 with transparency
- **Borders:** Slate 700
- **Text:** Slate 100-400 (hierarchical)

### Typography

- **Headings:** Bold, tight tracking
- **Body:** System fonts with smooth rendering
- **Size Scale:** xs (12px) → 3xl (30px)

### Components

- **StatCard:** Metric display with optional icons and trends
- **Table:** Responsive data table with hover states
- **Badge:** Status indicators with color variants
- **PageHeader:** Consistent page titles and descriptions

## 🔄 Navigation

The application uses a fixed sidebar navigation with the following structure:

- **Quick Summary** - Overview dashboard
- **Inbound** - Incoming shipments
- **Inventory** - Stock management
- **Outbound** - Outgoing orders
- **Upload** - File uploads
- **Billing** - Invoicing and payments

Active routes are highlighted with:
- Primary color accent
- Left border indicator
- Different background shade

## 📱 Responsive Design

- **Desktop (≥1024px):** Full sidebar + content area
- **Tablet/Mobile (<1024px):** Collapsible sidebar with overlay
- All tables are horizontally scrollable on small screens
- Touch-friendly button sizes and spacing

## ✅ Phase 2 - What's Implemented

**Outbound Module (Fully Functional):**
- ✅ Excel file upload via browser
- ✅ Backend parsing of Excel data
- ✅ PostgreSQL database storage
- ✅ Automatic customer group categorization
- ✅ Real-time metrics calculation
- ✅ Date and month filtering
- ✅ Category-wise breakdown table
- ✅ No mock/placeholder data

## ⚠ Current Limitations

The following features are **NOT YET implemented**:

- ❌ Inbound, Inventory, Billing modules (still using placeholder data)
- ❌ Google Drive auto-sync
- ❌ Authentication/Authorization
- ❌ Charts and visualizations
- ❌ User management
- ❌ Excel export functionality
- ❌ Advanced search/filtering

**Only the Outbound module uses real backend data. Other pages show placeholder UI.**

## 🔮 Phase 3 Roadmap

Future enhancements will include:

1. **Complete Other Domains**
   - Inbound module with backend
   - Inventory module with backend
   - Billing module with backend
   - Same architecture as Outbound

2. **Google Drive Integration**
   - Automatic file fetching from Google Drive
   - Scheduled sync jobs
   - File change detection

3. **Authentication & Security**
   - User login/logout
   - Role-based access control (Admin, Viewer, Editor)
   - Session management
   - API authentication (JWT)

4. **Advanced Features**
   - Real-time charts and graphs (Recharts/Chart.js)
   - Advanced filtering and search
   - Excel export functionality
   - Email notifications
   - Audit logs and activity tracking
   - Dashboard customization

5. **Performance Optimization**
   - Redis caching layer
   - Database query optimization
   - CDN for static assets
   - Background job processing

## 🧪 Development Commands

### Frontend

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Format code with Prettier
npm run format
```

### Backend

```bash
cd backend

# Start development server (with hot reload)
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod

# Prisma commands
npm run prisma:generate    # Generate Prisma Client
npm run prisma:migrate     # Run migrations
npm run prisma:studio      # Open database GUI
```

### Database (Docker)

```bash
# Start PostgreSQL
docker-compose up -d

# Stop PostgreSQL
docker-compose down

# View logs
docker-compose logs -f

# Reset database (WARNING: deletes all data)
cd backend
npx prisma migrate reset
```

## 📝 Code Quality

- **TypeScript:** Strict mode enabled
- **ESLint:** Next.js recommended config
- **Prettier:** Consistent code formatting
- **Git:** .gitignore configured for Next.js projects

## 🤝 Contributing

When adding new features:

1. Follow the existing component structure
2. Use TypeScript for all new files
3. Maintain consistent styling with Tailwind
4. Add proper TypeScript types/interfaces
5. Test responsiveness on multiple screen sizes
6. Run linting before committing

## 📄 License

This project is proprietary software developed for Drona Logitech.

## 👤 Author

**Rintu Mondal**  
Drona Logitech  
Admin Access

---

## 🆘 Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Kill the process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use a different port
npm run dev -- -p 3001
```

**Module not found errors:**
```bash
# Clear Next.js cache and reinstall
rm -rf .next node_modules
npm install
```

**Styling not appearing:**
```bash
# Ensure Tailwind is processing correctly
npm run dev
# Check browser console for errors
# Verify globals.css is imported in app/layout.tsx
```

## 📞 Support

For issues or questions:
- Check the Next.js documentation: https://nextjs.org/docs
- Review Tailwind CSS docs: https://tailwindcss.com/docs
- Contact the development team

---

**Version:** 2.1.0 (Phase 2 - Outbound Backend Complete)  
**Last Updated:** November 24, 2024

---

## 🎉 Quick Links

- **[Phase 2 Setup Guide](./PHASE2_SETUP.md)** - Comprehensive setup instructions
- **[Backend Documentation](./backend/README.md)** - API docs and backend details
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Prisma Studio:** Run `npm run prisma:studio` in backend folder

