import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  type QueryDocumentSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { touchMetaConfig } from "@/lib/firestore/meta";
import type { Questionnaire, QuestionnaireQuestion, QuestionnaireQuestionOption, WithId } from "@/lib/firestore/types";

export type VocabularyKey = string;
export type VocabularyCategory = {
  key: string;
  title: string;
  description?: string;
  standardQuestion?: string;
  active: boolean;
  order: number;
};

const VOCABULARY_QUESTIONNAIRE_ID = "vocabulary";
const VOCABULARY_KEYS_COLLECTION = "vocabulary_keys";

const defaultVocabularyCategories: Array<Omit<VocabularyCategory, "active"> & { active?: boolean }> = [
  {
    key: "level",
    title: "Nivel",
    description: "Începător / intermediar / avansat (extensibil).",
    order: 0,
    active: true,
  },
  { key: "style", title: "Stil", description: "Ofensiv / all-round / defensiv (extensibil).", order: 1, active: true },
  {
    key: "distance",
    title: "Distanță",
    description: "Aproape / mediu / departe (extensibil).",
    order: 2,
    active: true,
  },
  {
    key: "priority",
    title: "Prioritate",
    description: "Control / spin / viteză (extensibil).",
    order: 3,
    active: true,
  },
  {
    key: "preferences",
    title: "Preferințe",
    description: "Preferințe pentru ordonarea recomandărilor (control/spin/viteză/greutate).",
    order: 4,
    active: true,
  },
];

const defaultVocabularyOptions: Record<VocabularyKey, QuestionnaireQuestionOption[]> = {
  level: [
    { value: "beginner", label: "Începător", order: 0, active: true },
    { value: "intermediate", label: "Intermediar", order: 1, active: true },
    { value: "advanced", label: "Avansat", order: 2, active: true },
  ],
  style: [
    { value: "offensive", label: "Ofensiv", order: 0, active: true },
    { value: "all_round", label: "All-round", order: 1, active: true },
    { value: "defensive", label: "Defensiv", order: 2, active: true },
  ],
  distance: [
    { value: "close", label: "Aproape", order: 0, active: true },
    { value: "mid", label: "Mediu", order: 1, active: true },
    { value: "far", label: "Departe", order: 2, active: true },
  ],
  priority: [
    { value: "control", label: "Control", order: 0, active: true },
    { value: "spin", label: "Spin", order: 1, active: true },
    { value: "speed", label: "Viteză", order: 2, active: true },
  ],
  preferences: [
    { value: "control", label: "Control", order: 0, active: true },
    { value: "spin", label: "Spin", order: 1, active: true },
    { value: "speed", label: "Viteză", order: 2, active: true },
    { value: "weight", label: "Greutate", order: 3, active: true },
  ],
};

const suggestedOptionsByKeyword: Array<{
  keywords: string[];
  options: QuestionnaireQuestionOption[];
}> = [
  {
    keywords: ["tip jucator", "tipul jucatorului", "player type", "stil joc"],
    options: [
      { value: "offensive", label: "Ofensiv", order: 0, active: true },
      { value: "all_round", label: "All-round", order: 1, active: true },
      { value: "defensive", label: "Defensiv", order: 2, active: true },
    ],
  },
  {
    keywords: ["frecventa", "cat de des", "des joci"],
    options: [
      { value: "rare", label: "Foarte rar", order: 0, active: true },
      { value: "monthly", label: "1-3 ori pe luna", order: 1, active: true },
      { value: "weekly", label: "Saptamanal", order: 2, active: true },
      { value: "daily", label: "Aproape zilnic", order: 3, active: true },
    ],
  },
  {
    keywords: ["varsta", "categorie amator", "amator", "nivel amator"],
    options: [
      { value: "beginner", label: "Incepator", order: 0, active: true },
      { value: "intermediate", label: "Intermediar", order: 1, active: true },
      { value: "advanced", label: "Avansat", order: 2, active: true },
    ],
  },
  {
    keywords: ["tipul paletei", "paleta", "racheta"],
    options: [
      { value: "allround", label: "All-round", order: 0, active: true },
      { value: "offensive", label: "Ofensiva", order: 1, active: true },
      { value: "defensive", label: "Defensiva", order: 2, active: true },
    ],
  },
  {
    keywords: ["compozitia lemnului", "lemn", "carbon", "blade composition"],
    options: [
      { value: "all_wood", label: "Lemn", order: 0, active: true },
      { value: "inner_carbon", label: "Inner carbon", order: 1, active: true },
      { value: "outer_carbon", label: "Outer carbon", order: 2, active: true },
    ],
  },
  {
    keywords: ["ce cauti", "ce imbunatatesti", "prioritate", "focus"],
    options: [
      { value: "control", label: "Control", order: 0, active: true },
      { value: "spin", label: "Spin", order: 1, active: true },
      { value: "speed", label: "Viteza", order: 2, active: true },
      { value: "consistency", label: "Constanta", order: 3, active: true },
    ],
  },
  {
    keywords: ["partea puternica", "mana", "dominant"],
    options: [
      { value: "forehand", label: "Forehand", order: 0, active: true },
      { value: "backhand", label: "Backhand", order: 1, active: true },
      { value: "balanced", label: "Echilibrat", order: 2, active: true },
    ],
  },
  {
    keywords: ["lovitura preferata", "lovitura", "stroke"],
    options: [
      { value: "topspin", label: "Topspin", order: 0, active: true },
      { value: "drive", label: "Drive", order: 1, active: true },
      { value: "block", label: "Block", order: 2, active: true },
      { value: "smash", label: "Smash", order: 3, active: true },
    ],
  },
];

const sanitizeValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeForMatch = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const vocabularyKeysCollection = (db: NonNullable<ReturnType<typeof initFirebase>["db"]>) =>
  collection(db, VOCABULARY_KEYS_COLLECTION);

// Used by admin UI to generate stable technical IDs from a human label.
export function normalizeVocabularyValue(input: string) {
  return sanitizeValue(input);
}

function genShortId() {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID().replace(/-/g, "").slice(0, 6);
  }
  return Math.random().toString(36).slice(2, 8);
}

export async function getVocabularyQuestionnaire(): Promise<WithId<Questionnaire> | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Questionnaire) };
}

export async function listVocabularyKeys(params?: {
  includeInactive?: boolean;
}): Promise<WithId<VocabularyCategory>[]> {
  const { db } = initFirebase();
  if (!db) return [];
  const includeInactive = params?.includeInactive ?? true;
  const base = query(vocabularyKeysCollection(db), orderBy("order", "asc"));
  const q = includeInactive ? base : query(base, where("active", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as VocabularyCategory),
  }));
}

export async function createVocabularyKey(params: {
  key: string;
  title: string;
  description?: string;
  standardQuestion?: string;
  order?: number;
  active?: boolean;
  options?: QuestionnaireQuestionOption[];
}) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const normalizedKey = sanitizeValue(params.key || params.title);
  if (!normalizedKey) throw new Error("Cheie invalidă.");
  const keyRef = doc(db, VOCABULARY_KEYS_COLLECTION, normalizedKey);
  const existing = await getDoc(keyRef);
  if (existing.exists()) throw new Error("Cheia există deja.");

  const trimmedDescription = params.description?.trim();
  const trimmedStandardQuestion = params.standardQuestion?.trim();

  const payload: VocabularyCategory = {
    key: normalizedKey,
    title: params.title.trim(),
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    ...(trimmedStandardQuestion ? { standardQuestion: trimmedStandardQuestion } : {}),
    order: params.order ?? 0,
    active: params.active ?? true,
  };
  await setDoc(keyRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const questionRef = doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID, "questions", normalizedKey);
  const questionSnap = await getDoc(questionRef);
  if (!questionSnap.exists()) {
    const questionPayload: Omit<QuestionnaireQuestion, "createdAt" | "updatedAt"> = {
      active: true,
      order: payload.order,
      type: "multi_select",
      key: normalizedKey as VocabularyKey,
      label: params.title.trim(),
      options: params.options ?? [],
      validation: { required: false },
    };
    await setDoc(questionRef, {
      ...questionPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await touchMetaConfig();
  return payload;
}

export async function updateVocabularyKey(
  key: string,
  patch: Partial<Pick<VocabularyCategory, "title" | "description" | "standardQuestion" | "order" | "active">>,
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, VOCABULARY_KEYS_COLLECTION, key);
  const payload: Record<string, unknown> = {
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    ...(patch.standardQuestion !== undefined ? { standardQuestion: patch.standardQuestion.trim() || undefined } : {}),
    ...(patch.order !== undefined ? { order: patch.order } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(ref, payload);

  if (patch.title !== undefined) {
    const questionRef = doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID, "questions", key);
    await updateDoc(questionRef, { label: patch.title.trim(), updatedAt: serverTimestamp() });
  }
  await touchMetaConfig();
}

export async function deleteVocabularyKey(key: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  await deleteDoc(doc(db, VOCABULARY_KEYS_COLLECTION, key));
  await deleteDoc(doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID, "questions", key));
  await touchMetaConfig();
}

export async function ensureVocabularyInitialized() {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  const questionnaireRef = doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID);
  const existing = await getDoc(questionnaireRef);
  if (!existing.exists()) {
    // Create a dedicated, inactive questionnaire to store the vocabulary. This keeps schema unchanged.
    await setDoc(questionnaireRef, {
      active: false,
      title: "Vocabulary (admin)",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<Questionnaire, "createdAt" | "updatedAt"> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    });
  }

  // Ensure the dynamic categories exist (back-compat for older installs that only had the questionnaire).
  const keySnapshot = await getDocs(query(vocabularyKeysCollection(db), limit(1)));
  if (keySnapshot.empty) {
    for (const category of defaultVocabularyCategories) {
      const key = category.key;
      await createVocabularyKey({
        key,
        title: category.title,
        description: category.description,
        order: category.order,
        active: category.active ?? true,
        options: defaultVocabularyOptions[key] ?? [],
      });
    }
  }
}

