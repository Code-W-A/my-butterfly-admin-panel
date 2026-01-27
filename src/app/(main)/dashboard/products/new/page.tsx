"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { PrestashopProductPicker } from "@/components/mybutterfly/products/prestashop-product-picker";
import { ProductForm } from "@/components/mybutterfly/products/product-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createProduct, getProduct, upsertProductById } from "@/lib/firestore/products";

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

export default function NewProductPage() {
  const router = useRouter();
  const [source, setSource] = useState<"manual" | "prestashop">("manual");
  const [selectedPrestashopId, setSelectedPrestashopId] = useState<string | null>(null);
  const [prefillValues, setPrefillValues] = useState<{
    name?: string;
    price?: number;
    currency?: "EUR" | "RON";
    active?: boolean;
    imageUrls?: string[];
    imageUrl?: string;
    productUrl?: string;
  }>();
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [alreadyImportedId, setAlreadyImportedId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [prestashopMeta, setPrestashopMeta] = useState<{
    productId: number;
    imageId?: number;
    imageUrl?: string;
    productUrl?: string;
  } | null>(null);

  const handleSelectPrestashop = async (product: {
    id: string;
    name: string;
    price: number;
    active: boolean;
    imageUrl?: string;
    imageId?: number;
    productUrl?: string;
  }) => {
    setSelectedPrestashopId(product.id);
    setAlreadyImportedId(null);
    setIsLoadingDetails(true);
    const docId = `ps_${product.id}`;
    try {
      setPrefillValues({
        name: product.name,
        price: product.price,
        currency: "RON",
        active: product.active,
        ...(product.imageUrl ? { imageUrls: [product.imageUrl], imageUrl: product.imageUrl } : {}),
        ...(product.productUrl ? { productUrl: product.productUrl } : {}),
      });
      setPrestashopMeta({
        productId: Number(product.id),
        imageId: product.imageId,
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
      });

      const response = await fetch(`/api/prestashop/products/${product.id}`);
      const data = (await response.json()) as PrestashopDetails;
      setPrefillValues({
        name: data.name ?? product.name,
        price: data.price ?? product.price,
        currency: "RON",
        active: data.active ?? product.active,
        ...(data.imageUrl
          ? { imageUrls: [data.imageUrl], imageUrl: data.imageUrl }
          : product.imageUrl
            ? { imageUrls: [product.imageUrl], imageUrl: product.imageUrl }
            : {}),
        ...(data.productUrl
          ? { productUrl: data.productUrl }
          : product.productUrl
            ? { productUrl: product.productUrl }
            : {}),
      });
      setPrestashopMeta({
        productId: Number(data.id ?? product.id),
        imageId: data.imageId ?? product.imageId,
        imageUrl: data.imageUrl ?? product.imageUrl,
        productUrl: data.productUrl ?? product.productUrl,
      });
      const existing = await getProduct(docId);
      setAlreadyImportedId(existing ? docId : null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Creează produs</h1>
          <p className="text-muted-foreground text-sm">Adaugă un produs nou pentru recomandări.</p>
        </div>
        <PageHelpDialog helpKey="products.new" />
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-medium text-sm">Sursă</div>
            <div className="text-muted-foreground text-xs">
              Alege dacă produsul este creat manual sau importat din PrestaShop.
            </div>
          </div>
          <RadioGroup
            value={source}
            onValueChange={(value) => setSource(value as "manual" | "prestashop")}
            className="flex gap-2"
          >
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <RadioGroupItem id="source-manual" value="manual" />
              <label htmlFor="source-manual">Manual</label>
            </div>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <RadioGroupItem id="source-prestashop" value="prestashop" />
              <label htmlFor="source-prestashop">PrestaShop</label>
            </div>
          </RadioGroup>
          {source === "prestashop" ? (
            <Button type="button" variant="outline" onClick={() => setIsPickerOpen(true)}>
              Caută produs
            </Button>
          ) : null}
        </div>
        {source === "prestashop" ? (
          <div className="text-muted-foreground text-xs">
            {selectedPrestashopId ? (
              <>
                Produs selectat: <span className="font-medium">{prefillValues?.name ?? selectedPrestashopId}</span>
              </>
            ) : (
              "Niciun produs selectat."
            )}
          </div>
        ) : null}
        {isLoadingDetails ? (
          <div className="text-muted-foreground text-xs">Se încarcă detaliile produsului...</div>
        ) : null}
        {alreadyImportedId ? (
          <div className="rounded-md border bg-muted p-2 text-xs">
            Produsul este deja importat.
            <Button
              type="button"
              variant="link"
              className="px-2 text-xs"
              onClick={() => router.push(`/dashboard/products/${alreadyImportedId}`)}
            >
              Deschide produsul
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="h-[90vh] w-[90vw] max-w-[90vw] p-6">
          <DialogHeader>
            <DialogTitle>Importă din PrestaShop</DialogTitle>
            <DialogDescription>Selectează produsul pe care vrei să îl imporți.</DialogDescription>
          </DialogHeader>
          <PrestashopProductPicker
            onSelect={(item) => {
              void handleSelectPrestashop(item);
              setIsPickerOpen(false);
            }}
            selectedId={selectedPrestashopId ?? undefined}
            placeholder="Caută produs în PrestaShop"
            inline
          />
        </DialogContent>
      </Dialog>

      <ProductForm
        prefillValues={source === "prestashop" ? prefillValues : undefined}
        imageSource={source === "prestashop" ? "prestashop" : "manual"}
        onSubmit={async (values) => {
          if (source === "prestashop" && selectedPrestashopId) {
            const docId = `ps_${selectedPrestashopId}`;
            await upsertProductById(docId, {
              ...values,
              source: {
                provider: "prestashop",
                prestashopProductId: selectedPrestashopId,
              },
              prestashop: prestashopMeta ?? { productId: Number(selectedPrestashopId) },
              imageUrl: prefillValues?.imageUrl,
              productUrl: prefillValues?.productUrl,
            });
            router.push(`/dashboard/products/${docId}`);
            return;
          }
          await createProduct(values);
          router.push("/dashboard/products");
        }}
        onCancel={() => router.push("/dashboard/products")}
      />
    </div>
  );
}
