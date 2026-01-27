import type { ReactNode } from "react";

export type TutorialStep = {
  target: string;
  content: ReactNode;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  route?: string;
};

export const tutorialSteps: TutorialStep[] = [
  {
    target: '[data-tour="help-tutorial-button"]',
    content: "Acesta este butonul de pornire. Acum apasă Next ca să continui turul.",
    placement: "bottom",
  },
  {
    target: '[data-tour="questionnaires-create-button"]',
    content: "Scrie un chestionar nou: apasă „Creează chestionar”.",
    route: "/dashboard/questionnaires",
  },
  {
    target: '[data-tour="questionnaire-title-input"]',
    content: "Scrie titlul chestionarului (ex: „Recomandare palete”).",
    route: "/dashboard/questionnaires/new",
  },
  {
    target: '[data-tour="questionnaires-edit-button"]',
    content: "Apasă „Editează” pe chestionarul creat, ca să adaugi întrebările.",
    route: "/dashboard/questionnaires",
  },
  {
    target: '[data-tour="questionnaire-add-question"]',
    content: "Apasă „Adaugă întrebare” ca să completezi întrebările ghidate.",
  },
  {
    target: '[data-tour="question-editor-key"]',
    content: "Alege cheia: level/style/distance/priority/budget etc.",
  },
  {
    target: '[data-tour="question-editor-type"]',
    content: "Alege tipul (single_select pentru o singură opțiune).",
  },
  {
    target: '[data-tour="question-editor-options"]',
    content: "Pentru level/style/distance/priority, opțiunile vin din Vocabulary și sunt blocate aici.",
  },
  {
    target: '[data-tour="vocabulary-init-button"]',
    content: "Inițializează Vocabulary dacă nu este încă setat.",
    route: "/dashboard/vocabulary",
  },
  {
    target: '[data-tour="vocabulary-card-level"]',
    content: "Aici gestionezi valorile pentru „level”. Adaugă/editează/rename.",
    route: "/dashboard/vocabulary",
  },
  {
    target: '[data-tour="product-tags-level"]',
    content: "La produs, selectează nivelul recomandat din Vocabulary.",
    route: "/dashboard/products/new",
  },
  {
    target: '[data-tour="product-tags-style"]',
    content: "Selectează stilul potrivit pentru produs.",
    route: "/dashboard/products/new",
  },
  {
    target: '[data-tour="product-tags-distance"]',
    content: "Selectează distanța potrivită pentru produs.",
    route: "/dashboard/products/new",
  },
  {
    target: '[data-tour="product-scenarios"]',
    content: "În produs, adaugi scenarii de recomandare (condiții + buget + explicație).",
    route: "/dashboard/products/new",
  },
  {
    target: '[data-tour="test-input"]',
    content: "În Test recomandări, simulează un răspuns din chestionar.",
    route: "/dashboard/recommendations/test",
  },
  {
    target: '[data-tour="test-result"]',
    content: "Vezi regula potrivită și produsele recomandate.",
    route: "/dashboard/recommendations/test",
  },
];
