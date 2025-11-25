# 🎨 Features Overview - Drona MIS V2

Visual guide to all features and components in the application.

---

## 🏠 Application Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER                                                          │
│  ┌──────────────────────┐           ┌──────────────────────┐   │
│  │ ☰  Drona MIS V2     │           │  👤 Rintu Mondal     │   │
│  │    Tata DEF MIS V2   │           │     Admin            │   │
│  └──────────────────────┘           └──────────────────────┘   │
├─────────┬───────────────────────────────────────────────────────┤
│         │                                                        │
│ SIDEBAR │  MAIN CONTENT AREA                                    │
│         │                                                        │
│ • Quick │  ┌────────────────────────────────────────────┐      │
│   Summary│  │                                            │      │
│         │  │      Page Content Here                     │      │
│ • Inbound│  │                                            │      │
│         │  │      (Tables, Cards, Forms, etc.)          │      │
│ • Inv.  │  │                                            │      │
│         │  └────────────────────────────────────────────┘      │
│ • Out.  │                                                        │
│         │                                                        │
│ • Upload│                                                        │
│         │                                                        │
│ • Billing                                                        │
│         │                                                        │
└─────────┴───────────────────────────────────────────────────────┘
```

---

## 🧩 Component Library

### 1. StatCard Component

**Usage**: Display key metrics with optional trends

```
┌─────────────────────────────────────┐
│  📦  Total Shipments                │
│                                     │
│      2,847                          │
│      This month                     │
│                                     │
│      ↑ 12.5% vs last period         │
└─────────────────────────────────────┘
```

**Features**:
- Icon in top-right corner
- Large value display
- Subtitle for context
- Optional trend indicator (↑↓)
- Hover effect
- Responsive sizing

**Props**:
```typescript
{
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; isPositive: boolean };
}
```

---

### 2. Table Component

**Usage**: Display tabular data with consistent styling

```
┌─────────────────────────────────────────────────────────────────┐
│  Date       │ PO Number    │ Supplier      │ Qty  │ Status     │
├─────────────┼──────────────┼───────────────┼──────┼────────────┤
│ 2024-11-24  │ PO-2024-1234 │ ABC Suppliers │ 500  │ [Pending]  │
│ 2024-11-24  │ PO-2024-1235 │ XYZ Industries│ 750  │ [Received] │
│ 2024-11-23  │ PO-2024-1230 │ Global Trade  │ 300  │ [Transit]  │
└─────────────┴──────────────┴───────────────┴──────┴────────────┘
```

**Features**:
- Responsive horizontal scroll
- Hover row highlighting
- Empty state handling
- Consistent padding and spacing
- Status badge integration

**Props**:
```typescript
{
  columns: Array<{ header: string; accessor: string; className?: string }>;
  data: Array<Record<string, any>>;
  emptyMessage?: string;
}
```

---

### 3. Badge Component

**Usage**: Display status indicators

```
[Success]  [Warning]  [Error]  [Info]  [Default]
```

**Variants**:
- **Success**: Green - Completed, Paid, Good
- **Warning**: Yellow - Pending, Low Stock
- **Error**: Red - Failed, Overdue, Critical
- **Info**: Blue - Processing, In Transit
- **Default**: Gray - Neutral status

**Props**:
```typescript
{
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
}
```

---

### 4. PageHeader Component

**Usage**: Consistent page titles

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Quick Summary                            [+ New Action]         │
│  Overview of key metrics and performance indicators              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features**:
- Large title
- Description text
- Optional action buttons area
- Responsive layout

**Props**:
```typescript
{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}
```

---

## 📱 Pages Overview

### 1. Quick Summary (`/summary`)

**Layout**:
```
┌────────────────────────────────────────────────────────────┐
│  Quick Summary                                             │
│  Overview of key metrics...                                │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐         │
│  │  2,847  │  │ 1,234  │  │ 1,613  │  │ 45,890 │         │
│  │ Ships   │  │ Inbound│  │Outbound│  │Inventory│         │
│  └────────┘  └────────┘  └────────┘  └────────┘         │
│                                                            │
│  ┌────────┐  ┌────────┐                                   │
│  │   23    │  │ ₹12.4L │                                   │
│  │LR Miss. │  │Billing │                                   │
│  └────────┘  └────────┘                                   │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │  Monthly Trends  │  │  Distribution    │              │
│  │                  │  │                  │              │
│  │  [Chart Area]    │  │  [Chart Area]    │              │
│  └──────────────────┘  └──────────────────┘              │
│                                                            │
│  Recent Activity                                           │
│  • New inbound order received (5 min ago)                 │
│  • Outbound shipment dispatched (23 min ago)              │
│  • Inventory updated (1 hour ago)                         │
└────────────────────────────────────────────────────────────┘
```

**Key Features**:
- 6 metric cards with trends
- 2 chart placeholder areas
- Recent activity feed
- Responsive grid layout

---

### 2. Inbound Management (`/inbound`)

**Layout**:
```
┌────────────────────────────────────────────────────────────┐
│  Inbound Management                                        │
│  Track and manage incoming shipments...                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                 │
│  │  47   │  │  23  │  │ 8,450│  │  12  │                 │
│  │Today  │  │ Pend.│  │ Units│  │Vendors│                 │
│  └──────┘  └──────┘  └──────┘  └──────┘                 │
│                                                            │
│  Filters                                                   │
│  [Date Range] [Supplier] [Status] [Apply Filters]         │
│                                                            │
│  Inbound Orders Table                                      │
│  Date | PO No | Supplier | Qty | Status | Expected        │
│  --------------------------------------------------------  │
│  ...                                                       │
└────────────────────────────────────────────────────────────┘
```

**Key Features**:
- 4 stat cards
- Filter interface (date, supplier, status)
- Data table with 7 columns
- Status badges

---

### 3. Inventory Management (`/inventory`)

**Layout**:
```
┌────────────────────────────────────────────────────────────┐
│  Inventory Management                                      │
│  Monitor stock levels, locations...                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                 │
│  │ 485  │  │45,890│  │  12  │  │ 3,245│                 │
│  │ SKUs │  │ Units│  │ Low  │  │Ageing│                 │
│  └──────┘  └──────┘  └──────┘  └──────┘                 │
│                                                            │
│  Filters & Search                                          │
│  [Warehouse] [Category] [Status] [SKU] [Search]           │
│                                                            │
│  Inventory Items                      [Export to Excel]    │
│  SKU | Description | Avail | Reserved | Location | Age    │
│  --------------------------------------------------------  │
│  ...                                                       │
└────────────────────────────────────────────────────────────┘
```

**Key Features**:
- 4 inventory metrics
- Advanced filters (warehouse, category, status, SKU)
- 7-column data table
- Export button (UI only)
- Stock status badges

---

### 4. Outbound Management (`/outbound`)

**Layout**:
```
┌────────────────────────────────────────────────────────────┐
│  Outbound Management                                       │
│  Track outbound orders, shipments...                       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                 │
│  │  68  │  │  34  │  │  23  │  │ 142  │                 │
│  │Shipped│  │Pending│  │LR Miss│  │ Done │                 │
│  └──────┘  └──────┘  └──────┘  └──────┘                 │
│                                                            │
│  Filters                                                   │
│  [Date] [Channel] [LR Status] [Order Status] [Apply]      │
│                                                            │
│  Outbound Orders            [Export] [LR Missing Only]     │
│  Date | Order No | Customer | Channel | Qty | LR | Status │
│  --------------------------------------------------------  │
│  ...                                                       │
│                                                            │
│  ⚠ LR Documents Missing                                    │
│  23 orders pending LR documentation...                     │
└────────────────────────────────────────────────────────────┘
```

**Key Features**:
- 4 shipment metrics
- Multi-channel support (B2B, B2C, E-com)
- LR status tracking
- Alert banner for missing LRs
- Channel badges

---

### 5. Upload Interface (`/upload`)

**Layout**:
```
┌────────────────────────────────────────────────────────────┐
│  Upload Excel Files                                        │
│  Manual file upload for inbound, outbound...               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ℹ Phase 1 - Manual Upload Only                           │
│  Automatic data sync will be added in Phase 2             │
│                                                            │
│  ┌─────────────────────────┐  ┌──────────────┐           │
│  │  Upload File            │  │ Instructions │           │
│  │                         │  │              │           │
│  │  ╔═════════════════╗    │  │ • Follow     │           │
│  │  ║                 ║    │  │   template   │           │
│  │  ║   📤            ║    │  │ • Select type│           │
│  │  ║                 ║    │  │ • Max 10MB   │           │
│  │  ║ Drag & Drop     ║    │  │              │           │
│  │  ║     or          ║    │  │ Recent:      │           │
│  │  ║ [Browse Files]  ║    │  │ • file1.xlsx │           │
│  │  ╚═════════════════╝    │  │ • file2.xlsx │           │
│  │                         │  └──────────────┘           │
│  │  Select File Type:      │                             │
│  │  ○ Inbound File         │                             │
│  │  ○ Outbound File        │                             │
│  │  ○ Inventory File       │                             │
│  │  ○ Billing File         │                             │
│  │                         │                             │
│  │  [Process File]         │                             │
│  └─────────────────────────┘                             │
└────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Drag-and-drop area
- File browser button
- File type selection (4 options)
- Selected file display
- Instructions sidebar
- Recent uploads list
- Toast notification

