import { motion, AnimatePresence } from 'motion/react';
import { SigningBoxContent } from './SigningBoxContent';
import { useSigningBoxState } from '../../hooks/useSigningBoxState';
import { Popover } from '../Popover';

export const SigningBox = () => {
  const { isVisible, shouldDisplay, progress, signatureState, confirmations } = useSigningBoxState();

  return (
    <Popover isVisible={shouldDisplay}>
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.section
            className="z-50 toast toast-end"
            initial={{ y: 150 }}
            animate={{ y: 0, transition: { type: 'spring', bounce: 0.4 } }}
            exit={{ y: 150 }}
            transition={{ duration: 0.5 }}
            key="signing-box"
          >
            <SigningBoxContent
              className="shadow-2xl"
              progress={progress}
              signatureState={signatureState}
              confirmations={confirmations}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </Popover>
  );
};
