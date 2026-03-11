import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const iconMotionProps = {
  animate: { filter: "blur(0px)", opacity: 1, scale: 1.1 },
  exit: { filter: "blur(10px)", scale: 0.6 },
  initial: { filter: "blur(10px)", scale: 1 },
  transition: { duration: 0.1 }
};

export function MaskedAccountNumber({ accountNumber }: { accountNumber: string }) {
  const [revealed, setRevealed] = useState(false);
  const last4 = accountNumber.slice(-4);

  return (
    <div className="mt-1 flex items-center gap-1">
      <span className="text-right text-gray-500 tabular-nums" style={{ minWidth: `${accountNumber.length}ch` }}>
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            animate={{ filter: "blur(0px)", opacity: 1 }}
            exit={{ filter: "blur(4px)", opacity: 0 }}
            initial={{ filter: "blur(4px)", opacity: 0 }}
            key={revealed ? "revealed" : "masked"}
            transition={{ duration: 0.15 }}
          >
            {revealed ? (
              accountNumber
            ) : (
              <>
                {"•"
                  .repeat(accountNumber.length - 4)
                  .split("")
                  .map((_, i) => (
                    <span className="inline-block w-[1ch] text-center" key={i}>
                      •
                    </span>
                  ))}
                {last4}
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      <button
        aria-label={revealed ? "Hide account number" : "Show full account number"}
        aria-pressed={revealed}
        className="-m-4 cursor-pointer touch-manipulation p-4 text-gray-400 transition-colors focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:scale-95 [@media(hover:hover)]:hover:text-gray-600"
        onClick={() => setRevealed(r => !r)}
        type="button"
      >
        <AnimatePresence initial={false} mode="wait">
          {revealed ? (
            <motion.span key="slash" {...iconMotionProps}>
              <EyeSlashIcon aria-hidden="true" className="h-3.5 w-3.5" />
            </motion.span>
          ) : (
            <motion.span key="open" {...iconMotionProps}>
              <EyeIcon aria-hidden="true" className="h-3.5 w-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
