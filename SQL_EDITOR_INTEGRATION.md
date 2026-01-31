# SQL Editor Integration Guide

## Adding SQL Editor to Sidebar

### Step 1: Update Sidebar.tsx

Di file `components/layout/Sidebar.tsx`, tambahkan import untuk SqlEditorView dan icon Database:

```typescript
// Tambahkan ke existing imports:
import { Database } from 'lucide-react';
import SqlEditorView from '../settings/SqlEditorView';
```

### Step 2: Update Dictionary

Tambahkan ke dalam `DICTIONARY` object di Sidebar.tsx:

```typescript
const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        // ... existing entries ...
        sql_editor: 'SQL Query Editor',
        // ...
    },
    en: {
        // ... existing entries ...
        sql_editor: 'SQL Query Editor',
        // ...
    }
};
```

### Step 3: Add Menu Item

Tambahkan menu item untuk SQL Editor di dalam sidebar menu structure. Cari bagian "Admin Only" atau "Settings" dan tambahkan:

```typescript
// Tambahkan ini di dalam menu hierarchy:
{
    id: 'sql_editor',
    label: DICTIONARY[language]['sql_editor'],
    icon: Database,
    view: 'sql_editor',
    requiresAdmin: true,
    requiresFinance: false
}
```

### Step 4: Handle View Routing

Di App.tsx, tambahkan case untuk sql_editor view:

```typescript
{currentView === 'sql_editor' && (
    <SqlEditorView />
)}
```

### Step 5: Complete Implementation

Berikut adalah snippet lengkap yang perlu ditambahkan:

**Di Sidebar.tsx - Import section:**
```typescript
import { Database } from 'lucide-react';
import SqlEditorView from '../settings/SqlEditorView';
```

**Di Sidebar.tsx - Dictionary:**
```typescript
const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        // ... other entries ...
        settings: 'Pengaturan',
        sql_editor: '📊 SQL Query Editor',  // Admin only tool
    },
    en: {
        // ... other entries ...
        settings: 'Settings',
        sql_editor: '📊 SQL Query Editor',  // Admin only tool
    }
};
```

**Di App.tsx - Imports:**
```typescript
import SqlEditorView from './components/settings/SqlEditorView';
```

**Di App.tsx - Render section (before closing main tag):**
```typescript
{currentView === 'sql_editor' && (
    <div className="max-w-7xl mx-auto">
        <SqlEditorView />
    </div>
)}
```

---

## Usage

1. **Access SQL Editor**
   - Admin users dapat mengakses melalui Settings menu
   - Click "SQL Query Editor" dari sidebar

2. **Write Queries**
   - Ketik SQL query di text area
   - Supported: SELECT, INSERT, UPDATE, DELETE, etc.
   - Example queries included dalam template

3. **Execute**
   - Click "Execute Query" button
   - Results ditampilkan dalam table format
   - Execution time tracked

4. **Save Queries**
   - Click "Save Query" button
   - Berikan nama untuk query
   - Queries disimpan di localStorage browser

5. **Load Saved Queries**
   - Click "Saved Queries (n)" button
   - Select query dari list
   - Query akan di-load ke editor

6. **Export Results**
   - Click "CSV" button untuk export ke CSV file
   - Click "Copy" untuk copy results ke clipboard

---

## Security Considerations

### Current Implementation (Development)
- Query execution bisa dilakukan oleh any authenticated user yang access Editor
- Queries bisa SELECT/INSERT/UPDATE/DELETE any table

### For Production:
Implement proper security:

1. **Restrict Access**
   ```typescript
   // Only allow super admin
   requiresAdmin: true,
   
   // In component:
   if (userPermissions.role !== 'Manager') {
       return <div>Access Denied</div>;
   }
   ```

2. **Whitelist Queries**
   ```typescript
   // Only allow SELECT queries
   const isSelectOnly = query.trim().toUpperCase().startsWith('SELECT');
   if (!isSelectOnly) {
       showNotification("Only SELECT queries allowed", "error");
       return;
   }
   ```

