/**
 * RaioXSkeleton.tsx — skeleton loading da página de Raio-X 360° enquanto o
 * dossiê é buscado. Espelha a hierarquia real (header + faixa de flags +
 * seções) para não causar layout shift ao chegar o dado.
 */

export function RaioXSkeleton() {
  return (
    <div
      className="fade-in"
      aria-busy="true"
      aria-label="Carregando Raio-X da empresa"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="skeleton" style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton skeleton-text" style={{ width: "60%", height: 22 }} />
            <div className="skeleton skeleton-text" style={{ width: "35%" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: 84, height: 30, borderRadius: 10 }} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ flex: "1 1 240px", height: 72, borderRadius: 12 }} />
        ))}
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ height: 160 }} />
      ))}
    </div>
  );
}
