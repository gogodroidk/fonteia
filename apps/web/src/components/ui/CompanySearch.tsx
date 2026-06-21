/**
 * CompanySearch.tsx — Busca de empresa por NOME (com fallback de CNPJ)
 *
 * Componente reutilizável do design system. Resolve a dor #1 do produto: o cliente
 * tem o NOME da empresa na cabeça, não o CNPJ. Aqui ele digita o nome, vê uma lista
 * de empresas reais (colapsadas por raiz de CNPJ), escolhe — e o pai recebe o CNPJ
 * de 14 dígitos para abrir Raio-X / Dossiê / Consultas.
 *
 * Também aceita CNPJ direto: se o que foi digitado já tem 14 dígitos válidos, o
 * botão "Buscar" usa esse CNPJ na hora (sem precisar de lista).
 *
 * Design system: só classes/tokens (var(--*)); mobile-first 375px; dark/light.
 * Acessibilidade: combobox ARIA com navegação por teclado (↑/↓/Enter/Esc),
 * `aria-activedescendant`, `role="listbox"`/`option`, foco visível herdado do
 * :focus-visible global. Reduced-motion safe (sem animação própria bloqueante).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Building2, Loader2, Search, X } from "lucide-react";

import {
  searchCompaniesByName,
  sanitizeCnpj,
  type CompanyHit,
} from "../../features/empresas/company-search";
import { isValidCnpj } from "../../lib/cnpj";

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CompanySearchProps {
  /**
   * Chamado quando o usuário escolhe uma empresa (clique/Enter na lista) OU
   * confirma um CNPJ válido digitado direto. Recebe o CNPJ de 14 dígitos
   * (sanitizado) e, quando veio da lista, a razão social escolhida.
   */
  onSelect: (cnpj: string, name?: string) => void;
  /** Placeholder do campo. @default "Busque pelo nome da empresa ou CNPJ" */
  placeholder?: string | undefined;
  /** Rótulo acessível e visível acima do campo. */
  label?: string | undefined;
  /** Texto do botão de ação. @default "Buscar" */
  buttonLabel?: string | undefined;
  /** Valor inicial do campo (ex.: pré-preenchido por ?cnpj= na URL). */
  initialValue?: string | undefined;
  /** Desabilita a interação (ex.: enquanto o pai carrega o resultado). */
  disabled?: boolean | undefined;
  /** Foca o campo ao montar. @default false */
  autoFocus?: boolean | undefined;
  /** id do elemento (para `aria-describedby` externo, etc.). */
  id?: string | undefined;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Debounce da busca por nome — equilíbrio entre responsivo e econômico. */
const DEBOUNCE_MS = 280;
/** A partir de quantos caracteres a busca por nome dispara. */
const MIN_NAME_LEN = 2;

// ─── Componente ──────────────────────────────────────────────────────────────

