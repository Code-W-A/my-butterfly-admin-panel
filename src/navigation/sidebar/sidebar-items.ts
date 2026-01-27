import {
  BookOpen,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
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
        title: "Produse",
        url: "/dashboard/products",
        icon: ShoppingBag,
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
        title: "Test recomandări",
        url: "/dashboard/recommendations/test",
        icon: FlaskConical,
      },
    ],
  },
];
