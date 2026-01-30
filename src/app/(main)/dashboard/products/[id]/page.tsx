"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { Search } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { PrestashopProductPicker } from "@/components/mybutterfly/products/prestashop-product-picker";
import { ProductForm } from "@/components/mybutterfly/products/product-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getProduct, updateProduct } from "@/lib/firestore/products";
import type { Product, WithId } from "@/lib/firestore/types";

type PrestashopDetails = {
  id: string;
  name: string;
  price: number;
  currency: "EUR" | "RON";
  active: boolean;
  prestashopFull?: Record<string, unknown>;
  imageUrls?: string[];
  imageUrl?: string;
  imageId?: number;
  productUrl?: string;
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const [product, setProduct] = useState<WithId<Product> | null>(null);
  const [prefillValues, setPrefillValues] = useState<{
    name?: string;
    price?: number;
    currency?: "EUR" | "RON";
    active?: boolean;
    imageUrls?: string[];
    imageUrl?: string;
    productUrl?: string;
  }>();
  const [prestashopMeta, setPrestashopMeta] = useState<{
    productId: number;
    imageId?: number;
    imageUrl?: string;
    productUrl?: string;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [prestashopFull, setPrestashopFull] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const load = async () => {
      const data = await getProduct(productId);
      setProduct(data);
    };
    load();
  }, [productId]);

  const isPrestashopProduct = product?.source?.provider === "prestashop" || productId.startsWith("ps_");

  const handleSelectPrestashop = async (item: { id: string; name: string; price: number; reference?: string }) => {
    setIsLoadingDetails(true);
    try {
      setPrefillValues({
        name: item.name,
        price: item.price,
        currency: "RON",
      });
      setPrestashopMeta({
        productId: Number(item.id),
      });

      const response = await fetch(`/api/prestashop/products/${item.id}`);
      const data = (await response.json()) as PrestashopDetails;
      console.log("[prestashop] details response", data);
      const resolvedImageUrls =
        data.imageUrls && data.imageUrls.length > 0 ? data.imageUrls : data.imageUrl ? [data.imageUrl] : [];
      console.log("[prestashop] resolved images", resolvedImageUrls);
      setPrestashopFull(data.prestashopFull ?? null);
      setPrefillValues((prev) => {
        const next = { ...(prev ?? {}) } as {
          name?: string;
          price?: number;
          currency?: "EUR" | "RON";
          active?: boolean;
          imageUrls?: string[];
          imageUrl?: string;
          productUrl?: string;
        };
        const resolvedName = data.name?.trim() ? data.name : item.name;
        if (resolvedName.trim()) next.name = resolvedName;
        const resolvedPrice = data.price && data.price > 0 ? data.price : item.price;
        if (resolvedPrice !== undefined) next.price = resolvedPrice;
        next.currency = "RON";
        if (data.active !== undefined) next.active = data.active;
        if (resolvedImageUrls.length) {
          next.imageUrls = resolvedImageUrls;
          next.imageUrl = resolvedImageUrls[0];
        }
        if (data.productUrl) next.productUrl = data.productUrl;
        return next;
      });
      setPrestashopMeta({
        productId: Number(data.id ?? item.id),
        imageId: data.imageId,
        imageUrl: data.imageUrl ?? resolvedImageUrls[0],
        productUrl: data.productUrl,
      });
      if (data.productUrl) {
        updateProduct(productId, { productUrl: data.productUrl }).catch(() => {
          // ignore save errors for link updates
        });
      }
    } finally {
      setIsLoadingDetails(false);
    }
  };

  if (!product) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Editează produsul</h1>
          <p className="text-muted-foreground text-sm">Actualizează detaliile produsului și etichetele.</p>
        </div>
        <PageHelpDialog helpKey="products.edit" />
      </div>
      {isPrestashopProduct ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">Sursă: PrestaShop</div>
              <div className="text-muted-foreground text-xs">
                ID PrestaShop: {prestashopMeta?.productId ?? product.source?.prestashopProductId ?? "—"}
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => setIsPickerOpen(true)}>
              Reimportează
            </Button>
          </div>
          {isLoadingDetails ? (
            <div className="text-muted-foreground text-xs">Se încarcă detaliile produsului...</div>
          ) : null}
        </div>
      ) : null}
      <ProductForm
        initialValues={product}
        prefillValues={prefillValues}
        imageSource={isPrestashopProduct ? "prestashop" : "manual"}
        onSubmit={async (values) => {
          const prestashopValue = prestashopMeta?.imageId
            ? prestashopMeta
            : prestashopMeta
              ? { productId: prestashopMeta.productId }
              : product.prestashop;
          const next = {
            ...values,
            ...(isPrestashopProduct
              ? {
                  source: {
                    provider: "prestashop" as const,
                    prestashopProductId: String(prestashopMeta?.productId ?? product.source?.prestashopProductId ?? ""),
                  },
                  prestashop: prestashopValue,
                  imageUrl: prefillValues?.imageUrl ?? product.imageUrl,
                  productUrl: prefillValues?.productUrl ?? product.productUrl,
                  ...(prestashopFull ? { prestashopFull } : {}),
                }
              : {}),
          };
          await updateProduct(productId, next);
          router.push("/dashboard/products");
        }}
        onCancel={() => router.push("/dashboard/products")}
      />

      <Dialog
        open={isPickerOpen}
        onOpenChange={(open) => {
          setIsPickerOpen(open);
          if (!open) setSearchQuery("");
        }}
      >
        <DialogContent className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-4 p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>Reimportează din PrestaShop</DialogTitle>
            <DialogDescription>Selectează produsul pentru reîncărcarea datelor.</DialogDescription>
          </DialogHeader>
          <div className="relative shrink-0">
            <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută produs în PrestaShop"
              className="h-11 pl-9"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PrestashopProductPicker
              onSelect={(selected) => {
                void handleSelectPrestashop(selected);
                setIsPickerOpen(false);
              }}
              selectedId={prestashopMeta?.productId ? String(prestashopMeta.productId) : undefined}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              inline
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
