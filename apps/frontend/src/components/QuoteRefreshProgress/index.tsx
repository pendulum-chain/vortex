import { motion } from "motion/react";

import { useQuoteRefresh } from "../../hooks/ramp/useQuoteRefresh";

export function QuoteRefreshProgress() {
  const radius = 12;
  const strokeWidth = 2.4;
  const normalizedRadius = radius - strokeWidth * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;

  const { timeRemaining, animationControls } = useQuoteRefresh(circumference);

  return (
    <div className="flex items-center justify-center gap-1">
      <div className="relative inline-block">
        <div
          className="tooltip tooltip-bottom tooltip-primary relative flex items-center justify-center"
          data-tip={`Quote will update in ${timeRemaining}s`}
        >
          <svg className="-rotate-90 transform" height={radius * 2} width={radius * 2}>
            <circle
              cx={radius}
              cy={radius}
              fill="transparent"
              r={normalizedRadius}
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            <motion.circle
              animate={animationControls}
              cx={radius}
              cy={radius}
              fill="transparent"
              initial={{ strokeDashoffset: circumference }}
              r={normalizedRadius}
              stroke="#3b82f6"
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
