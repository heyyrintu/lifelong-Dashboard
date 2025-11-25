# 📁 Project Structure Overview

Complete file structure of Drona MIS V2 with descriptions.

```
drona-mis-v2/
│
├── 📁 app/                                    # Next.js App Router
│   ├── 📁 (dashboard)/                       # Route group (shared layout)
│   │   ├── 📄 layout.tsx                     # Dashboard shell layout
│   │   │                                     # - Wraps all dashboard pages
│   │   │                                     # - Includes Header + Sidebar
│   │   │                                     # - Manages sidebar state
│   │   │
│   │   ├── 📁 summary/                       # Route: /summary
│   │   │   └── 📄 page.tsx                   # Quick Summary Dashboard
│   │   │                                     # - 6 stat cards
│   │   │                                     # - Recent activity feed
│   │   │                                     # - Chart placeholders
│   │   │
│   │   ├── 📁 inbound/                       # Route: /inbound
│   │   │   └── 📄 page.tsx                   # Inbound Management
│   │   │                                     # - PO tracking
│   │   │                                     # - Supplier data table
│   │   │                                     # - Filter interface
│   │   │
│   │   ├── 📁 inventory/                     # Route: /inventory
│   │   │   └── 📄 page.tsx                   # Inventory Management
│   │   │                                     # - Stock levels
│   │   │                                     # - SKU tracking
│   │   │                                     # - Location management
│   │   │
│   │   ├── 📁 outbound/                      # Route: /outbound
│   │   │   └── 📄 page.tsx                   # Outbound Management
│   │   │                                     # - Order tracking
│   │   │                                     # - LR status
│   │   │                                     # - Multi-channel support
│   │   │
│   │   ├── 📁 upload/                        # Route: /upload
│   │   │   └── 📄 page.tsx                   # File Upload Interface
│   │   │                                     # - Drag & drop
│   │   │                                     # - File type selection
│   │   │                                     # - Upload history
│   │   │
│   │   └── 📁 billing/                       # Route: /billing
│   │       └── 📄 page.tsx                   # Billing Management
│   │                                         # - Invoice tracking
│   │                                         # - Payment status
│   │                                         # - Discrepancy alerts
│   │
│   ├── 📄 layout.tsx                         # Root layout
│   │                                         # - HTML structure
│   │                                         # - Metadata
│   │                                         # - Global CSS import
│   │
│   ├── 📄 page.tsx                           # Home page
│   │                                         # - Redirects to /summary
│   │
│   └── 📄 globals.css                        # Global styles
│                                             # - Tailwind directives
│                                             # - CSS variables
│                                             # - Custom scrollbar
│                                             # - Base typography
│
├── 📁 components/                            # React Components
│   ├── 📁 common/                           # Reusable UI Components
│   │   ├── 📄 StatCard.tsx                  # Metric display card
│   │   │                                    # Props: title, value, subtitle,
│   │   │                                    #        icon, trend
│   │   │
│   │   ├── 📄 PageHeader.tsx                # Page title section
│   │   │                                    # Props: title, description,
│   │   │                                    #        actions
│   │   │
│   │   ├── 📄 Table.tsx                     # Data table component
│   │   │                                    # Props: columns, data,
│   │   │                                    #        emptyMessage
│   │   │
│   │   └── 📄 Badge.tsx                     # Status badge
│   │                                        # Props: variant, size
│   │                                        # Variants: default, success,
│   │                                        #          warning, error, info
│   │
│   └── 📁 layout/                           # Layout Components
│       ├── 📄 Header.tsx                    # Top navigation bar
│       │                                    # - App title & breadcrumb
│       │                                    # - User profile
│       │                                    # - Mobile menu toggle
│       │
│       └── 📄 Sidebar.tsx                   # Left navigation menu
│                                            # - 6 menu items with icons
│                                            # - Active state highlighting
│                                            # - Mobile responsive
│                                            # - Version info
│
├── 📁 public/                               # Static Assets
│   └── 📄 favicon.ico                       # Site favicon (placeholder)
│
├── 📄 package.json                          # NPM dependencies & scripts
│                                            # Scripts: dev, build, start,
│                                            #          lint, format
│
├── 📄 tsconfig.json                         # TypeScript configuration
│                                            # - Strict mode enabled
│                                            # - Path aliases (@/*)
│                                            # - Next.js optimizations
│
├── 📄 tailwind.config.ts                    # Tailwind CSS configuration
│                                            # - Custom color palette
│                                            # - Primary theme colors
│                                            # - Extended utilities
│
├── 📄 postcss.config.mjs                    # PostCSS configuration
│                                            # - Tailwind plugin
│                                            # - Autoprefixer
│
├── 📄 next.config.ts                        # Next.js configuration
│                                            # - Basic setup
│                                            # - Future: Image domains, etc.
│
├── 📄 .eslintrc.json                        # ESLint rules
│                                            # - Next.js defaults
│                                            # - TypeScript rules
│
├── 📄 .prettierrc                           # Prettier formatting
│                                            # - Single quotes
│                                            # - 2 space indent
│                                            # - 100 char line width
│
├── 📄 .gitignore                            # Git exclusions
│                                            # - node_modules
│                                            # - .next
│                                            # - .env files
│
├── 📄 .env.example                          # Environment variables template
│                                            # - Phase 2 placeholders
│
├── 📄 README.md                             # Main documentation
│                                            # - Project overview
│                                            # - Installation guide
│                                            # - Feature documentation
│                                            # - Phase 2 roadmap
│
├── 📄 QUICKSTART.md                         # Quick setup guide
│                                            # - 5-minute setup
│                                            # - Feature demos
│                                            # - Troubleshooting
│
├── 📄 DEVELOPMENT.md                        # Developer guide
│                                            # - Architecture decisions
│                                            # - Component guidelines
│                                            # - Phase 2 integration
│
├── 📄 CHANGELOG.md                          # Version history
│                                            # - Release notes
│                                            # - Feature tracking
│
└── 📄 PROJECT_STRUCTURE.md                  # This file
                                             # - Visual structure overview
```

