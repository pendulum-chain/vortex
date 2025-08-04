import { FiatToken, FiatTokenDetails, Networks, OnChainToken, OnChainTokenDetails } from "@packages/shared";
import { useTranslation } from "react-i18next";
import { useRampModalActions, useRampModalState } from "../../stores/rampModalStore";
import { Dialog } from "../Dialog";
import { Skeleton } from "../Skeleton";
import { TokenSelectionList } from "./TokenSelectionList";

export interface TokenDefinition {
  assetSymbol: string;
  name?: string;
  assetIcon: string;
  type: OnChainToken | FiatToken;
  details: OnChainTokenDetails | FiatTokenDetails;
}

export interface ExtendedTokenDefinition extends TokenDefinition {
  network: Networks;
  networkDisplayName: string;
}

export function PoolSelectorModal() {
  const { t } = useTranslation();

  const { isOpen, isLoading } = useRampModalState();

  const { closeTokenSelectModal } = useRampModalActions();

  const content = isLoading ? <LoadingContent /> : <TokenSelectionList />;

  return (
    <Dialog
      content={content}
      headerText={t("components.dialogs.selectionModal.title")}
      onClose={closeTokenSelectModal}
      visible={isOpen}
    />
  );
}

function LoadingContent() {
  return <Skeleton className="mb-2 h-10 w-full" />;
}
