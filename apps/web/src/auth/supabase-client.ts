import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Acesso estático obrigatório: o Vite substitui `import.meta.env.VITE_*` apenas
// quando a chave é escrita literalmente no source — bracket-notation dinâmica
// (import.meta.env[name]) não é transformada e retorna undefined em produção.
const supabaseUrl: string =
  typeof import.meta.env.VITE_SUPABASE_URL === "string"
    ? import.meta.env.VITE_SUPABASE_URL.trim()
    : "";
const supabaseKey: string =
  typeof import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
    ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : "";

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
