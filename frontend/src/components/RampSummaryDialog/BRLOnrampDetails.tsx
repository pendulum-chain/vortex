import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { CopyButton } from '../CopyButton';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { useRampState } from '../../stores/rampStore';
import { RampDirection } from '../RampToggle';
import { useIsQuoteExpired } from '../../stores/rampSummary';

export const BRLOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const rampState = useRampState();
  const isQuoteExpired = useIsQuoteExpired();

  if (rampDirection !== RampDirection.ONRAMP) return null;
  if (!rampState?.ramp?.brCode) return null;
  if (isQuoteExpired) return null;

  return (
    <section>
      <hr className="my-5" />
      <h1 className="font-bold text-lg">{t('components.dialogs.RampSummaryDialog.BRLOnrampDetails.title')}</h1>
      <h2 className="font-bold text-center text-lg">
        {t('components.dialogs.RampSummaryDialog.BRLOnrampDetails.description')}
      </h2>
      <p className="pt-2 text-center">{t('components.dialogs.RampSummaryDialog.BRLOnrampDetails.qrCode')}</p>
      <div className="flex justify-center my-6">
        <div className="border-1 border-gray-300 rounded-lg p-4">
          <QRCodeSVG value={rampState.ramp?.brCode} />
        </div>
      </div>
      <p className="text-center">{t('components.dialogs.RampSummaryDialog.BRLOnrampDetails.copyCode')}</p>
      <CopyButton text={rampState.ramp?.brCode} className="w-full mt-4 py-10" />
    </section>
  );
};
