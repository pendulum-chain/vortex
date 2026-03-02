import type { AlfredpayFiatAccount, AlfredpayFiatAccountType } from "@vortexfi/shared";
import { AnimatePresence, motion, type Transition, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { METHOD_TO_ALFRED_TYPE, type PaymentMethodKey } from "../../../constants/alfredPayMethods";
import { CardHeader } from "./CardHeader";
import { MaskedAccountNumber } from "./MaskedAccountNumber";
import { RemoveAccountControls } from "./RemoveAccountControls";

const ALFRED_TYPE_TO_METHOD = Object.entries(METHOD_TO_ALFRED_TYPE).reduce<
  Partial<Record<AlfredpayFiatAccountType, PaymentMethodKey>>
>((acc, [k, v]) => {
  if (v) acc[v] = k as PaymentMethodKey;
  return acc;
}, {});

export const CARD_HEIGHT = 214;
const PEEK = 28;
const PEEK_EXPANDED = 54; // For mobile accessibility

function FrontCardContent({ account, onDelete }: { account: AlfredpayFiatAccount; onDelete: (id: string) => void }) {
  const { fiatAccountFields, type, fiatAccountId } = account;
  const methodKey = ALFRED_TYPE_TO_METHOD[type];
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
        <CardHeader methodKey={methodKey} sub={sub} />
        <div className="flex w-full flex-col">
          <p className="mt-5 text-gray-500 text-xs">ACCOUNT DETAILS</p>
          <div className="flex w-full min-w-0 items-center justify-between">
            <p className="min-w-0 truncate text-gray-500">{label}</p>
            <MaskedAccountNumber accountNumber={fiatAccountFields.accountNumber} />
          </div>
          <span className="mt-4 text-gray-500 text-xs">ACCOUNT OWNER</span>
          <span className="truncate text-gray-500">{fiatAccountFields.accountName}</span>
        </div>
      </div>
      <RemoveAccountControls onDelete={() => onDelete(fiatAccountId)} />
    </div>
  );
}

function BackCardContent({ account, index }: { account: AlfredpayFiatAccount; index: number }) {
  const { fiatAccountFields, type } = account;
  const methodKey = ALFRED_TYPE_TO_METHOD[type];
  const bg = index === 1 ? "bg-gray-50" : "bg-gray-100";
  const last4 = fiatAccountFields.accountNumber.slice(-4);
  const sub = `${fiatAccountFields.accountBankCode} ••••${last4}`;

  return (
    <div className={`flex h-full w-full items-start rounded-lg border border-gray-200 ${bg} shadow-sm`}>
      <div className="w-full px-4 pt-2 pb-2">
        <CardHeader compact methodKey={methodKey} sub={sub} />
      </div>
    </div>
  );
}

interface AccountCardDeckProps {
  accounts: AlfredpayFiatAccount[];
  onDelete: (fiatAccountId: string) => void;
}

export function AccountCardDeck({ accounts, onDelete }: AccountCardDeckProps) {
  const shouldReduceMotion = useReducedMotion();
  const spring: Transition = shouldReduceMotion ? { duration: 0 } : { bounce: 0.25, duration: 0.45, type: "spring" };
  const canHover = useMemo(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches, []);

  const [activeId, setActiveId] = useState<string | null>(() => accounts[0]?.fiatAccountId ?? null);
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

  return (
    <motion.div animate={{ height: containerHeight }} className="relative" ref={deckRef} transition={spring}>
      <AnimatePresence initial={false}>
        {orderedAccounts.map((account, i) => (
          <motion.div
            animate={{
              scale: 1 - i * 0.045,
              top: (orderedAccounts.length - 1 - i) * activePeek
            }}
            aria-label={
              i > 0
                ? `Switch to ${ALFRED_TYPE_TO_METHOD[account.type]} account ending ${account.fiatAccountFields.accountNumber.slice(-4)}`
                : undefined
            }
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
            initial={false}
            key={account.fiatAccountId}
            onClick={
              i > 0
                ? canHover
                  ? () => setActiveId(account.fiatAccountId)
                  : !isExpanded
                    ? () => setIsExpanded(true)
                    : () => {
                        setActiveId(account.fiatAccountId);
                        setIsExpanded(false);
                      }
                : undefined
            }
            onHoverEnd={i > 0 && canHover ? () => setHoveredId(null) : undefined}
            onHoverStart={i > 0 && canHover ? () => setHoveredId(account.fiatAccountId) : undefined}
            onKeyDown={
              i > 0
                ? e => {
                    if (e.key === "Enter" || e.key === " ") setActiveId(account.fiatAccountId);
                  }
                : undefined
            }
            role={i > 0 ? "button" : undefined}
            style={{
              cursor: i > 0 ? "pointer" : "default",
              height: CARD_HEIGHT,
              left: 0,
              position: "absolute",
              right: 0,
              zIndex: orderedAccounts.length - i
            }}
            tabIndex={i > 0 ? 0 : undefined}
            transition={spring}
            whileHover={i > 0 && canHover ? { y: -10 } : undefined}
          >
            {i === 0 ? (
              <FrontCardContent account={account} onDelete={onDelete} />
            ) : (
              <>
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
                        Click to select
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
