export const ENTITY_KINDS = [
  "person",
  "company",
  "politician",
  "municipality",
  "auction_lot",
  "bidding_opportunity",
  "legal_process",
  "trademark",
  "environmental_area",
  "public_contract",
  "document",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface BaseEntity {
  id: string;
  kind: EntityKind;
  name: string;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CompanyEntity extends BaseEntity {
  kind: "company";
  cnpj: string;
  legalName: string;
  tradeName?: string;
  cnaeCodes: string[];
}

export interface PersonEntity extends BaseEntity {
  kind: "person";
  documentHash?: string;
}

export interface PoliticianEntity extends BaseEntity {
  kind: "politician";
  party?: string;
  state?: string;
  office?: string;
}

export interface MunicipalityEntity extends BaseEntity {
  kind: "municipality";
  ibgeCode: string;
  state: string;
}

export interface AuctionLotEntity extends BaseEntity {
  kind: "auction_lot";
  editalId: string;
  lotNumber: string;
  city?: string;
  state?: string;
  minimumBidCents?: number;
  eligiblePersonTypes: Array<"pf" | "pj">;
}

export interface BiddingOpportunityEntity extends BaseEntity {
  kind: "bidding_opportunity";
  pncpId?: string;
  agencyName: string;
  openingDate?: string;
}

export interface LegalProcessEntity extends BaseEntity {
  kind: "legal_process";
  cnjNumber: string;
  court?: string;
  subject?: string;
}

export interface TrademarkEntity extends BaseEntity {
  kind: "trademark";
  processNumber?: string;
  niceClasses: string[];
  status?: string;
}

export interface EnvironmentalAreaEntity extends BaseEntity {
  kind: "environmental_area";
  geometryId?: string;
  areaType: "embargo" | "deforestation" | "fire" | "water_risk" | "conservation_unit" | "property";
}

export interface PublicContractEntity extends BaseEntity {
  kind: "public_contract";
  contractNumber?: string;
  agencyName: string;
  supplierCnpj?: string;
  valueCents?: number;
}

export interface DocumentEntity extends BaseEntity {
  kind: "document";
  url: string;
  mimeType?: string;
}

export type FonteiaEntity =
  | CompanyEntity
  | PersonEntity
  | PoliticianEntity
  | MunicipalityEntity
  | AuctionLotEntity
  | BiddingOpportunityEntity
  | LegalProcessEntity
  | TrademarkEntity
  | EnvironmentalAreaEntity
  | PublicContractEntity
  | DocumentEntity;

export interface EntityLink {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relation:
    | "owns"
    | "partner_of"
    | "won"
    | "paid_by"
    | "located_in"
    | "mentions"
    | "sanctioned_by"
    | "candidate_in"
    | "registered_by"
    | "similar_to";
  evidenceIds: string[];
  confidence: number;
}

