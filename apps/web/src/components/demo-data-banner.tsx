interface DemoDataBannerProps {
  title?: string;
  message?: string;
  details?: string[];
}

export function DemoDataBanner({
  title = "Modo demonstracao",
  message = "Estes dados sao amostras e nao devem ser usados para decisao real.",
  details = [],
}: DemoDataBannerProps) {
  return (
    <div className="demo-data-banner" role="status">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {details.length > 0 ? (
        <ul>
          {details.slice(0, 3).map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
