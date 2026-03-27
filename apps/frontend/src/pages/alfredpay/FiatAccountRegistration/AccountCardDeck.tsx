import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { AnimatePresence, motion, type Transition, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MaskedAccountNumber } from "../../../components/MaskedAccountNumber";
import { ALFRED_TO_ACCOUNT_TYPE } from "../../../constants/fiatAccountMethods";
import { useFiatAccountActor, useFiatAccountSelector } from "../../../contexts/FiatAccountMachineContext";
import { CardHeader } from "./CardHeader";
import { RemoveAccountControls } from "./RemoveAccountControls";

export const CARD_HEIGHT = 214;
const PEEK = 28;
const PEEK_EXPANDED = 54; // For mobile accessibility

function FrontCardContent({ account, onDelete }: { account: AlfredpayFiatAccount; onDelete: (id: string) => void }) {
  const { t } = useTranslation();
  const { fiatAccountFields, type, fiatAccountId } = account;
  const accountType = ALFRED_TO_ACCOUNT_TYPE[type];
  const label = fiatAccountFields.accountAlias || fiatAccountFields.accountBankCode;
  const last4 = fiatAccountFields.accountNumber.slice(-4);
  const sub = `${fiatAccountFields.accountBankCode} ••••${last4}`;

  return (
    <div
      className="flex h-full flex-col justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 shadow-md"
      style={{
        backgroundImage: "radial-gradient(circle,rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
        backgroundSize: "14px 14px"
      }}
    >
      <div>
        <CardHeader accountType={accountType} sub={sub} />
        <div className="flex w-full flex-col">
          <p className="mt-5 text-gray-500 text-xs">{t("components.fiatAccountMethods.accountDetails")}</p>
          <div className="flex w-full min-w-0 items-center justify-between">
            <p className="min-w-0 truncate text-gray-500">{label}</p>
            <MaskedAccountNumber accountNumber={fiatAccountFields.accountNumber} />
          </div>
          <span className="mt-4 text-gray-500 text-xs">{t("components.fiatAccountMethods.accountOwner")}</span>
          <span className="truncate text-gray-500">{fiatAccountFields.accountName}</span>
        </div>
      </div>
      <RemoveAccountControls onDelete={() => onDelete(fiatAccountId)} />
    </div>
  );
}

function BackCardContent({ account, index }: { account: AlfredpayFiatAccount; index: number }) {
  const { fiatAccountFields, type } = account;
  const accountType = ALFRED_TO_ACCOUNT_TYPE[type];
  const bg = index === 1 ? "bg-gray-50" : "bg-gray-100";
  const last4 = fiatAccountFields.accountNumber.slice(-4);
  const sub = `${fiatAccountFields.accountBankCode} ••••${last4}`;

  return (
    <div className={`flex h-full w-full items-start rounded-lg border border-gray-200 ${bg} shadow-sm`}>
      <div className="w-full px-4 pt-2 pb-2">
        <CardHeader accountType={accountType} compact sub={sub} />
      </div>
    </div>
  );
}

interface AccountCardDeckProps {
  accounts: AlfredpayFiatAccount[];
  onDelete: (fiatAccountId: string) => void;
}

export function AccountCardDeck({ accounts, onDelete }: AccountCardDeckProps) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const spring: Transition = shouldReduceMotion ? { duration: 0 } : { bounce: 0.25, duration: 0.45, type: "spring" };
  const canHover = useMemo(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches, []);

  const fiatAccountActor = useFiatAccountActor();
  const activeId = useFiatAccountSelector(s => s.context.selectedFiatAccountId);
  const setActiveId = (id: string) => fiatAccountActor.send({ id, type: "SELECT_ACCOUNT" });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);

  const effectiveActiveId = accounts.some(a => a.fiatAccountId === activeId) ? activeId : (accounts[0]?.fiatAccountId ?? null);

  const orderedAccounts = useMemo(() => {
    if (!effectiveActiveId) return accounts;
    return [
      ...accounts.filter(a => a.fiatAccountId === effectiveActiveId),
      ...accounts.filter(a => a.fiatAccountId !== effectiveActiveId)
    ];
  }, [accounts, effectiveActiveId]);

  const activePeek = !canHover && isExpanded ? PEEK_EXPANDED : PEEK;
  const containerHeight = CARD_HEIGHT + (orderedAccounts.length - 1) * activePeek;

  useEffect(() => {
    if (!isExpanded || canHover) return;
    const handler = (e: PointerEvent) => {
      if (!deckRef.current?.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [isExpanded, canHover]);

  const sharedCardStyle = (i: number) => ({
    height: CARD_HEIGHT,
    left: 0,
    position: "absolute" as const,
    right: 0,
    zIndex: orderedAccounts.length - i
  });

  return (
    <motion.div animate={{ height: containerHeight }} className="relative" ref={deckRef} transition={spring}>
      <AnimatePresence initial={false}>
        {orderedAccounts.map((account, i) =>
          i === 0 ? (
            <motion.div
              animate={{ scale: 1 - i * 0.045, top: (orderedAccounts.length - 1 - i) * activePeek }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
              initial={false}
              key={account.fiatAccountId}
              style={{ cursor: "default", ...sharedCardStyle(i) }}
              transition={spring}
            >
              <FrontCardContent account={account} onDelete={onDelete} />
            </motion.div>
          ) : (
            <motion.button
              animate={{ scale: 1 - i * 0.045, top: (orderedAccounts.length - 1 - i) * activePeek }}
              aria-label={t("components.fiatAccountMethods.switchToAccount", {
                accountType: ALFRED_TO_ACCOUNT_TYPE[account.type],
                last4: account.fiatAccountFields.accountNumber.slice(-4)
              })}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
              initial={false}
              key={account.fiatAccountId}
              onClick={
                canHover
                  ? () => setActiveId(account.fiatAccountId)
                  : !isExpanded
                    ? () => setIsExpanded(true)
                    : () => {
                        setActiveId(account.fiatAccountId);
                        setIsExpanded(false);
                      }
              }
              onHoverEnd={canHover ? () => setHoveredId(null) : undefined}
              onHoverStart={canHover ? () => setHoveredId(account.fiatAccountId) : undefined}
              style={{ cursor: "pointer", ...sharedCardStyle(i) }}
              transition={spring}
              type="button"
              whileHover={canHover ? { y: -10 } : undefined}
            >
              <BackCardContent account={account} index={i} />
              <AnimatePresence>
                {hoveredId === account.fiatAccountId && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1 }}
                    className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
                    exit={{ opacity: 0, scale: 0.95 }}
                    initial={{ opacity: 0, scale: 0.95 }}
                    key="tooltip"
                    style={{ height: PEEK }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                  >
                    <span className="whitespace-nowrap rounded-full bg-gray-800/70 px-2.5 py-1 text-white text-xs backdrop-blur-sm">
                      {t("components.fiatAccountMethods.clickToSelect")}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          )
        )}
      </AnimatePresence>
    </motion.div>
  );
}
