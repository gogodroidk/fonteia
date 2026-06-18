import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// URL + chave PUBLISHABLE do Supabase: PÚBLICAS por design — precisam ir no bundle
// para o site conseguir falar com o backend. NÃO são segredo (o service_role e os
// tokens reais nunca aparecem aqui). Lemos a env var de build quando presente
// (acesso ESTÁTICO obrigatório: o Vite só substitui `import.meta.env.VITE_*` escrito
// literalmente) e caímos para o valor público do projeto — assim o site funciona
// mesmo quando a CI/Cloudflare Pages não tem as variáveis configuradas.
const FALLBACK_SUPABASE_URL = "https://pwiuiihsyazghdsrpshg.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

const envSupabaseUrl =
  typeof import.meta.env.VITE_SUPABASE_URL === "string" ? import.meta.env.VITE_SUPABASE_URL.trim() : "";
const envSupabaseKey =
  typeof import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
    ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : "";

const supabaseUrl: string = envSupabaseUrl.length > 0 ? envSupabaseUrl : FALLBACK_SUPABASE_URL;
const supabaseKey: string = envSupabaseKey.length > 0 ? envSupabaseKey : FALLBACK_SUPABASE_PUBLISHABLE_KEY;

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
