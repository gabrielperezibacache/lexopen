import { getI18n } from "@/lib/i18n/server";
import { LoadingState } from "@/components/ui/LoadingState";

export default async function AppLoading() {
  const { t } = await getI18n();
  return <LoadingState label={t("common.loadingApp")} lines={4} />;
}
