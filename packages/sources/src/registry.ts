import type { ModuleId, PublicSource, SourceStatus } from "@fonteia/domain";
import { SOURCE_CATALOG } from "./catalog";

export function listSources(): PublicSource[] {
  return [...SOURCE_CATALOG];
}

export function getSourceById(sourceId: string): PublicSource | undefined {
  return SOURCE_CATALOG.find((source) => source.id === sourceId);
}

export function listSourcesByModule(moduleId: ModuleId): PublicSource[] {
  return SOURCE_CATALOG.filter((source) => source.modules.includes(moduleId));
}

export function listSourcesByStatus(status: SourceStatus): PublicSource[] {
  return SOURCE_CATALOG.filter((source) => source.status === status);
}

export function assertSourceCatalogIsValid(sources: PublicSource[] = SOURCE_CATALOG): void {
  const ids = new Set<string>();

  for (const source of sources) {
    if (ids.has(source.id)) {
      throw new Error(`Duplicate source id: ${source.id}`);
    }

    ids.add(source.id);

    if (!source.name || !source.owner || !source.sourceUrl || source.modules.length === 0) {
      throw new Error(`Invalid source metadata: ${source.id}`);
    }
  }
}

