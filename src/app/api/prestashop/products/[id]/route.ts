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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { baseUrl, apiKey } = getEnv();
    const { id } = await context.params;
    const url = new URL(`${baseUrl}/api/products/${id}`);
    url.searchParams.set("output_format", "JSON");
    url.searchParams.set("display", "full");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: buildAuthHeader(apiKey),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: "PrestaShop request failed", details: text }, { status: response.status });
    }

    const data = (await response.json()) as {
      product?: Record<string, unknown>;
    };

    const product = data.product ?? {};
    const idDefaultImage = Number(product.id_default_image ?? 0);
    const imageUrl = idDefaultImage ? buildPrestashopPublicImageUrl(idDefaultImage) : undefined;
    const productUrl = id ? `${baseUrl}/index.php?id_product=${id}&controller=product` : undefined;
    const currency = process.env.PRESTASHOP_CURRENCY === "RON" ? "RON" : "EUR";

    return NextResponse.json({
      id: String(product.id ?? id),
      name: normalizeName(product.name),
      price: toNumber(product.price),
      currency,
      active: String(product.active ?? "0") === "1",
      imageUrl,
      imageId: idDefaultImage || undefined,
      productUrl,
      stock: product.stock ?? undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error ?? "Unknown error") }, { status: 500 });
  }
}