export function CompanySearch({
  onSelect,
  placeholder = "Busque pelo nome da empresa ou CNPJ",
  label,
  buttonLabel = "Buscar",
  initialValue = "",
  disabled = false,
  autoFocus = false,
  id,
}: CompanySearchProps) {
  const [value, setValue] = useState(initialValue);
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Token para descartar respostas de buscas obsoletas (race protection).
  const reqToken = useRef(0);

  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const digits = sanitizeCnpj(value);
  const isCnpjReady = isValidCnpj(digits);

  // Foco inicial opcional.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Busca por nome (debounced). CNPJ puro não dispara lista — vai direto no submit.
  useEffect(() => {
    const term = value.trim();
    // Se já é um CNPJ (só dígitos/máscara), não buscamos por nome.
    const looksLikeCnpj = /^[\d.\-/\s]+$/.test(term) && term.replace(/\D/g, "").length >= 8;
    if (term.length < MIN_NAME_LEN || looksLikeCnpj) {
      setHits([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const token = ++reqToken.current;
    setLoading(true);
    const handle = window.setTimeout(() => {
      void searchCompaniesByName(term).then((results) => {
        // Descarta se outra busca começou depois desta.
        if (token !== reqToken.current) return;
        setHits(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
        setOpen(true);
        setLoading(false);
      });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [value]);

  // Fecha a lista ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const choose = useCallback(
    (hit: CompanyHit) => {
      setValue(hit.name);
      setOpen(false);
      setHits([]);
      onSelect(hit.cnpj, hit.name);
    },
    [onSelect],
  );

  function submit() {
    // 1) Há um item destacado na lista → escolhe ele.
    if (open && activeIndex >= 0 && activeIndex < hits.length) {
      choose(hits[activeIndex]!);
      return;
    }
    // 2) Digitou um CNPJ válido → usa direto.
    if (isCnpjReady) {
      setOpen(false);
      onSelect(digits);
      return;
    }
    // 3) Só um resultado de nome → escolhe ele por conveniência.
    if (hits.length === 1) {
      choose(hits[0]!);
      return;
    }
    // 4) Vários resultados → garante a lista aberta para o usuário escolher.
    if (hits.length > 1) setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && hits.length > 0) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => (hits.length === 0 ? -1 : (i + 1) % hits.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (hits.length === 0 ? -1 : (i - 1 + hits.length) % hits.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  function clear() {
    setValue("");
    setHits([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  const showList = open && hits.length > 0;

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      {label !== undefined && (
        <label
          htmlFor={`${id ?? autoId}-input`}
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--t-mid)",
            marginBottom: 8,
          }}
        >
          {label}
        </label>
      )}

      <div className="row wrap" style={{ gap: 10, alignItems: "stretch" }}>
        <div
          className="searchbar"
          style={{ flex: "1 1 240px", minWidth: 0 }}
          role="combobox"
          aria-expanded={showList}
          aria-haspopup="listbox"
          aria-owns={listboxId}
        >
          <Building2 size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          <input
            ref={inputRef}
            id={`${id ?? autoId}-input`}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (hits.length > 0) setOpen(true);
            }}
            placeholder={placeholder}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={disabled}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={
              showList && activeIndex >= 0 ? optionId(activeIndex) : undefined
            }
            style={{ minWidth: 0 }}
          />
          {loading && (
            <Loader2
              size={15}
              className="spin"
              style={{ color: "var(--t-low)", flexShrink: 0 }}
              aria-hidden="true"
            />
          )}
          {value !== "" && !loading && (
            <button
              type="button"
              className="btn btn--icon btn--ghost btn--sm"
              style={{ width: 40, height: 40, flexShrink: 0 }}
              onClick={clear}
              aria-label="Limpar busca"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={submit}
          disabled={disabled || (value.trim() === "")}
          style={{ flexShrink: 0 }}
        >
          {disabled ? (
            <Loader2 size={15} className="spin" aria-hidden="true" />
          ) : (
            <Search size={15} aria-hidden="true" />
          )}
          {buttonLabel}
        </button>
      </div>

      {/* Dica contextual sob o campo */}
      {value.trim() !== "" && !showList && !loading && (
        <p className="tiny muted" style={{ margin: "6px 2px 0" }}>
          {isCnpjReady
            ? "CNPJ válido — pode buscar direto."
            : digits.length > 0 && digits.length < 14
              ? `${digits.length}/14 dígitos do CNPJ — ou digite o nome da empresa.`
              : "Nenhuma empresa encontrada com esse nome. Tente outro termo ou cole o CNPJ."}
        </p>
      )}

      {/* Lista de resultados (combobox listbox) */}
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Empresas encontradas"
          style={{
            listStyle: "none",
            margin: "6px 0 0",
            padding: 6,
            position: "absolute",
            zIndex: 30,
            left: 0,
            right: 0,
            maxHeight: 340,
            overflowY: "auto",
            overscrollBehavior: "contain",
            background: "var(--elevated)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {hits.map((hit, i) => {
            const active = i === activeIndex;
            return (
              <li
                key={hit.cnpj}
                id={optionId(i)}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  // mousedown (não click) para escolher antes do blur fechar a lista.
                  e.preventDefault();
                  choose(hit);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: "var(--r-md)",
                  cursor: "pointer",
                  background: active ? "color-mix(in srgb,var(--brand) 12%,var(--surface))" : "transparent",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "var(--r-sm)",
                    background: "color-mix(in srgb,var(--brand) 10%,var(--surface))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Building2 size={15} style={{ color: "var(--brand-ink)" }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--t-hi)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {hit.name}
                  </div>
                  <div
                    className="tiny"
                    style={{
                      color: "var(--t-mid)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {hit.cnpjFormatado}
                    {hit.sublabel ? ` · ${hit.sublabel}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
