import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(name: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

const supabaseUrl = readEnv("VITE_SUPABASE_URL");
const supabaseKey = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

/**
 * Só consideramos o Supabase configurado quando há URL e chave válidas.
 * Sem isso, `createClient` lançaria erro e derrubaria toda a aplicação
 * (tela branca). Quando não está configurado, o app cai em "modo
 * demonstração": login/cadastro funcionam localmente, sem backend.
 */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseKey.length > 0 && /^https?:\/\//.test(supabaseUrl);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;
