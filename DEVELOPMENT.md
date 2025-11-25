# 🔧 Development Guide - Drona MIS V2

This guide is for developers working on Phase 2 and beyond.

## 📋 Table of Contents

- [Project Architecture](#project-architecture)
- [Component Guidelines](#component-guidelines)
- [Adding New Pages](#adding-new-pages)
- [Styling Conventions](#styling-conventions)
- [Type Definitions](#type-definitions)
- [Phase 2 Integration Points](#phase-2-integration-points)

## 🏗 Project Architecture

### Tech Stack Decisions

- **Next.js 15 App Router:** For server-side rendering and modern routing
- **TypeScript Strict Mode:** For type safety and better IDE support
- **Tailwind CSS:** For utility-first styling and consistent design
- **Client Components:** Most components use 'use client' for interactivity

### Folder Structure Philosophy

```
app/
  (dashboard)/        # Route group - shares layout
    layout.tsx        # Dashboard shell with sidebar
    [page]/page.tsx   # Individual page routes
  globals.css         # Tailwind directives + custom styles
  layout.tsx          # Root HTML layout

components/
  common/            # Reusable UI components
  layout/            # Layout-specific components
```

## 🧩 Component Guidelines

### Creating New Components

1. **Use TypeScript interfaces for props:**

```typescript
interface MyComponentProps {
  title: string;
  isActive?: boolean;
  onAction: () => void;
}

export default function MyComponent({ title, isActive = false, onAction }: MyComponentProps) {
  // Component logic
}
```

2. **Follow naming conventions:**
   - Component files: PascalCase (e.g., `StatCard.tsx`)
   - Props interfaces: ComponentNameProps (e.g., `StatCardProps`)
   - Utility functions: camelCase

3. **Keep components focused:**
   - Single responsibility principle
   - Extract reusable logic into hooks
   - Keep JSX readable (< 200 lines)

### Existing Reusable Components

#### StatCard
```typescript
import StatCard from '@/components/common/StatCard';
import { Package } from 'lucide-react';

<StatCard
  title="Total Orders"
  value="1,234"
  subtitle="This month"
  icon={Package}
  trend={{ value: 12.5, isPositive: true }}
/>
```

#### PageHeader
```typescript
import PageHeader from '@/components/common/PageHeader';

<PageHeader
  title="Page Title"
  description="Page description text"
  actions={<button>Action</button>}
/>
```

#### Table
```typescript
import Table from '@/components/common/Table';

<Table
  columns={[
    { header: 'Name', accessor: 'name' },
    { header: 'Value', accessor: 'value' }
  ]}
  data={[
    { name: 'Item 1', value: '100' },
    { name: 'Item 2', value: '200' }
  ]}
/>
```

#### Badge
```typescript
import Badge from '@/components/common/Badge';

<Badge variant="success">Active</Badge>
<Badge variant="warning" size="sm">Pending</Badge>
```

## 📄 Adding New Pages

### Step 1: Create Page File

```typescript
// app/(dashboard)/my-page/page.tsx
import PageHeader from '@/components/common/PageHeader';

export default function MyPage() {
  return (
    <div>
      <PageHeader
        title="My New Page"
        description="Description of what this page does"
      />
      {/* Page content */}
    </div>
  );
}
```

### Step 2: Add to Sidebar Navigation

Edit `components/layout/Sidebar.tsx`:

```typescript
const menuItems = [
  // ... existing items
  {
    name: 'My Page',
    path: '/my-page',
    icon: YourIcon, // Import from lucide-react
  },
];
```

### Step 3: Update Header Breadcrumb

Edit `components/layout/Header.tsx`:

```typescript
const getPageName = () => {
  const routes: Record<string, string> = {
    // ... existing routes
    '/my-page': 'My Page',
  };
  return routes[pathname] || 'Dashboard';
};
```

## 🎨 Styling Conventions

### Color Usage

```typescript
// Background colors
bg-slate-950          // Main background
bg-slate-800/50       // Card backgrounds
bg-slate-900          // Input backgrounds

// Border colors
border-slate-700      // Standard borders
border-slate-600      // Hover borders

// Text colors
text-slate-100        // Headings
text-slate-200        // Body text
text-slate-400        // Secondary text
text-slate-500        // Muted text

// Primary accent
bg-primary-500        // Buttons
text-primary-500      // Links, active states
border-primary-500    // Active borders
```

### Common Patterns

**Card with border:**
```typescript
<div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
  {/* Content */}
</div>
```

**Button primary:**
```typescript
<button className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors">
  Click Me
</button>
```

**Button secondary:**
```typescript
<button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-700">
  Secondary
</button>
```

**Input field:**
```typescript
<input
  type="text"
  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500"
  placeholder="Enter text..."
/>
```

### Responsive Design

```typescript
// Use Tailwind responsive prefixes
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"

// Mobile-first approach
className="text-sm md:text-base lg:text-lg"

// Hide/show on different screens
className="hidden lg:block"  // Hidden on mobile, visible on desktop
className="lg:hidden"        // Visible on mobile, hidden on desktop
```

## 📝 Type Definitions

### Create Type Files for Data Models

```typescript
// types/inbound.ts
export interface InboundOrder {
  id: string;
  poNumber: string;
  supplier: string;
  quantity: number;
  status: 'pending' | 'received' | 'in_transit';
  date: string;
  expectedDate: string;
}

export interface InboundFilters {
  dateRange?: string;
  supplier?: string;
  status?: string;
}
```

### Use Types in Components

```typescript
import { InboundOrder } from '@/types/inbound';

interface InboundTableProps {
  orders: InboundOrder[];
  onFilter: (filters: InboundFilters) => void;
}

export default function InboundTable({ orders, onFilter }: InboundTableProps) {
  // Component logic
}
```

## 🔌 Phase 2 Integration Points

### 1. Data Fetching (Replace Placeholder Data)

**Current (Phase 1):**
```typescript
const tableData = [
  { date: '2024-11-24', poNumber: 'PO-001', ... },
  // Hardcoded data
];
```

**Phase 2:**
```typescript
'use server';

import { db } from '@/lib/database';

export async function getInboundOrders() {
  return await db.inboundOrders.findMany({
    orderBy: { date: 'desc' },
  });
}

// In component:
const orders = await getInboundOrders();
```

### 2. File Upload Processing

**Current (Phase 1):**
```typescript
const handleProcess = () => {
  console.log('Processing file:', selectedFile?.name);
  // No actual processing
};
```

**Phase 2:**
```typescript
const handleProcess = async () => {
  const formData = new FormData();
  formData.append('file', selectedFile!);
  formData.append('type', fileType);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  // Handle result
};
```

### 3. Filters Implementation

**Current (Phase 1):**
```typescript
<button className="...">
  Apply Filters
</button>
// Button doesn't do anything
```

**Phase 2:**
```typescript
const [filters, setFilters] = useState<Filters>({});

const handleApplyFilters = () => {
  // Fetch data with filters
  fetchData(filters);
};

<button onClick={handleApplyFilters} className="...">
  Apply Filters
</button>
```

### 4. Charts Integration

**Current (Phase 1):**
```typescript
<div className="h-64 flex items-center justify-center border-2 border-dashed">
  <p>Chart placeholder</p>
</div>
```

**Phase 2 (using Recharts):**
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

<LineChart width={600} height={300} data={chartData}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="date" />
  <YAxis />
  <Tooltip />
  <Line type="monotone" dataKey="value" stroke="#0ea5e9" />
</LineChart>
```

### 5. API Routes Structure

Create API routes in Phase 2:

```
app/api/
  inbound/
    route.ts
  outbound/
    route.ts
  inventory/
    route.ts
  upload/
    route.ts
  billing/
    route.ts
```

Example API route:
```typescript
// app/api/inbound/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Query parameters
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');

  // Fetch data from database
  const orders = await getInboundOrders({ status });

  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Create new inbound order
  return NextResponse.json({ success: true });
}
```

## 🧪 Testing Strategy (Phase 2+)

### Unit Tests
```typescript
// __tests__/components/StatCard.test.tsx
import { render, screen } from '@testing-library/react';
import StatCard from '@/components/common/StatCard';

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Test" value="123" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });
});
```

### Integration Tests
- Test page navigation
- Test form submissions
- Test data fetching

### E2E Tests
- Use Playwright or Cypress
- Test complete user flows

## 🔒 Security Considerations (Phase 2)

1. **Environment Variables**
   - Never commit `.env.local`
   - Use `NEXT_PUBLIC_` prefix only for client-side vars

2. **API Routes**
   - Validate all inputs
   - Implement rate limiting
   - Add authentication middleware

3. **File Uploads**
   - Validate file types and sizes
   - Scan for malware
   - Use signed URLs for storage

## 📊 Performance Optimization

1. **Use Server Components** where possible
2. **Implement pagination** for large datasets
3. **Add loading states** with Suspense
4. **Optimize images** with Next.js Image component
5. **Code splitting** with dynamic imports

## 🐛 Debugging Tips

### Next.js Debugging
```bash
# Verbose logging
NODE_OPTIONS='--inspect' npm run dev

# Check bundle size
npm run build
```

### TypeScript Errors
```bash
# Check types without building
npx tsc --noEmit
```

### Tailwind Not Working
```bash
# Rebuild Tailwind
npx tailwindcss -i ./app/globals.css -o ./dist/output.css --watch
```

## 📚 Recommended VS Code Extensions

- **ES7+ React/Redux/React-Native snippets**
- **Tailwind CSS IntelliSense**
- **TypeScript Importer**
- **Prettier - Code formatter**
- **ESLint**

## 🚀 Deployment Checklist

- [ ] Run `npm run build` successfully
- [ ] Test production build locally
- [ ] Check for console errors
- [ ] Verify environment variables
- [ ] Test on different browsers
- [ ] Test responsive design
- [ ] Run linting: `npm run lint`
- [ ] Update README with deployment instructions

---

**Happy Coding! 🎉**

