"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Search } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { PrestashopProductPicker } from "@/components/mybutterfly/products/prestashop-product-picker";
import { ProductForm } from "@/components/mybutterfly/products/product-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createProduct, getProduct, upsertProductById } from "@/lib/firestore/products";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [prestashopFull, setPrestashopFull] = useState<Record<string, unknown> | null>(null);
  const [prestashopMeta, setPrestashopMeta] = useState<{
    productId: number;
    imageId?: number;
    imageUrl?: string;
    productUrl?: string;
  } | null>(null);

  const handleSelectPrestashop = async (product: { id: string; name: string; price: number; reference?: string }) => {
    setSelectedPrestashopId(product.id);
    setAlreadyImportedId(null);
    setIsLoadingDetails(true);
    const docId = `ps_${product.id}`;
    try {
      setPrefillValues({
        name: product.name,
        price: product.price,
        currency: "RON",
      });
      setPrestashopMeta({
        productId: Number(product.id),
      });

      const response = await fetch(`/api/prestashop/products/${product.id}`);
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
        const resolvedName = data.name?.trim() ? data.name : product.name;
        if (resolvedName.trim()) next.name = resolvedName;
        const resolvedPrice = data.price && data.price > 0 ? data.price : product.price;
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
        productId: Number(data.id ?? product.id),
        imageId: data.imageId,
        imageUrl: data.imageUrl ?? resolvedImageUrls[0],
        productUrl: data.productUrl,
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

      <Dialog
        open={isPickerOpen}
        onOpenChange={(open) => {
          setIsPickerOpen(open);
          if (!open) setSearchQuery("");
        }}
      >
        <DialogContent className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-4 p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>Importă din PrestaShop</DialogTitle>
            <DialogDescription>Selectează produsul pe care vrei să îl imporți.</DialogDescription>
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
              onSelect={(item) => {
                void handleSelectPrestashop(item);
                setIsPickerOpen(false);
              }}
              selectedId={selectedPrestashopId ?? undefined}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              inline
            />
          </div>
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
              prestashop: prestashopMeta?.imageId
                ? prestashopMeta
                : prestashopMeta
                  ? { productId: prestashopMeta.productId }
                  : { productId: Number(selectedPrestashopId) },
              imageUrl: prefillValues?.imageUrl,
              productUrl: prefillValues?.productUrl,
              ...(prestashopFull ? { prestashopFull } : {}),
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