## 📊 File Statistics

### Total Files Created: 30+

**Configuration:** 8 files
- package.json, tsconfig.json, tailwind.config.ts, postcss.config.mjs
- next.config.ts, .eslintrc.json, .prettierrc, .gitignore

**App Routes:** 7 files
- Root layout & page (2)
- Dashboard layout (1)
- Dashboard pages (6): summary, inbound, inventory, outbound, upload, billing

**Components:** 6 files
- Common components (4): StatCard, PageHeader, Table, Badge
- Layout components (2): Header, Sidebar

**Styles:** 1 file
- globals.css

**Documentation:** 5 files
- README.md, QUICKSTART.md, DEVELOPMENT.md, CHANGELOG.md, PROJECT_STRUCTURE.md

**Other:** 2 files
- .env.example, favicon.ico (placeholder)

## 🎯 Key Architecture Decisions

### 1. Route Groups
- Used `(dashboard)` route group to share layout
- All main pages automatically get Header + Sidebar
- Clean URL structure without "dashboard" in path

### 2. Component Organization
- **common/**: UI components usable anywhere
- **layout/**: Structure-specific components
- Clear separation of concerns

### 3. Server vs Client Components
- Layout components: Client ('use client') for interactivity
- Page components: Can be Server Components in Phase 2
- Currently client for ease of development

### 4. TypeScript Usage
- Strict mode enabled
- Interfaces for all component props
- Path aliases (@/*) for clean imports

### 5. Styling Approach
- Utility-first with Tailwind
- Consistent color palette
- Custom CSS only when necessary
- Dark theme throughout

## 🔄 Data Flow (Phase 1)

```
User Navigation
      ↓
  Sidebar Click
      ↓
Next.js Router
      ↓
  Page Component
      ↓
Hardcoded Data Array
      ↓
  Table/Card Components
      ↓
  Render UI
```

## 🔮 Data Flow (Phase 2 - Planned)

```
User Action
      ↓
  Component Event
      ↓
  API Route Call
      ↓
Database Query
      ↓
  Data Processing
      ↓
  Return JSON
      ↓
Component Re-render
      ↓
  Updated UI
```

## 🧩 Component Dependency Tree

```
app/layout.tsx (Root)
│
└── app/(dashboard)/layout.tsx
    ├── components/layout/Header.tsx
    ├── components/layout/Sidebar.tsx
    │
    └── [Page Components]
        ├── components/common/PageHeader.tsx
        ├── components/common/StatCard.tsx
        ├── components/common/Table.tsx
        └── components/common/Badge.tsx
```

## 📦 Import Patterns

### Recommended Import Order:

```typescript
// 1. React & Next.js
import { useState } from 'react';
import Link from 'next/link';

// 2. Third-party libraries
import { Package } from 'lucide-react';

// 3. Local components
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';

// 4. Types
import { MyDataType } from '@/types/data';

// 5. Styles (if needed)
import './styles.css';
```

## 🎨 Style Organization

```
globals.css
├── @tailwind base     → Reset & base styles
├── @tailwind components → Component classes
├── @tailwind utilities → Utility classes
├── :root             → CSS variables
├── * (universal)     → Border colors
├── body             → Font & background
├── @layer base      → Custom heading styles
├── @layer utilities → Custom utilities
└── Scrollbar styles → Custom scrollbar
```

## 🗂️ Future Folders (Phase 2)

```
📁 lib/           # Utility functions
  ├── database.ts  # DB connection
  ├── utils.ts     # Helper functions
  └── excel.ts     # Excel parsing

📁 types/         # TypeScript definitions
  ├── inbound.ts
  ├── inventory.ts
  └── common.ts

📁 hooks/         # Custom React hooks
  ├── useAuth.ts
  └── useData.ts

📁 app/api/       # API routes
  ├── inbound/
  ├── outbound/
  └── upload/

📁 middleware/    # Next.js middleware
  └── auth.ts

📁 prisma/        # Database schema
  └── schema.prisma
```

## 📚 Key Files to Know

### For Styling Changes:
- `tailwind.config.ts` - Color palette
- `app/globals.css` - Global styles

### For Navigation Changes:
- `components/layout/Sidebar.tsx` - Menu items
- `components/layout/Header.tsx` - Breadcrumb

### For Layout Changes:
- `app/(dashboard)/layout.tsx` - Dashboard structure

### For New Pages:
- Create: `app/(dashboard)/[page-name]/page.tsx`
- Update: Sidebar menu items

### For New Components:
- Reusable UI: `components/common/`
- Layout specific: `components/layout/`

---

**Use this guide to navigate the codebase efficiently! 🧭**

