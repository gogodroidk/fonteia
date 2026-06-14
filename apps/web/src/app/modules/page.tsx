import { PRODUCT_MODULES, type ModuleId } from "@fonteia/domain";
import { ModuleCard } from "../../components/module-card";

interface ModulesPageProps {
  selectedModuleId?: ModuleId;
}

export function ModulesPage({ selectedModuleId = "leiloes" }: ModulesPageProps) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <span className="eyebrow">Mapa do produto</span>
        <h2 style={{ margin: "4px 0 0" }}>Um SaaS com vários SaaS dentro</h2>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {PRODUCT_MODULES.map((module) => (
          <ModuleCard key={module.id} module={module} selected={module.id === selectedModuleId} />
        ))}
      </div>
    </section>
  );
}
