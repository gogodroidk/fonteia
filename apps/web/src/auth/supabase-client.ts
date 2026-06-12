import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(name: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

// Valores do projeto Supabase FONTE.IA. A chave publishable é pública por
// design (vai no bundle do front) — a proteção dos dados é feita por RLS no
// banco. Variáveis de ambiente, se definidas, têm prioridade.
const FALLBACK_URL = "https://pwiuiihsyazghdsrpshg.supabase.co";
const FALLBACK_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

const supabaseUrl = readEnv("VITE_SUPABASE_URL") || FALLBACK_URL;
const supabaseKey = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") || FALLBACK_KEY;

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
