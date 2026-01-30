import { type NextRequest, NextResponse } from "next/server";

import { buildPrestashopPublicImageUrl } from "@/lib/prestashop/images";

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

const normalizeName = (value: unknown) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const firstObject = value.find((entry) => entry && typeof entry === "object") as { value?: string } | undefined;
    if (firstObject?.value) return firstObject.value;
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

const normalizeSlug = (value: unknown) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const firstObject = value.find((entry) => entry && typeof entry === "object") as { value?: string } | undefined;
    if (firstObject?.value) return firstObject.value;
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

const extractImageIdsFromPayload = (payload: unknown, productId?: string) => {
  const ids: number[] = [];
  const collect = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        collect(entry);
      });
      return;
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const directId = toImageId(obj.id ?? obj.value ?? obj.image_id);
      if (directId) ids.push(directId);
      if (obj.images || obj.image) {
        collect(obj.images ?? obj.image);
      } else {
        Object.values(obj).forEach((entry) => {
          if (Array.isArray(entry)) collect(entry);
        });
      }
    }
  };

  collect(payload);
  const numericProductId = productId ? Number(productId) : undefined;
  const filtered = ids.filter((id) => id > 0 && (numericProductId ? id !== numericProductId : true));
  return [...new Set(filtered)];
};

const extractImageIds = (product: Record<string, unknown>) => {
  const associations = product.associations as Record<string, unknown> | undefined;
  let images: unknown =
    (associations ? (associations.images ?? (associations as Record<string, unknown>).image) : undefined) ??
    product.images;

  if (typeof images === "object" && images) {
    const nested = (images as Record<string, unknown>).image;
    if (nested !== undefined) images = nested;
  }

  return extractImageIdsFromPayload(images);
};

const fetchImageIds = async (baseUrl: string, apiKey: string, productId: string) => {
  const url = new URL(`${baseUrl}/api/images/products/${productId}`);
  url.searchParams.set("output_format", "JSON");
  url.searchParams.set("io_format", "JSON");
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: buildAuthHeader(apiKey),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    console.warn("[prestashop] images endpoint failed", {
      productId,
      status: response.status,
      statusText: response.statusText,
      body: text.slice(0, 500),
    });
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  const ids = extractImageIdsFromPayload(parsed, productId);
  return ids;
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { baseUrl, apiKey } = getEnv();
    const { id } = await context.params;
    const url = new URL(`${baseUrl}/api/products/${id}`);
    url.searchParams.set("output_format", "JSON");
    url.searchParams.set("io_format", "JSON");
    url.searchParams.set("display", "full");

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
      product?: Record<string, unknown>;
      products?: Array<Record<string, unknown>>;
    };

    const product = data.product ?? data.products?.[0] ?? {};
    if (!data.product) {
      console.warn("[prestashop] empty product payload", { id, data });
    }
    const idDefaultImage = toImageId(product.id_default_image);
    let imageIds = extractImageIds(product);
    if (imageIds.length === 0) {
      imageIds = await fetchImageIds(baseUrl, apiKey, id);
    }
    if (idDefaultImage && !imageIds.includes(idDefaultImage)) imageIds.unshift(idDefaultImage);
    const imageUrls = imageIds.map((imageId) => buildPrestashopPublicImageUrl(imageId));
    const imageUrl = imageUrls[0];
    const slug = normalizeSlug((product as Record<string, unknown>).link_rewrite);
    const productUrl = id
      ? slug
        ? `${baseUrl}/${id}-${slug}.html`
        : `${baseUrl}/index.php?id_product=${id}&controller=product`
      : undefined;
    const currency = process.env.PRESTASHOP_CURRENCY === "RON" ? "RON" : "EUR";

    return NextResponse.json({
      id: String(product.id ?? id),
      name: normalizeName(product.name),
      price: toNumber(product.price),
      currency,
      active: String(product.active ?? "0") === "1",
      imageUrl,
      imageId: idDefaultImage || undefined,
      imageUrls,
      productUrl,
      stock: product.stock ?? undefined,
      prestashopFull: product,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error ?? "Unknown error") }, { status: 500 });
  }
}