export async function seedDefaultVocabulary() {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  // Ensure base docs exist.
  await ensureVocabularyInitialized();

  let createdCategories = 0;
  let addedOptions = 0;

  for (const category of defaultVocabularyCategories) {
    const key = category.key;
    const keyRef = doc(db, VOCABULARY_KEYS_COLLECTION, key);
    const keySnap = await getDoc(keyRef);
    if (!keySnap.exists()) {
      await createVocabularyKey({
        key,
        title: category.title,
        description: category.description,
        order: category.order,
        active: category.active ?? true,
        options: defaultVocabularyOptions[key] ?? [],
      });
      createdCategories += 1;
      // createVocabularyKey already seeds options if it created the question doc
      continue;
    }

    // Ensure the question exists and contains at least the default options (non-destructive merge).
    const questionRef = doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID, "questions", key);
    const questionSnap = await getDoc(questionRef);
    if (!questionSnap.exists()) {
      const payload: Omit<QuestionnaireQuestion, "createdAt" | "updatedAt"> = {
        active: true,
        order: category.order,
        type: "multi_select",
        key,
        label: category.title,
        options: defaultVocabularyOptions[key] ?? [],
        validation: { required: false },
      };
      await setDoc(questionRef, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      addedOptions += (defaultVocabularyOptions[key] ?? []).length;
      continue;
    }

    const current = (questionSnap.data() as QuestionnaireQuestion).options ?? [];
    const existingValues = new Set(current.map((o) => o.value));
    const toAdd = (defaultVocabularyOptions[key] ?? []).filter((o) => !existingValues.has(o.value));
    if (toAdd.length) {
      await updateDoc(questionRef, {
        options: [...current, ...toAdd],
        updatedAt: serverTimestamp(),
      });
      addedOptions += toAdd.length;
    }
  }

  await touchMetaConfig();
  return { createdCategories, addedOptions };
}

function getSuggestedOptionsForCategory(category: WithId<VocabularyCategory>): QuestionnaireQuestionOption[] {
  const byKey = defaultVocabularyOptions[category.key];
  if (byKey?.length) {
    return byKey.map((option) => ({ ...option }));
  }

  const haystack = normalizeForMatch(`${category.key} ${category.title} ${category.description ?? ""}`);
  const matched = suggestedOptionsByKeyword.find((entry) =>
    entry.keywords.some((keyword) => haystack.includes(normalizeForMatch(keyword))),
  );
  if (matched?.options?.length) {
    return matched.options.map((option) => ({ ...option }));
  }

  // Safe fallback for unknown custom categories.
  return [
    { value: "optiune_1", label: "Optiunea 1", order: 0, active: true },
    { value: "optiune_2", label: "Optiunea 2", order: 1, active: true },
    { value: "optiune_3", label: "Optiunea 3", order: 2, active: true },
  ];
}

export async function seedSuggestedVocabularyForEmptyCategories() {
  const categories = await listVocabularyKeys({ includeInactive: true });
  let patchedCategories = 0;
  let addedOptions = 0;

  for (const category of categories) {
    const { ref, data } = await getVocabularyQuestionDoc(category.key);
    const current = data.options ?? [];
    if (current.length > 0) continue;

    const suggested = getSuggestedOptionsForCategory(category);
    if (!suggested.length) continue;

    await updateDoc(ref, {
      options: suggested,
      updatedAt: serverTimestamp(),
    });
    patchedCategories += 1;
    addedOptions += suggested.length;
  }

  await touchMetaConfig();
  return { patchedCategories, addedOptions };
}

