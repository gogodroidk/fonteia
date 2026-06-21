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
 *
 * a11y: the container is a <ul> list so AT users hear "list, N items";
 * each dot is a <li> with aria-label set to the full source name.
 * The visible letter is aria-hidden so AT reads the full name instead.
 */
export function FonteDots({ fontes, size = 22 }: FonteDotsProps) {
  if (fontes.length === 0) return null;

  return (
    <ul
      style={{ display: "flex", listStyle: "none", margin: 0, padding: 0 }}
      aria-label={`Fontes: ${fontes.map((f) => f.nome).join(", ")}`}
    >
      {fontes.map((f, i) => (
        <li
          key={`${f.sigla}-${i}`}
          aria-label={f.nome}
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
          <span aria-hidden="true">{f.sigla[0] ?? "?"}</span>
        </li>
      ))}
    </ul>
  );
}
