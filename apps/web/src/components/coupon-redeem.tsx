import { useState, type FormEvent } from "react";
import { Check, Loader2, Ticket, X } from "lucide-react";
import { redeemCoupon, type RedeemResult } from "../features/billing/coupon-api";

function formatUntil(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Campo de cupom: o usuário digita um código e ativa um teste (ex.: 1 dia) sem cartão.
 * Mostra resultado honesto vindo do RPC `redeem_coupon`.
 */
export function CouponRedeem({
  onRedeemed,
  compact = false,
}: {
  onRedeemed?: ((until: string | null) => void) | undefined;
  compact?: boolean;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (loading || trimmed === "") return;
    setLoading(true);
    setResult(null);
    const r = await redeemCoupon(trimmed);
    setResult(r);
    setLoading(false);
    if (r.ok) {
      onRedeemed?.(r.grantedUntil ?? null);
      setCode("");
    }
  }

  return (
    <div className={compact ? undefined : "inset"} style={compact ? undefined : { padding: 16 }}>
      <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
        <Ticket size={16} aria-hidden="true" style={{ color: "var(--accent-ink)" }} />
        <strong style={{ fontSize: 13.5 }}>Tem um cupom?</strong>
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código (ex.: TESTE1)"
          aria-label="Código do cupom"
          autoCapitalize="characters"
          spellCheck={false}
          style={{
            flex: "1 1 160px",
            minWidth: 0,
            padding: "10px 12px",
            fontSize: 16,
            letterSpacing: ".04em",
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--surface)",
            color: "var(--t-hi)",
            fontFamily: "inherit",
          }}
        />
        <button
          className="btn btn--accent"
          type="submit"
          disabled={loading || code.trim() === ""}
          style={{ flexShrink: 0 }}
        >
          {loading ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          Ativar
        </button>
      </form>

      {result ? (
        <div
          role="status"
          className="row"
          style={{
            gap: 8,
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 10,
            alignItems: "flex-start",
            fontSize: 13,
            lineHeight: 1.45,
            background: result.ok
              ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
              : "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: `1px solid ${
              result.ok
                ? "color-mix(in srgb, var(--accent) 35%, transparent)"
                : "color-mix(in srgb, var(--danger) 30%, transparent)"
            }`,
            color: result.ok ? "var(--t-hi)" : "var(--danger)",
          }}
        >
          {result.ok ? (
            <Check size={15} aria-hidden="true" style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: 1 }} />
          ) : (
            <X size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          )}
          <span>
            {result.message}
            {result.ok && result.grantedUntil ? (
              <>
                {" "}
                Acesso de teste válido até <strong>{formatUntil(result.grantedUntil)}</strong>.
              </>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
