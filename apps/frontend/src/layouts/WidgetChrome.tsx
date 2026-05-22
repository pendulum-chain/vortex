import Stepper from "../components/Stepper";
import { useIsQuoteComponentDisplayed } from "../hooks/ramp/useIsQuoteComponentDisplayed";
import { useStepper } from "../hooks/useStepper";

// Stepper and the quote-displayed check both read from the ramp XState actor.
// That actor only exists inside WidgetProviders, so this module is dynamic-imported
// to keep XState/rampState out of the marketing entry bundle.
const WidgetChrome = () => {
  const { steps } = useStepper();
  const isQuoteComponentDisplayed = useIsQuoteComponentDisplayed();
  const isStepperHidden = isQuoteComponentDisplayed;

  return (
    <>
      <div className="container relative z-20 mx-auto px-4 md:w-120">
        {isStepperHidden ? <div className="h-[56px]" /> : <Stepper steps={steps} />}
      </div>
      <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 z-0 w-1/2 animate-float bg-gradient-to-b from-white via-blue-100 to-white"></div>
        <div className="absolute inset-y-0 right-0 z-0 w-1/2 rotate-180 animate-float-delayed bg-gradient-to-b from-white via-blue-100 to-white"></div>
      </div>
    </>
  );
};

export default WidgetChrome;
