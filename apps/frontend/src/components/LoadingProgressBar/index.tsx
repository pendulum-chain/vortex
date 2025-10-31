import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../../helpers/cn";

interface LoadingProgressBarProps {
  isSuccess?: boolean;
  successMessage?: string;
}

export const LoadingProgressBar = ({ isSuccess = false, successMessage }: LoadingProgressBarProps) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setProgress(100), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "relative h-12 w-full overflow-hidden rounded-lg border border-gray-300 bg-gray-100",
        isSuccess && "bg-gradient-to-r from-blue-500 to-blue-600"
      )}
    >
      {isSuccess && (
        <motion.div
          animate={{ y: 0 }}
          className="absolute inset-0 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-green-600 font-medium text-white"
          initial={{ y: "100%" }}
          transition={{
            duration: 0.2,
            ease: "easeOut"
          }}
        >
          <CheckBadgeIcon className="h-6 w-6" />
          <span>{successMessage}</span>
        </motion.div>
      )}

      <motion.div
        animate={{ width: `${progress}%` }}
        className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
        initial={{ width: "0%" }}
        transition={{
          duration: 1,
          ease: "easeInOut"
        }}
      />
    </div>
  );
};
