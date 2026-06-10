import { PRODUCT_MODULES, type ModuleId } from "@fonteia/domain";
import { ModuleCard } from "../../components/module-card";

interface ModulesPageProps {
  selectedModuleId?: ModuleId;
}

export function ModulesPage({ selectedModuleId = "leiloes" }: ModulesPageProps) {
  return (
    <section className="page-panel">
      <div className="section-header">
        <div>
          <span className="section-label">Mapa do produto</span>
          <h2>Um SaaS com varios SaaS dentro</h2>
        </div>
      </div>
      <div className="module-grid full">
        {PRODUCT_MODULES.map((module) => (
          <ModuleCard key={module.id} module={module} selected={module.id === selectedModuleId} />
        ))}
      </div>
    </section>
  );
}
