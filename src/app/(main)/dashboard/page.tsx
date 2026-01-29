"use client";

import { useEffect, useState } from "react";

import { KpiCardGrid } from "@/components/mybutterfly/dashboard/kpi-card-grid";
import { QuestionnaireAnalyticsCard } from "@/components/mybutterfly/dashboard/questionnaire-analytics-card";
import { RecentRequestsCard } from "@/components/mybutterfly/dashboard/recent-requests-card";
import { RequestsActivityCard } from "@/components/mybutterfly/dashboard/requests-activity-card";
import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { listProducts } from "@/lib/firestore/products";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import { listSpecialistRequests } from "@/lib/firestore/requests";

type DashboardCounts = {
  activeProducts: number;
  activeQuestionnaires: number;
  newRequests: number;
};

export default function Page() {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        setError(null);
        const [questionnaires, products, requests] = await Promise.all([
          listQuestionnaires(),
          listProducts(),
          listSpecialistRequests({ status: "new" }),
        ]);

        setCounts({
          activeProducts: products.filter((item) => item.active).length,
          activeQuestionnaires: questionnaires.filter((item) => item.active).length,
          newRequests: requests.length,
        });
      } catch (err) {
        logFirebaseError("Dashboard: loadCounts", err);
        setCounts(null);
        const info = getFirebaseErrorInfo(err);
        const hint =
          info.code === "permission-denied"
            ? "Permisiuni insuficiente în Firestore (Security Rules)."
            : info.code === "unauthenticated"
              ? "Nu ești autentificat."
              : "A apărut o eroare la încărcarea datelor din Firestore.";
        setError(`${hint} ${info.code ? `Cod: ${info.code}.` : ""}`);
      }
    };

    loadCounts();
  }, []);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {error ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <div className="font-semibold">Eroare</div>
          <div className="text-muted-foreground">{error}</div>
        </div>
      ) : null}
      <div className="flex items-center justify-end">
        <PageHelpDialog helpKey="dashboard" />
      </div>
      <KpiCardGrid>
        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Produse active</CardTitle>
          </CardHeader>
          <CardContent className="font-semibold text-3xl tabular-nums">
            {counts ? counts.activeProducts : "—"}
          </CardContent>
        </Card>
        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Chestionare active</CardTitle>
          </CardHeader>
          <CardContent className="font-semibold text-3xl tabular-nums">
            {counts ? counts.activeQuestionnaires : "—"}
          </CardContent>
        </Card>
        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Cereri noi către specialist</CardTitle>
          </CardHeader>
          <CardContent className="font-semibold text-3xl tabular-nums">{counts ? counts.newRequests : "—"}</CardContent>
        </Card>
      </KpiCardGrid>

      <QuestionnaireAnalyticsCard />
      <RequestsActivityCard />
      <RecentRequestsCard />
    </div>
  );
}
