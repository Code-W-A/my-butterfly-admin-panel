import type { Timestamp } from "firebase/firestore";

export type Questionnaire = {
  active: boolean;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type QuestionnaireQuestionOption = {
  value: string;
  label: string;
  order: number;
  active: boolean;
};

export type QuestionnaireQuestion = {
  active: boolean;
  order: number;
  type: "single_select" | "multi_select" | "text" | "range";
  key: string;
  label: string;
  helpText?: string;
  options?: QuestionnaireQuestionOption[];
  validation?: {
    required: boolean;
    min?: number;
    max?: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Product = {
  active: boolean;
  name: string;
  brand?: string;
  imageUrls?: string[];
  imageUrl?: string;
  productUrl?: string;
  price: number;
  currency: "EUR" | "RON";
  tags: {
    level: string[];
    style: string[];
    distance: string[];
  };
  attributes: { control?: number; spin?: number; speed?: number; weight?: number };
  source?: { provider: "prestashop"; prestashopProductId: string; lastSyncAt?: Timestamp };
  prestashop?: { productId: number; imageId?: number };
  recommendationScenarios?: ProductRecommendationScenario[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ProductRecommendationScenario = {
  active: boolean;
  order: number;
  conditions: {
    level?: string[];
    style?: string[];
    distance?: string[];
    priority?: string[];
    budgetMin?: number;
    budgetMax?: number;
  };
  explanationTemplate: string;
};

export type UserProfile = {
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
  platform?: "ios" | "android";
};

export type SpecialistRequestReply = {
  message: string;
  recommendedProductIds?: string[];
  sentAt?: Timestamp;
};

export type SpecialistRequestContact = {
  name?: string;
  phone?: string;
  email?: string;
};

export type SpecialistRequest = {
  createdAt: Timestamp;
  status: "new" | "in_progress" | "sent";
  questionnaireId: string;
  answers: Record<string, unknown>;
  note?: string;
  contact?: SpecialistRequestContact;
  matchProductIds?: string[];
  source?: "recommendation_test";
  reply?: SpecialistRequestReply;
};

export type WithId<T> = T & { id: string };