---

### 6. Billing Management (`/billing`)

**Layout**:
```
┌────────────────────────────────────────────────────────────┐
│  Billing Management                                        │
│  Track invoices, payments...                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                 │
│  │₹8.5L │  │₹12.4L│  │  8   │  │₹145L │                 │
│  │Posted│  │Pending│  │Discrep│  │Month │                 │
│  └──────┘  └──────┘  └──────┘  └──────┘                 │
│                                                            │
│  Filters                                                   │
│  [Date Range] [Customer] [Status] [Invoice] [Search]      │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ ₹85.2L   │  │ ₹52.8L   │  │ ₹7.2L    │               │
│  │ Paid     │  │ Pending  │  │ Overdue  │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│                                                            │
│  Invoices                [Export] [Generate Report]        │
│  Inv No | Customer | Order | Amount | Status | Date       │
│  --------------------------------------------------------  │
│  ...                                                       │
│                                                            │
│  ⚠ 8 Billing Discrepancies Found                          │
│  Some invoices have mismatched amounts...                 │
└────────────────────────────────────────────────────────────┘
```

**Key Features**:
- 4 billing metrics
- 3 summary cards (Paid, Pending, Overdue)
- Advanced filters
- 7-column invoice table
- Payment status badges
- Discrepancy alert banner
- Export and report buttons

