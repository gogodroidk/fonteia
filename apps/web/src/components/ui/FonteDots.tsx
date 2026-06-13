export interface FonteItem {
  sigla: string;
  cor: string;
  nome: string;
}

export interface FonteDotsProps {
  fontes: FonteItem[];
  size?: number | undefined;
}

/**
 * Stacked square avatars showing data source abbreviations.
 * Each dot shows the first letter of `sigla`, with `nome` as tooltip.
 */
export function FonteDots({ fontes, size = 22 }: FonteDotsProps) {
  return (
    <div style={{ display: "flex" }}>
      {fontes.map((f, i) => (
        <div
          key={`${f.sigla}-${i}`}
          title={f.nome}
          className="num"
          style={{
            width: size,
            height: size,
            borderRadius: 7,
            marginLeft: i > 0 ? -6 : 0,
            background: f.cor,
            color: "#fff",
            fontSize: size * 0.34,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--surface)",
            boxShadow: "var(--shadow-sm)",
            flexShrink: 0,
          }}
        >
          {f.sigla[0] ?? "?"}
        </div>
      ))}
    </div>
  );
}
