import { motion } from "motion/react";
import { cn } from "../../helpers/cn";

interface HamburgerIconProps {
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}

export const HamburgerIcon = ({ isOpen, onClick, className }: HamburgerIconProps) => {
  return (
    <motion.button
      animate={isOpen ? "open" : "closed"}
      aria-label={isOpen ? "Close menu" : "Open menu"}
      className={cn("z-50 cursor-pointer rounded-full p-2 hover:bg-gray-100", className)}
      onClick={onClick}
      transition={{
        duration: 0.8,
        ease: [0.5, 0, 0.04, 1]
      }}
      variants={{
        closed: { rotate: 0 },
        open: { rotate: 135 }
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="relative flex h-8 w-8 flex-col items-center justify-center">
        <motion.div
          className="absolute h-0.5 w-5 bg-gray-600"
          transition={{
            duration: 0.2,
            ease: "easeInOut"
          }}
          variants={{
            closed: { top: "30%" },
            open: { top: "50%" }
          }}
        />

        <motion.div className="absolute h-0.5 w-5 bg-gray-600" style={{ top: "50%" }} />

        <motion.div
          className="absolute h-0.5 w-5 bg-gray-600"
          transition={{
            rotate: {
              delay: 0.2,
              duration: 0.8,
              ease: [0.5, 0, 0.04, 1]
            },
            top: {
              duration: 0.2,
              ease: "easeInOut"
            }
          }}
          variants={{
            closed: { rotate: 0, top: "70%" },
            open: {
              rotate: 90,
              top: "50%"
            }
          }}
        />
      </div>
    </motion.button>
  );
};
