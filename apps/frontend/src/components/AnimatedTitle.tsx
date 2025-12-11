import { motion } from "motion/react";
import { wordVariants } from "../constants/animations";

interface AnimatedTitleProps {
  text: string;
  highlightColor?: string;
}

export const AnimatedTitle = ({ text, highlightColor = "text-blue-400" }: AnimatedTitleProps) => {
  const parts = text.split(/(<0>.*?<\/0>|<br\s*\/?>)/);

  return (
    <>
      {parts.map((part, partIndex) => {
        if (part.match(/^<0>.*?<\/0>$/)) {
          const text = part.replace(/<\/?0>/g, "");
          const words = text.split(/(\s+)/);
          return words.map((word, wordIdx) => {
            if (!word.trim()) {
              return <span key={`space-${partIndex}-${wordIdx}`}>{word}</span>;
            }
            return (
              <motion.span
                className={`inline-block ${highlightColor}`}
                key={`part-${partIndex}-word-${wordIdx}`}
                style={{ transformStyle: "preserve-3d" }}
                variants={wordVariants}
              >
                {word}
              </motion.span>
            );
          });
        } else if (part.match(/^<br\s*\/?>$/i)) {
          return <br key={`br-${partIndex}`} />;
        } else if (part.trim()) {
          const words = part.split(/(\s+)/);
          return words.map((word, wordIdx) => {
            if (!word.trim()) {
              return <span key={`space-${partIndex}-${wordIdx}`}>{word}</span>;
            }
            return (
              <motion.span
                className="inline-block"
                key={`part-${partIndex}-word-${wordIdx}`}
                style={{ transformStyle: "preserve-3d" }}
                variants={wordVariants}
              >
                {word}
              </motion.span>
            );
          });
        }
        return null;
      })}
    </>
  );
};
