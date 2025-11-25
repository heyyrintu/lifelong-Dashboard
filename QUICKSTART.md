# 🚀 Quick Start Guide - Drona MIS V2

Get up and running with the Drona MIS V2 dashboard in less than 5 minutes!

## ⚡ Installation (2 minutes)

### Step 1: Install Dependencies

Open your terminal in the project directory and run:

```bash
npm install
```

This will install all required packages including Next.js, React, TypeScript, and Tailwind CSS.

### Step 2: Start Development Server

```bash
npm run dev
```

### Step 3: Open in Browser

Navigate to **http://localhost:3000**

The application will automatically redirect you to the Quick Summary dashboard.

## 🎯 What You'll See

### Pages Available

1. **Quick Summary** (`/summary`) - DEFAULT HOME PAGE
   - 6 key metric cards
   - Recent activity feed
   - Chart placeholders

2. **Inbound** (`/inbound`)
   - Purchase order tracking
   - Supplier data table

3. **Inventory** (`/inventory`)
   - Stock levels
   - SKU management

4. **Outbound** (`/outbound`)
   - Order tracking
   - LR status monitoring

5. **Upload** (`/upload`)
   - File upload interface
   - Drag-and-drop support

6. **Billing** (`/billing`)
   - Invoice management
   - Payment tracking

## 🎨 Navigation

- **Desktop:** Sidebar is always visible on the left
- **Mobile/Tablet:** Click the menu icon (☰) in the header to toggle sidebar
- **Active Page:** Highlighted with blue accent and left border

## 🖱️ Interactive Features (Phase 1)

### What Works Now:
✅ Full navigation between all pages  
✅ Responsive design (desktop, tablet, mobile)  
✅ Sidebar toggle on mobile  
✅ File selection in Upload page  
✅ Filter UI elements (not functional yet)  
✅ Hover effects and transitions  

### What Doesn't Work Yet (Coming in Phase 2):
❌ File processing and data extraction  
❌ Filters and search functionality  
❌ Data export features  
❌ Chart rendering  
❌ API calls and data fetching  

## 🎪 Demo Features to Try

### Upload Page
1. Go to `/upload`
2. Drag and drop an Excel file or click "Browse Files"
3. Select a file type (Inbound, Outbound, etc.)
4. Click "Process File" - you'll see a notification
5. Check browser console for the log message

### Responsive Design
1. Resize your browser window
2. Notice sidebar collapsing on smaller screens
3. Try the mobile menu toggle

### Tables
1. Visit any page with tables (Inbound, Inventory, Outbound, Billing)
2. Hover over table rows for highlight effect
3. Scroll horizontally on mobile to see all columns

## 📝 Project Structure Quick Reference

```
📁 app/(dashboard)/     → All main pages
📁 components/common/   → Reusable UI components
📁 components/layout/   → Header & Sidebar
📄 app/globals.css      → Tailwind styles
📄 tailwind.config.ts   → Theme configuration
```

## 🔧 Common Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run production build locally
npm start

# Check for code issues
npm run lint

# Format all code
npm run format
```

## ⚙️ Configuration

### Default Settings

- **Port:** 3000
- **Theme:** Dark mode with slate colors
- **Primary Color:** Cyan/Blue (#0ea5e9)
- **Font:** System font stack

### Changing the Port

```bash
npm run dev -- -p 3001
```

## 🎨 Customization Quick Tips

### Change Primary Color

Edit `tailwind.config.ts`:

```typescript
colors: {
  primary: {
    500: '#your-color-here',
    // ... other shades
  }
}
```

### Modify Sidebar Items

Edit `components/layout/Sidebar.tsx` - look for the `menuItems` array.

### Add a New Page

1. Create `app/(dashboard)/your-page/page.tsx`
2. Add route to Sidebar menu items
3. Import `PageHeader` and other components as needed

## 🐛 Troubleshooting

### "Port 3000 is already in use"

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID [PID_NUMBER] /F
```

**Mac/Linux:**
```bash
lsof -ti:3000 | xargs kill -9
```

Or use a different port:
```bash
npm run dev -- -p 3001
```

### "Module not found" errors

```bash
# Delete and reinstall
rmdir /s node_modules
del package-lock.json
npm install
```

### Styles not loading

1. Make sure dev server is running
2. Check `app/globals.css` is imported in `app/layout.tsx`
3. Clear browser cache (Ctrl+F5)
4. Check browser console for errors

### TypeScript errors

```bash
# Check for type issues
npx tsc --noEmit
```

## 📊 Understanding Placeholder Data

All data you see is **hardcoded placeholder data** for demonstration purposes:

- Numbers and statistics are fictional
- Table rows are static examples
- Upload doesn't process files yet
- Filters don't affect displayed data

This will change in Phase 2 when real data integration is added.

## 🎓 Learning Resources

- **Next.js Docs:** https://nextjs.org/docs
- **Tailwind CSS:** https://tailwindcss.com/docs
- **TypeScript:** https://www.typescriptlang.org/docs
- **Lucide Icons:** https://lucide.dev/icons

## 🚀 Next Steps After Setup

1. ✅ Explore all 6 pages
2. ✅ Test responsive design on different screen sizes
3. ✅ Review component code in `components/` folder
4. ✅ Check out the styling in `app/globals.css`
5. ✅ Read the main `README.md` for full documentation
6. ✅ Plan Phase 2 features (data integration, APIs, etc.)

## 💡 Tips for Development

- **Hot Reload:** Changes auto-refresh the browser
- **Type Safety:** VSCode will show TypeScript errors inline
- **Component Reuse:** Use existing components from `components/common/`
- **Consistent Styling:** Follow Tailwind utility classes pattern
- **Mobile First:** Test mobile view frequently

## ❓ Need Help?

Check the full documentation in `README.md` or review the code comments in component files.

---

**Ready to explore!** 🎉

Your dashboard is now running at http://localhost:3000

