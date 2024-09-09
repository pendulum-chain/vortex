import React, { useState, useEffect }  from 'react';
import { BaseLayout } from '../../layouts';
import { SummaryCard, SummaryCardProps } from '../../components/SummaryCard';

export interface IframeProps extends SummaryCardProps {
  src: string;             
  title: string;      
  subtitle: string;   
}

export const IframeComponent: React.FC<IframeProps> = ({
  src, title, subtitle, assetIn, assetOut, fromAmount, toAmount
}) => {
  const [cachedSrc, setCachedSrc] = useState<string | null>(null);

  useEffect(() => {
    if ( src && !cachedSrc) {
      setCachedSrc(src);
    }
  }, [src, cachedSrc]);
  let main = (
    <div className="flex flex-col justify-center items-center p-4 w-full">
    <div className="md:w-[535px] w-full">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-blue-700 mb-4 mt-4">{title}</h1>
      </div>
      <div className="flex justify-center items-center w-full">
          <SummaryCard {...{
                assetIn,
                assetOut,
                fromAmount,
                toAmount,
              }} />
      </div>
      <div className="text-center">
        <h2 className="text-md mb-4 mt-4">{subtitle}</h2>  
      </div>
    </div>
    <div className="flex justify-center items-center relative w-full h-[50vh] md:w-[535px] ">
      <iframe
        src={src}
        style={{ border: 'none' }}
        className="absolute top-0 left-0 w-full h-full"
        allowFullScreen
      />
    </div>
  </div>
  );
  return <BaseLayout main={main} />;
};

