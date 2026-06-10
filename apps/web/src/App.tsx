import { useState } from "react";
import { Bell, BookOpenText, Database, LayoutDashboard, Search, ShieldCheck } from "lucide-react";
import { PRODUCT_MODULES, type ModuleId } from "@fonteia/domain";
import { DashboardPage } from "./app/page";
import { ModulesPage } from "./app/modules/page";
import { SearchPage } from "./app/search/page";
import { SourcesPage } from "./app/sources/page";

type RouteKey = "dashboard" | "modules" | "sources" | "search";

const routes: Array<{
  id: RouteKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "dashboard", label: "Cockpit", icon: LayoutDashboard },
  { id: "search", label: "Perguntar", icon: Search },
  { id: "sources", label: "Fontes", icon: Database },
  { id: "modules", label: "Modulos", icon: BookOpenText },
];

export function App() {
  const [route, setRoute] = useState<RouteKey>("dashboard");
  const activeModule = PRODUCT_MODULES.find((module) => module.id === "leiloes");

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <div className="brand-mark">f</div>
          <div>
            <strong>Fonte.ia</strong>
            <span>by Olli</span>
          </div>
        </div>

        <nav className="primary-nav">
          {routes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={route === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => setRoute(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-modules">
          <span className="section-label">Produtos</span>
          {PRODUCT_MODULES.map((module) => (
            <button
              className={module.status === "active" ? "module-nav active" : "module-nav locked"}
              key={module.id}
              type="button"
            >
              <span>{module.label}</span>
              <small>{module.status === "active" ? "ativo" : "travado"}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="section-label">Modulo atual</span>
            <h1>{activeModule?.label ?? "Fonte.ia"}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" type="button">
              <Bell aria-hidden="true" size={17} />
              Alertas
            </button>
            <button className="primary-button" type="button">
              <ShieldCheck aria-hidden="true" size={17} />
              Criar dossie
            </button>
          </div>
        </header>

        {route === "dashboard" ? <DashboardPage /> : null}
        {route === "search" ? <SearchPage /> : null}
        {route === "sources" ? <SourcesPage /> : null}
        {route === "modules" ? <ModulesPage selectedModuleId={"leiloes" satisfies ModuleId} /> : null}
      </main>
    </div>
  );
}
