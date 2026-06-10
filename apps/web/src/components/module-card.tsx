import { Lock, Sparkles } from "lucide-react";
import type { ProductModule } from "@fonteia/domain";

interface ModuleCardProps {
  module: ProductModule;
  selected?: boolean;
}

export function ModuleCard({ module, selected = false }: ModuleCardProps) {
  const isActive = module.status === "active";

  return (
    <article className={selected ? "module-card selected" : "module-card"}>
      <div className="module-card-head">
        <div className={isActive ? "module-icon active" : "module-icon"}>
          {isActive ? <Sparkles aria-hidden="true" size={18} /> : <Lock aria-hidden="true" size={17} />}
        </div>
        <span className={isActive ? "status-chip active" : "status-chip locked"}>
          {isActive ? "liberado" : "travado"}
        </span>
      </div>
      <h3>{module.label}</h3>
      <p>{module.promise}</p>
      <small>{module.targetPersona}</small>
    </article>
  );
}
