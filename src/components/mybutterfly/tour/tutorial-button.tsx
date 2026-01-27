"use client";

import { useTutorial } from "@/components/mybutterfly/tour/tutorial-provider";
import { Button } from "@/components/ui/button";

export function TutorialButton() {
  const { startTour, isRunning } = useTutorial();
  return (
    <Button type="button" variant="outline" onClick={startTour} data-tour="help-tutorial-button" disabled={isRunning}>
      Help / Tutorial
    </Button>
  );
}