3. **Row Level Security**
   - Enable RLS di Supabase
   - Create policies untuk each table
   - Users hanya bisa query data yang mereka authorized untuk

4. **Query Limits**
   ```typescript
   // Limit query timeout dan result size
   const timeoutMs = 30000; // 30 seconds
   const maxRows = 10000;
   ```

5. **Audit Logging**
   ```typescript
   // Log setiap query execution
   const { error } = await supabase
       .from('query_audit_log')
       .insert({
           user_id: userId,
           query: query,
           executed_at: new Date(),
           result_count: results.length
       });
   ```

---

## Advanced Features (Optional)

### 1. Add Query Templates
```typescript
const queryTemplates = [
    {
        name: 'Recent Service Jobs',
        query: `SELECT * FROM bengkel_service_jobs 
                WHERE created_at > now() - interval '7 days'
                ORDER BY created_at DESC`
    },
    {
        name: 'Inventory Low Stock',
        query: `SELECT * FROM bengkel_spareparts_master 
                WHERE qty_available < reorder_point
                AND is_active = true`
    },
    // ... more templates
];
```

### 2. Add Query Suggestions (Autocomplete)
```typescript
const suggestions = [
    'SELECT * FROM bengkel_service_jobs',
    'SELECT * FROM bengkel_spareparts_master WHERE is_active = true',
    // ... more
];
```

### 3. Add Chart Visualization
```typescript
import { Chart as ChartJS, CategoryScale, LinearScale } from 'chart.js';
// Visualize query results as charts
```

### 4. Add Schema Browser
```typescript
// Show database schema (tables, columns, data types)
const showSchema = async () => {
    const { data } = await supabase.rpc('get_schema_info');
    // Display schema in sidebar
};
```

---

## Error Handling

Contoh error handling yang sudah implemented:

```typescript
try {
    const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: query
    });

    if (error) {
        setResults({
            columns: [],
            rows: [],
            error: error.message,
            executionTime: endTime - startTime
        });
    } else {
        // Display results
    }
} catch (err: any) {
    setResults({
        columns: [],
        rows: [],
        error: err.message || 'Unknown error',
        executionTime: 0
    });
}
```

---

## Testing SQL Editor

### Test Cases:

1. **Basic SELECT**
   ```sql
   SELECT * FROM bengkel_service_jobs LIMIT 5;
   ```

2. **With Filter**
   ```sql
   SELECT * FROM bengkel_service_jobs 
   WHERE status_pekerjaan = 'Selesai' 
   LIMIT 10;
   ```

3. **Aggregation**
   ```sql
   SELECT 
       status_pekerjaan,
       COUNT(*) as job_count,
       AVG(harga_jasa) as avg_labor
   FROM bengkel_service_jobs
   GROUP BY status_pekerjaan;
   ```

4. **Join Query**
   ```sql
   SELECT 
       j.police_number,
       j.customer_name,
       u.supplier_name,
       COUNT(sp.id) as part_count
   FROM bengkel_service_jobs j
   LEFT JOIN bengkel_service_jobs_spareparts sp ON j.id = sp.job_id
   LEFT JOIN bengkel_suppliers u ON sp.supplier_id = u.id
   GROUP BY j.id, u.id;
   ```

5. **Save & Load**
   - Save above queries
   - Reload page
   - Load saved queries
   - Verify they still exist

---

## Troubleshooting

### Query Execution Failed
- Check table names spelling (case-sensitive)
- Verify Supabase RLS policies allow access
- Check database connection

### Results Not Displaying
- Verify query returned data
- Check column names in results
- Clear browser cache

### Save Query Not Working
- Check localStorage is enabled
- Browser storage limit (usually 5-10MB)
- Try exporting as CSV instead

---

## References

- [Supabase SQL Documentation](https://supabase.com/docs/guides/database)
- [PostgreSQL Query Reference](https://www.postgresql.org/docs/current/queries.html)
- [SqlEditorView Component](./components/settings/SqlEditorView.tsx)

---

**File Location:** `components/settings/SqlEditorView.tsx`
**Integration Status:** ✅ Component Ready (Needs Sidebar Integration)
**Last Updated:** January 31, 2026
