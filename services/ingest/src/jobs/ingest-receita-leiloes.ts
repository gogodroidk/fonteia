import { fetchReceitaLeiloesDestaques } from "@fonteia/sources";

export async function ingestReceitaLeiloesDestaques(): Promise<number> {
  const lots = await fetchReceitaLeiloesDestaques();

  // Persistence will be wired after the raw_records/evidence repository exists.
  return lots.length;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  ingestReceitaLeiloesDestaques()
    .then((count) => {
      console.log(`Fetched ${count} Receita leilao destaque lots`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
