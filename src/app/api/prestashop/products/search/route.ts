import { NextResponse } from "next/server";

import { buildPrestashopPublicImageUrl } from "@/lib/prestashop/images";

export const dynamic = "force-dynamic";

const getEnv = () => {
  const baseUrl = process.env.PRESTASHOP_BASE_URL;
  const apiKey = process.env.NEXT_PUBLIC_PREST_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Missing PrestaShop env vars (PRESTASHOP_BASE_URL / NEXT_PUBLIC_PREST_KEY).");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
};

const buildAuthHeader = (apiKey: string) => {
  const token = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${token}`;
};

type MultilangEntry = {
  id?: number | string;
  id_lang?: number | string;
  value?: string;
};

const normalizeName = (value: unknown, langId?: string) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (langId) {
      const match = value.find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const item = entry as MultilangEntry;
        return String(item.id ?? item.id_lang ?? "") === langId;
      }) as MultilangEntry | undefined;
      if (match?.value) return match.value;
    }
    const first = value.find((entry) => entry && typeof entry === "object") as MultilangEntry | undefined;
    if (first?.value) return first.value;
    const firstString = value.find((entry) => typeof entry === "string");
    return typeof firstString === "string" ? firstString : "";
  }
  if (typeof value === "object" && value) {
    const anyValue = value as Record<string, unknown>;
    const first = Object.values(anyValue)[0];
    if (typeof first === "string") return first;
  }
  return "";
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value) {
    const anyValue = value as Record<string, unknown>;
    const nested = anyValue.value ?? anyValue.price;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
    if (typeof nested === "string") {
      const cleaned = nested
        .replace(/\s/g, "")
        .replace(",", ".")
        .replace(/[^0-9.-]/g, "");
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
};

const toImageId = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value) {
    const anyValue = value as Record<string, unknown>;
    const nested = anyValue.id ?? anyValue.value ?? anyValue.id_default_image;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
    if (typeof nested === "string") {
      const parsed = Number(nested);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
};

const sanitizeQuery = (value: string) => value.replace(/[%[\]|,]/g, "");

export async function GET(request: Request) {
  try {
    const { baseUrl, apiKey } = getEnv();
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q") ?? "";
    const limitParam = searchParams.get("limit");
    const langId = searchParams.get("langId") ?? undefined;
    const sanitizedQuery = sanitizeQuery(rawQuery.trim());
    const limit = Math.min(50, Math.max(1, Number(limitParam ?? 20)));

    if (sanitizedQuery.length < 2) {
      return NextResponse.json({ items: [] });
    }

    const url = new URL(`${baseUrl}/api/products`);
    url.searchParams.set("output_format", "JSON");
    url.searchParams.set("display", "[id,name,reference,price,id_default_image]");
    url.searchParams.set("filter[name]", `%[${sanitizedQuery}]%`);
    url.searchParams.set("limit", `0,${limit}`);
    url.searchParams.set("sort", "[id_DESC]");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: buildAuthHeader(apiKey),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: "PrestaShop request failed", details: text }, { status: response.status });
    }

    const data = (await response.json()) as {
      products?: Array<Record<string, unknown>>;
    };

    const items = (data.products ?? []).map((product) => {
      const imageId = toImageId(product.id_default_image);
      return {
        id: String(product.id ?? ""),
        name: normalizeName(product.name, langId),
        reference: String(product.reference ?? ""),
        price: toNumber(product.price),
        imageUrl: imageId ? buildPrestashopPublicImageUrl(imageId) : undefined,
        imageId: imageId || undefined,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: String(error ?? "Unknown error") }, { status: 500 });
  }
}
