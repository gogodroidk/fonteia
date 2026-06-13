/**
 * seo.ts — Fonte.ia SEO/GEO foundation
 *
 * Módulo sem dependências externas. Fornece:
 *   • Constantes de site
 *   • Builders de JSON-LD (schema.org) tipados
 *   • Hook useSeo() para injeção idempotente de metadados no <head>
 */

import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const SITE_URL = "https://fontebrasil.online" as const;
export const SITE_NAME = "Fonte.ia" as const;

// ---------------------------------------------------------------------------
// JSON-LD builders
// ---------------------------------------------------------------------------

/** Organization — identidade da empresa por trás do SaaS */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description:
      "Plataforma SaaS brasileira de inteligência de leilões da Receita Federal. Dados públicos transformados em decisões rastreáveis com IA.",
    foundingDate: "2024",
    areaServed: "BR",
    knowsAbout: [
      "Leilões da Receita Federal",
      "Licitações públicas",
      "Inteligência de dados públicos brasileiros",
    ],
  };
}

/** WebSite — habilita sitelinks search box e nome canônico no Google */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "Inteligência de leilões da Receita Federal para o público brasileiro. Encontre, analise e arremate com segurança.",
    inLanguage: "pt-BR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/buscar?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** SoftwareApplication / WebApplication — descreve o produto e os planos de preço */
export function softwareApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "WebApplication"],
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript",
    inLanguage: "pt-BR",
    description:
      "SaaS de inteligência de leilões da Receita Federal. Alertas automáticos, análise de risco por IA e calculadora de lance justo.",
    offers: {
      "@type": "Offer",
      name: "Plano Profissional",
      price: "197.00",
      priceCurrency: "BRL",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "197.00",
        priceCurrency: "BRL",
        referenceQuantity: {
          "@type": "QuantitativeValue",
          value: "1",
          unitCode: "MON",
        },
      },
      eligibleRegion: {
        "@type": "Country",
        name: "Brazil",
      },
      url: `${SITE_URL}/entrar`,
    },
  };
}

/** FAQPage — aceita array de perguntas/respostas para rich results */
export function faqJsonLd(
  items: ReadonlyArray<{ question: string; answer: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

/** Article — para guias e conteúdo editorial */
export function articleJsonLd(input: {
  title: string;
  description: string;
  url: string;
  datePublished?: string;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    url: input.url,
    inLanguage: "pt-BR",
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.svg`,
      },
    },
  };

  if (input.datePublished !== undefined) {
    base["datePublished"] = input.datePublished;
    base["dateModified"] = input.datePublished;
  }

  return base;
}

/** BreadcrumbList — trilha de navegação para rich results */
export function breadcrumbJsonLd(
  items: ReadonlyArray<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ---------------------------------------------------------------------------
// useSeo hook
// ---------------------------------------------------------------------------

export interface UseSeoInput {
  title: string;
  description: string;
  canonicalPath?: string;
  jsonLd?: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Hook que injeta metadados no <head> de forma idempotente.
 * Seguro para SSR (guarda tudo por `typeof document !== "undefined"`).
 *
 * O que faz em cada render com deps alteradas:
 *   • document.title
 *   • <meta name="description">
 *   • <link rel="canonical">
 *   • og:title, og:description, og:url
 *   • Remove scripts data-seo="1" antigos e injeta os novos JSON-LD
 */
export function useSeo(input: UseSeoInput): void {
  const { title, description, canonicalPath, jsonLd } = input;

  useEffect(() => {
    if (typeof document === "undefined") return;

    const head = document.head;

    // --- document.title ---
    document.title = title;

    // --- <meta name="description"> ---
    upsertMeta(head, "name", "description", description);

    // --- <link rel="canonical"> ---
    const canonicalHref =
      canonicalPath !== undefined ? `${SITE_URL}${canonicalPath}` : SITE_URL;
    upsertLink(head, "canonical", canonicalHref);

    // --- Open Graph ---
    upsertMeta(head, "property", "og:title", title);
    upsertMeta(head, "property", "og:description", description);
    upsertMeta(head, "property", "og:url", canonicalHref);
    upsertMeta(head, "property", "og:site_name", SITE_NAME);
    upsertMeta(head, "property", "og:type", "website");

    // --- JSON-LD: remove anteriores e injeta os novos ---
    head
      .querySelectorAll<HTMLScriptElement>('script[data-seo="1"]')
      .forEach((el) => el.remove());

    if (jsonLd !== undefined) {
      for (const block of jsonLd) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-seo", "1");
        script.textContent = JSON.stringify(block);
        head.appendChild(script);
      }
    }
  }, [title, description, canonicalPath, jsonLd]);
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function upsertMeta(
  head: HTMLHeadElement,
  attrKey: "name" | "property",
  attrValue: string,
  content: string,
): void {
  let el = head.querySelector<HTMLMetaElement>(
    `meta[${attrKey}="${attrValue}"]`,
  );
  if (el === null) {
    el = document.createElement("meta");
    el.setAttribute(attrKey, attrValue);
    head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(
  head: HTMLHeadElement,
  rel: string,
  href: string,
): void {
  let el = head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (el === null) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    head.appendChild(el);
  }
  el.setAttribute("href", href);
}
