import type { Product, Questionnaire, WithId } from "@/lib/firestore/types";

const productCache = new Map<string, WithId<Product>>();
const questionnaireCache = new Map<string, WithId<Questionnaire>>();

export const cache = {
  products: {
    get: (id: string) => productCache.get(id),
    set: (item: WithId<Product>) => productCache.set(item.id, item),
    setMany: (items: WithId<Product>[]) => {
      items.forEach((item) => {
        productCache.set(item.id, item);
      });
    },
    clear: () => productCache.clear(),
  },
  questionnaires: {
    get: (id: string) => questionnaireCache.get(id),
    set: (item: WithId<Questionnaire>) => questionnaireCache.set(item.id, item),
    setMany: (items: WithId<Questionnaire>[]) => {
      items.forEach((item) => {
        questionnaireCache.set(item.id, item);
      });
    },
    clear: () => questionnaireCache.clear(),
  },
};
