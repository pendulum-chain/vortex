import { motion } from "motion/react";
import React, { useCallback, useEffect, useState } from "react";
import { cn } from "../../helpers/cn";

type SparkleButtonTheme = "primary" | "success";

interface SparkleButtonProps {
  label: string;
  onClick: () => void;
  theme?: SparkleButtonTheme;
  icon?: React.ReactNode;
  className?: string;
}

const THEME_CONFIG: Record<SparkleButtonTheme, { buttonClass: string; sparkleColor: string }> = {
  primary: {
    buttonClass: "btn-vortex-primary",
    sparkleColor: "var(--color-primary)"
  },
  success: {
    buttonClass: "btn-vortex-success",
    sparkleColor: "var(--color-success)"
  }
};

interface SparkleConfig {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
}

let idCounter = 0;

const generateConfigs = (): SparkleConfig[] =>
  Array.from({ length: 5 }, () => {
    const angle = Math.random() * 360;
    const distance = 25 + Math.random() * 30;
    return {
      delay: Math.random() * 0.08,
      id: idCounter++,
      size: 3 + Math.random() * 3,
      x: Math.cos((angle * Math.PI) / 180) * distance,
      y: Math.sin((angle * Math.PI) / 180) * distance
    };
  });

export const SparkleButton = ({ label, onClick, theme = "success", icon, className }: SparkleButtonProps) => {
  const [configs, setConfigs] = useState<SparkleConfig[]>([]);
  const { buttonClass, sparkleColor } = THEME_CONFIG[theme];

  const burst = useCallback(() => setConfigs(generateConfigs()), []);

  useEffect(() => {
    const id = setInterval(burst, 1000);
    return () => clearInterval(id);
  }, [burst]);

  const handleClick = useCallback(() => {
    onClick();
    burst();
  }, [onClick, burst]);

  return (
    <div className={cn("relative", className)}>
      <button
        className={cn("btn relative z-10 flex w-full items-center justify-center gap-2", buttonClass)}
        onClick={handleClick}
      >
        {icon}
        {label}
      </button>
      {configs.map(s => (
        <motion.span
          animate={{ opacity: [0, 1, 1, 0], scale: [0, 1.3, 1, 0], x: [0, s.x], y: [0, s.y] }}
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
          key={s.id}
          style={{
            backgroundColor: sparkleColor,
            borderRadius: "50%",
            height: s.size,
            left: "50%",
            marginLeft: -s.size / 2,
            marginTop: -s.size / 2,
            pointerEvents: "none",
            position: "absolute",
            top: "50%",
            width: s.size
          }}
          transition={{ delay: s.delay, duration: 0.65, ease: "easeOut", times: [0, 0.2, 0.6, 1] }}
        />
      ))}
    </div>
  );
};
