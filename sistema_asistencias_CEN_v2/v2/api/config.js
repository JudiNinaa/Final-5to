// Inicialización del cliente Supabase. Las claves vienen SOLO de variables de entorno (.env / Vercel).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});
