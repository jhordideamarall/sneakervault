import type { Role } from "@sneakervault/shared";
import { FeatureTourModal } from "@/components/dashboard/feature-tour-modal";
import { getFeatureTourState } from "@/lib/actions/feature-tour";
import {
  CLIENT_REVISION_TOUR_KEY,
  getVisibleFeatureTourSteps,
} from "@/lib/feature-tour";

export async function FeatureTourGate({ roles }: { roles: Role[] }) {
  const steps = getVisibleFeatureTourSteps(roles);
  if (steps.length === 0) return null;

  const { dismissed } = await getFeatureTourState(CLIENT_REVISION_TOUR_KEY);
  if (dismissed) return null;

  return (
    <FeatureTourModal
      tourKey={CLIENT_REVISION_TOUR_KEY}
      steps={steps}
    />
  );
}