async function getVocabularyQuestionDoc(key: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID, "questions", key);
  let snap = await getDoc(ref);
  if (!snap.exists()) {
    // Back-compat/self-heal: some installs have vocabulary_keys docs but missing question docs.
    const categorySnap = await getDoc(doc(db, VOCABULARY_KEYS_COLLECTION, key));
    if (!categorySnap.exists()) {
      throw new Error("Vocabulary not initialized.");
    }
    const category = categorySnap.data() as Partial<VocabularyCategory>;
    const payload: Omit<QuestionnaireQuestion, "createdAt" | "updatedAt"> = {
      active: true,
      order: category.order ?? 0,
      type: "multi_select",
      key,
      label: (category.title ?? key).toString(),
      options: [],
      validation: { required: false },
    };
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error("Vocabulary not initialized.");
    }
  }
  return { ref, data: snap.data() as QuestionnaireQuestion };
}

export async function listVocabularyOptions(key: string, params?: { includeInactive?: boolean }) {
  const { data } = await getVocabularyQuestionDoc(key);
  const includeInactive = params?.includeInactive ?? true;
  const options = (data.options ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return includeInactive ? options : options.filter((o) => o.active);
}

export async function addVocabularyOption(
  key: string,
  option: { value: string; label: string; order?: number; active?: boolean },
) {
  const { ref, data } = await getVocabularyQuestionDoc(key);
  const current = data.options ?? [];
  const normalizedValue = sanitizeValue(option.value);
  if (!normalizedValue) throw new Error("Valoare invalidă.");
  if (current.some((o) => o.value === normalizedValue)) throw new Error("Valoarea există deja.");

  const next: QuestionnaireQuestionOption = {
    value: normalizedValue,
    label: option.label.trim() || normalizedValue,
    order: option.order ?? current.length,
    active: option.active ?? true,
  };

  await updateDoc(ref, {
    options: [...current, next],
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
  return next;
}

export async function addVocabularyOptionFromLabel(
  key: string,
  option: { label: string; order?: number; active?: boolean },
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  const ref = doc(db, "questionnaires", VOCABULARY_QUESTIONNAIRE_ID, "questions", key);
  let created: QuestionnaireQuestionOption | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Vocabulary not initialized.");
    const data = snap.data() as QuestionnaireQuestion;
    const current = data.options ?? [];

    const base = sanitizeValue(option.label);
    if (!base) throw new Error("Label invalid (nu se poate genera un value).");

    const existing = new Set(current.map((o) => o.value));
    let value = `${base}-${genShortId()}`;
    let attempts = 0;
    while (existing.has(value)) {
      value = `${base}-${genShortId()}`;
      attempts += 1;
      if (attempts > 10) throw new Error("Nu s-a putut genera un value unic.");
    }

    const next: QuestionnaireQuestionOption = {
      value,
      label: option.label.trim() || value,
      order: option.order ?? current.length,
      active: option.active ?? true,
    };

    tx.update(ref, {
      options: [...current, next],
      updatedAt: serverTimestamp(),
    });
    created = next;
  });

  await touchMetaConfig();
  if (!created) throw new Error("Adăugarea a eșuat.");
  return created;
}

export async function updateVocabularyOption(
  key: string,
  value: string,
  patch: Partial<Pick<QuestionnaireQuestionOption, "label" | "order" | "active">>,
) {
  const { ref, data } = await getVocabularyQuestionDoc(key);
  const current = data.options ?? [];
  const idx = current.findIndex((o) => o.value === value);
  if (idx < 0) throw new Error("Valoare inexistentă.");

  const updated: QuestionnaireQuestionOption = {
    ...current[idx],
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.order !== undefined ? { order: patch.order } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
  };

  const nextOptions = current.slice();
  nextOptions[idx] = updated;

  await updateDoc(ref, {
    options: nextOptions,
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
  return updated;
}

export async function deleteVocabularyOption(key: string, value: string) {
  const { ref, data } = await getVocabularyQuestionDoc(key);
  const current = data.options ?? [];
  const next = current.filter((o) => o.value !== value);
  if (next.length === current.length) throw new Error("Valoare inexistentă.");
  await updateDoc(ref, {
    options: next,
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
}

const replaceInArray = (values: string[] | undefined, fromValue: string, toValue: string) => {
  if (!values?.length) return values;
  let changed = false;
  const next = values.map((v) => {
    if (v === fromValue) {
      changed = true;
      return toValue;
    }
    return v;
  });
  return changed ? Array.from(new Set(next)) : values;
};

const productTagKeys = new Set(["level", "style", "distance"]);

async function migrateRenameAcrossProducts(params: { key: string; fromValue: string; toValue: string }) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  if (!productTagKeys.has(params.key)) return;

  const field = `tags.${params.key}`;
  let cursor: QueryDocumentSnapshot | undefined;

  while (true) {
    const base = query(
      collection(db, "products"),
      where(field, "array-contains", params.fromValue),
      orderBy("updatedAt", "desc"),
      limit(200),
    );
    const q = cursor ? query(base, startAfter(cursor)) : base;
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { tags?: Record<string, string[]> };
      const current = (data.tags?.[params.key] ?? []) as string[];
      const next = replaceInArray(current, params.fromValue, params.toValue);
      if (next !== current) {
        batch.update(docSnap.ref, {
          [field]: next,
          updatedAt: serverTimestamp(),
        });
      }
    });
    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
  }
}

async function migrateRenameAcrossProductScenarios(params: { key: string; fromValue: string; toValue: string }) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    const base = query(collection(db, "products"), orderBy("updatedAt", "desc"), limit(200));
    const q = cursor ? query(base, startAfter(cursor)) : base;
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as {
        recommendationScenarios?: Array<{
          conditions?: Record<string, string[]>;
        }>;
      };
      const scenarios = data.recommendationScenarios ?? [];
      if (!scenarios.length) return;

      let changed = false;
      const nextScenarios = scenarios.map((scenario) => {
        const conditions = scenario.conditions ?? {};
        const current = (conditions[params.key] ?? []) as string[];
        const next = replaceInArray(current, params.fromValue, params.toValue);
        if (next !== current) {
          changed = true;
          return {
            ...scenario,
            conditions: {
              ...conditions,
              [params.key]: next,
            },
          };
        }
        return scenario;
      });

      if (changed) {
        batch.update(docSnap.ref, {
          recommendationScenarios: nextScenarios,
          updatedAt: serverTimestamp(),
        });
      }
    });
    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
  }
}

