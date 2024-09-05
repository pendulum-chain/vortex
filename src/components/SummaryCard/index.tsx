import React from 'react';
import { useGetIcon } from '../../hooks/useGetIcon';

export const SummaryCard = () => {
  const assetIcon = 'usdc';
  const assetIconOut = 'eur';
  const assetTicker = 'USDC';
  const assetOutTicker = 'EUR';
  const icon = useGetIcon(assetIcon);
  const iconOut = useGetIcon(assetIconOut);

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      <div className="grid grid-cols-2 gap-4 mb-2">  
        <div className="border rounded p-2 grid grid-rows-2 gap-px h-full">
          <div className="grid place-items-start">
            <span className="text-xs font-thin">You withdraw</span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-xl font-bold">13</span>
            <div className="flex items-center">
              <img src={icon} alt={assetIcon} className="w-5 h-5" />
              <span className="ml-1">{assetTicker}</span>
            </div>
          </div>
        </div>
        <div className="border rounded p-2 grid grid-rows-2 gap-px h-full">
          <div className="grid place-items-start">
            <span className="text-xs font-thin">You receive</span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-xl font-bold">11.44</span>
            <div className="flex items-center">
              <img src={iconOut} alt={assetIconOut} className="w-5 h-5" />
              <span className="ml-1">{assetOutTicker}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1  p-1 grid grid-rows-2 gap-px h-auto">  
          <div className="grid place-items-start">
            <span className="text-xs font-thin">Your quote</span>
          </div>
          <div className="flex items-left w-full">
            <span className="text-lg font-bold mr-1">11.58</span>
            <div className="flex items-center">
              <img src={iconOut} alt={assetIconOut} className="w-4 h-4" />
              <span className="ml-1">{assetOutTicker}</span>
            </div>
          </div>
        </div>
        <div className="col-span-1  p-1 grid grid-rows-2 gap-px h-auto"> 
          <div className="grid place-items-start">
            <span className="text-xs font-thin">Exchange rate</span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-lg font-bold">1 = 0.89</span>
          </div>
        </div>
        <div className="col-span-1   p-1 grid grid-rows-2 gap-px h-auto">  
          <div className="grid place-items-start">
            <span className="text-xs font-thin">Offramp fees</span>
          </div>
          <div className="flex items-left w-full">
            <span className="text-lg font-bold mr-1">0.14</span>
            <img src={iconOut} alt={assetIconOut} className="w-4 h-4" />
            <span className="ml-1">{assetOutTicker}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
