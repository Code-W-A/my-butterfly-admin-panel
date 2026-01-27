"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { PrestashopProductPicker } from "@/components/mybutterfly/products/prestashop-product-picker";
import { ProductForm } from "@/components/mybutterfly/products/product-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getProduct, updateProduct } from "@/lib/firestore/products";
import type { Product, WithId } from "@/lib/firestore/types";

type PrestashopDetails = {
  id: string;
  name: string;
  price: number;
  currency: "EUR" | "RON";
  active: boolean;
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

  useEffect(() => {
    const load = async () => {
      const data = await getProduct(productId);
      setProduct(data);
    };
    load();
  }, [productId]);

  const isPrestashopProduct = product?.source?.provider === "prestashop" || productId.startsWith("ps_");

  const handleSelectPrestashop = async (item: {
    id: string;
    name: string;
    price: number;
    active: boolean;
    imageUrl?: string;
    imageId?: number;
    productUrl?: string;
  }) => {
    setIsLoadingDetails(true);
    try {
      setPrefillValues({
        name: item.name,
        price: item.price,
        currency: "RON",
        active: item.active,
        ...(item.imageUrl ? { imageUrls: [item.imageUrl], imageUrl: item.imageUrl } : {}),
        ...(item.productUrl ? { productUrl: item.productUrl } : {}),
      });
      setPrestashopMeta({
        productId: Number(item.id),
        imageId: item.imageId,
        imageUrl: item.imageUrl,
        productUrl: item.productUrl,
      });

      const response = await fetch(`/api/prestashop/products/${item.id}`);
      const data = (await response.json()) as PrestashopDetails;
      setPrefillValues({
        name: data.name ?? item.name,
        price: data.price ?? item.price,
        currency: "RON",
        active: data.active ?? item.active,
        ...(data.imageUrl
          ? { imageUrls: [data.imageUrl], imageUrl: data.imageUrl }
          : item.imageUrl
            ? { imageUrls: [item.imageUrl], imageUrl: item.imageUrl }
            : {}),
        ...(data.productUrl ? { productUrl: data.productUrl } : item.productUrl ? { productUrl: item.productUrl } : {}),
      });
      setPrestashopMeta({
        productId: Number(data.id ?? item.id),
        imageId: data.imageId ?? item.imageId,
        imageUrl: data.imageUrl ?? item.imageUrl,
        productUrl: data.productUrl ?? item.productUrl,
      });
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
          const next = {
            ...values,
            ...(isPrestashopProduct
              ? {
                  source: {
                    provider: "prestashop" as const,
                    prestashopProductId: String(prestashopMeta?.productId ?? product.source?.prestashopProductId ?? ""),
                  },
                  prestashop: prestashopMeta ?? product.prestashop,
                  imageUrl: prefillValues?.imageUrl ?? product.imageUrl,
                  productUrl: prefillValues?.productUrl ?? product.productUrl,
                }
              : {}),
          };
          await updateProduct(productId, next);
          router.push("/dashboard/products");
        }}
        onCancel={() => router.push("/dashboard/products")}
      />

      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="h-[90vh] w-[90vw] max-w-[90vw] p-6">
          <DialogHeader>
            <DialogTitle>Reimportează din PrestaShop</DialogTitle>
            <DialogDescription>Selectează produsul pentru reîncărcarea datelor.</DialogDescription>
          </DialogHeader>
          <PrestashopProductPicker
            onSelect={(selected) => {
              void handleSelectPrestashop(selected);
              setIsPickerOpen(false);
            }}
            selectedId={prestashopMeta?.productId ? String(prestashopMeta.productId) : undefined}
            placeholder="Caută produs în PrestaShop"
            inline
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
