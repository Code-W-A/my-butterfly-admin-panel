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
  prestashopFull?: Record<string, unknown>;
  recommendationScenarios?: ProductRecommendationScenario[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ProductRecommendationScenario = {
  active: boolean;
  order: number;
  conditions: {
    budgetMin?: number;
    budgetMax?: number;
    [key: string]: string[] | number | undefined;
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

export type QuestionnaireCompletionUser = {
  uid?: string;
  isAnonymous: boolean;
  email?: string;
};

export type QuestionnaireCompletionContact = {
  name: string;
  email: string;
  phone?: string;
};

export type QuestionnaireCompletion = {
  createdAt: Timestamp;
  questionnaireId: string;
  questionnaireTitle: string;
  user: QuestionnaireCompletionUser;
  contact: QuestionnaireCompletionContact;
  answers: Record<string, unknown>;
  matchProductIds?: string[];
  specialistRequestId?: string;
};

export type QuestionnaireAnalyticsDaily = {
  day: Timestamp; // start-of-day UTC
  questionnaireId: string;
  starts: number;
  completes: number;
  answers?: {
    level?: Record<string, number>;
    style?: Record<string, number>;
    distance?: Record<string, number>;
    priority?: Record<string, number>;
    preferences?: Record<string, number>;
    budgetBuckets?: Record<string, number>;
  };
};

export type WithId<T> = T & { id: string };
