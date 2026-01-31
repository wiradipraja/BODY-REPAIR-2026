import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Helper Functions untuk operasi database
 */

// Helper untuk menambah nilai (increment)
export const incrementField = async (
  supabase: SupabaseClient,
  table: string,
  id: string,
  field: string,
  amount: number
) => {
  try {
    const { data: current, error: fetchError } = await supabase
      .from(table)
      .select(field)
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const newValue = (current[field] || 0) + amount;
    
    const { error: updateError } = await supabase
      .from(table)
      .update({ [field]: newValue, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;
    return newValue;
  } catch (error) {
    console.error(`Error incrementing ${field} in ${table}:`, error);
    throw error;
  }
};

// Helper untuk real-time listener dengan callback
export const subscribeToChanges = (
  supabase: SupabaseClient,
  table: string,
  onInsert?: (payload: any) => void,
  onUpdate?: (payload: any) => void,
  onDelete?: (payload: any) => void
) => {
  const channel = supabase
    .channel(`${table}:changes`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: table,
      },
      onInsert || (() => {})
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: table,
      },
      onUpdate || (() => {})
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: table,
      },
      onDelete || (() => {})
    )
    .subscribe();

  return channel;
};

// Helper untuk batch operations
export const batchInsert = async (
  supabase: SupabaseClient,
  table: string,
  records: any[]
) => {
  try {
    const { data, error } = await supabase
      .from(table)
      .insert(records)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error batch inserting into ${table}:`, error);
    throw error;
  }
};

// Helper untuk batch update
export const batchUpdate = async (
  supabase: SupabaseClient,
  table: string,
  updates: { id: string; data: any }[]
) => {
  try {
    const results = await Promise.all(
      updates.map(({ id, data }) =>
        supabase
          .from(table)
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', id)
      )
    );

    return results;
  } catch (error) {
    console.error(`Error batch updating ${table}:`, error);
    throw error;
  }
};

// Helper untuk query dengan filter
export const queryWithFilters = async (
  supabase: SupabaseClient,
  table: string,
  filters?: Record<string, any>,
  orderBy?: { column: string; ascending: boolean },
  limit?: number
) => {
  try {
    let query = supabase.from(table).select('*');

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // For IN queries
          query = query.in(key, value);
        } else if (value !== null && value !== undefined) {
          query = query.eq(key, value);
        }
      });
    }

    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending });
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error querying ${table}:`, error);
    throw error;
  }
};

// Helper untuk soft delete
export const softDelete = async (
  supabase: SupabaseClient,
  table: string,
  id: string
) => {
  try {
    const { error } = await supabase
      .from(table)
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error(`Error soft deleting from ${table}:`, error);
    throw error;
  }
};

// Helper untuk hard delete
export const hardDelete = async (
  supabase: SupabaseClient,
  table: string,
  id: string
) => {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error(`Error hard deleting from ${table}:`, error);
    throw error;
  }
};

// Helper untuk server timestamp compatibility
export const getCurrentTimestamp = () => {
  return new Date().toISOString();
};

// Helper untuk convert Firebase Timestamp to standard date
export const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};
