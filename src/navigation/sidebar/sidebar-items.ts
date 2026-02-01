import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Settings,
  ShoppingBag,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "My Butterfly",
    items: [
      {
        title: "Panou",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Chestionare",
        url: "/dashboard/questionnaires",
        icon: ClipboardList,
      },
      {
        title: "Completări",
        url: "/dashboard/questionnaire-completions",
        icon: ClipboardCheck,
      },
      {
        title: "Produse",
        url: "/dashboard/products",
        icon: ShoppingBag,
      },
      {
        title: "Reguli recomandări",
        url: "/dashboard/recommendation-rules",
        icon: ListChecks,
      },
      {
        title: "Cereri",
        url: "/dashboard/requests",
        icon: MessageSquare,
      },
      {
        title: "Vocabulary",
        url: "/dashboard/vocabulary",
        icon: BookOpen,
      },
      {
        title: "Setări",
        url: "/dashboard/settings",
        icon: Settings,
      },
      {
        title: "Test recomandări",
        url: "/dashboard/recommendations/test",
        icon: FlaskConical,
      },
    ],
  },
];
