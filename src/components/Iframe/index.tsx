import React, { useState, useEffect }  from 'react';
import { BaseLayout } from '../../layouts';

interface IframeProps {
  src: string;             
  title: string;      
  subtitle: string;   
}

const IframeComponent: React.FC<IframeProps> = ({
  src, title, subtitle
}) => {
  const [cachedSrc, setCachedSrc] = useState<string | null>(null);

  useEffect(() => {
    if ( src && !cachedSrc) {
      setCachedSrc(src);
    }
  }, [src, cachedSrc]);
  let main = 
  <div className="flex justify-center items-center w-full h-full p-4">
  <div className="max-w-lg w-full">
    <div className="text-center">
      <h1 className="text-2xl font-bold text-blue-700 mb-4 mt-4">{title}</h1>
      <h2 className="text-md mb-4">{subtitle}</h2>
      <div className="relative pb-[150%] md:pb-0 md:w-[535px] md:h-[500px]"> 
        <iframe
          src={src}
          style={{ border: 'none' }}
          className="absolute top-0 left-0 w-full h-full "
          allowFullScreen
        />
      </div>
    </div>
  </div>
</div>

  return <BaseLayout main={main} />;
};

export default IframeComponent;