---

## 🎨 Design System

### Color Palette

**Background Shades** (Dark Theme):
```
Darkest ████ slate-950  Main background
Dark    ████ slate-900  Input backgrounds
Medium  ████ slate-800  Card backgrounds
Light   ████ slate-700  Borders
```

**Text Colors**:
```
Bright  ████ slate-100  Headings
Primary ████ slate-200  Body text
Medium  ████ slate-300  Table text
Dimmed  ████ slate-400  Secondary text
Muted   ████ slate-500  Muted text
```

**Accent Colors**:
```
Primary ████ cyan-500   #0ea5e9  Active states, buttons
Success ████ green-500  #22c55e  Positive status
Warning ████ yellow-500 #eab308  Attention needed
Error   ████ red-500    #ef4444  Critical status
Info    ████ blue-500   #3b82f6  Informational
```

### Typography Scale

```
3xl - 30px  Page Titles (h1)
2xl - 24px  Section Headings (h2)
xl  - 20px  Subsection Headings (h3)
lg  - 18px  Card Titles (h4)
base- 16px  Body Text
sm  - 14px  Secondary Text
xs  - 12px  Labels, Captions
```

### Spacing Scale

```
px - 1px    Borders
1  - 4px    Tight spacing
2  - 8px    Small gaps
3  - 12px   Default gaps
4  - 16px   Medium spacing
6  - 24px   Large spacing
8  - 32px   Section spacing
```

---

## 🎯 Interactive States

### Hover Effects

**Cards**: Border color change (slate-700 → slate-600)
**Buttons**: Background color darken
**Table Rows**: Background highlight (slate-800/50)
**Links**: Color change (slate-400 → slate-200)

### Active States

**Sidebar Items**: 
- Background: primary-500/10
- Text: primary-500
- Border-left: 4px primary-500

**Buttons**:
- Primary: bg-primary-500 → bg-primary-600
- Secondary: bg-slate-800 → bg-slate-700

### Focus States

**Inputs**: Ring color (ring-primary-500)
**Buttons**: Ring color (ring-primary-500)

---

## 📐 Responsive Breakpoints

```
Mobile      < 640px   (sm)  - Stacked layout, collapsed sidebar
Tablet    640-1024px  (md)  - 2-column grids, collapsible sidebar
Desktop    ≥ 1024px   (lg)  - Full layout, fixed sidebar
```

**Responsive Grid Examples**:

```typescript
// 1 column mobile, 2 tablet, 4 desktop
grid-cols-1 md:grid-cols-2 lg:grid-cols-4

// 1 column mobile, 2 tablet, 3 desktop
grid-cols-1 md:grid-cols-2 lg:grid-cols-3

// Hide on mobile, show on desktop
hidden lg:block

// Show on mobile, hide on desktop
lg:hidden
```

---

## 🔔 Notifications & Alerts

### Toast Notification
```
┌─────────────────────────────────┐
│ ✓ Processing Started            │
│   Logic will be added in Phase 2│
└─────────────────────────────────┘
```

### Alert Banners
```
┌─────────────────────────────────────────┐
│ ⚠ LR Documents Missing                  │
│   23 orders pending documentation...    │
└─────────────────────────────────────────┘
```

**Variants**:
- Info (Blue): Phase 1 limitations
- Warning (Yellow): Discrepancies, pending items
- Error (Red): Critical issues

---

## 🎁 Bonus Features

1. **Custom Scrollbar**: Styled for dark theme
2. **Smooth Transitions**: 200ms on interactive elements
3. **Loading States**: Ready for Phase 2 integration
4. **Empty States**: Handled in tables
5. **Mobile Optimization**: Touch-friendly sizes
6. **Keyboard Accessible**: Focus states included

---

**This completes the feature overview!** 🎉

For implementation details, see:
- `README.md` - Full documentation
- `DEVELOPMENT.md` - Code guidelines
- `PROJECT_STRUCTURE.md` - File organization