async function migrateRenameAcrossQuestionOptions(params: { key: string; fromValue: string; toValue: string }) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    const base = query(
      collectionGroup(db, "questions"),
      where("key", "==", params.key),
      orderBy("updatedAt", "desc"),
      limit(200),
    );
    const q = cursor ? query(base, startAfter(cursor)) : base;
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      const pathParts = docSnap.ref.path.split("/");
      // path: questionnaires/{qid}/questions/{qid2}
      const questionnaireId = pathParts[1];
      if (questionnaireId === VOCABULARY_QUESTIONNAIRE_ID) return;

      const data = docSnap.data() as QuestionnaireQuestion;
      if (data.type !== "single_select" && data.type !== "multi_select") return;
      if (!data.options?.length) return;

      let changed = false;
      const nextOptions = data.options.map((opt) => {
        if (opt.value === params.fromValue) {
          changed = true;
          return { ...opt, value: params.toValue };
        }
        return opt;
      });

      if (changed) {
        batch.update(docSnap.ref, {
          options: nextOptions,
          updatedAt: serverTimestamp(),
        });
      }
    });
    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
  }
}

export async function renameVocabularyValue(key: string, fromValue: string, toValue: string) {
  const normalizedFrom = sanitizeValue(fromValue);
  const normalizedTo = sanitizeValue(toValue);
  if (!normalizedFrom || !normalizedTo) throw new Error("Valoare invalidă.");
  if (normalizedFrom === normalizedTo) return;

  const { ref, data } = await getVocabularyQuestionDoc(key);
  const current = data.options ?? [];
  if (!current.some((o) => o.value === normalizedFrom)) throw new Error("Valoarea veche nu există.");
  if (current.some((o) => o.value === normalizedTo)) throw new Error("Valoarea nouă există deja.");

  const updatedOptions = current.map((o) => (o.value === normalizedFrom ? { ...o, value: normalizedTo } : o));
  await updateDoc(ref, { options: updatedOptions, updatedAt: serverTimestamp() });

  await Promise.all([
    migrateRenameAcrossProducts({ key, fromValue: normalizedFrom, toValue: normalizedTo }),
    migrateRenameAcrossProductScenarios({ key, fromValue: normalizedFrom, toValue: normalizedTo }),
    migrateRenameAcrossQuestionOptions({ key, fromValue: normalizedFrom, toValue: normalizedTo }),
  ]);

  await touchMetaConfig();
}
