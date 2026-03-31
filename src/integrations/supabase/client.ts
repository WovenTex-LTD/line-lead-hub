// Supabase client — do not edit directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { authStorageAdapter } from '@/lib/auth-storage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: authStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
  }
});