import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Package2,
  Settings,
  ShoppingBag,
  Users,
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
        title: "Pachete",
        url: "/dashboard/packages",
        icon: Package2,
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
        title: "Utilizatori",
        url: "/dashboard/users",
        icon: Users,
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
