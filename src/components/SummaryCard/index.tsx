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
    <div className="bg-white p-4 rounded-lg shadow-lg w-full">
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div className="border rounded p-1 h-auto flex flex-col justify-between space-y-0">
          <div className="place-self-start">
            <span className="text-sm font-thin">You withdraw</span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-xl font-medium text-blue-800">13</span>
            <div className="flex items-center mr-2">
              <img src={icon} alt={assetIcon} className="w-6 h-6" />
              <span className="ml-1 text-blue-800">{assetTicker}</span>
            </div>
          </div>
        </div>
        <div className="border rounded p-1 h-auto flex flex-col justify-between space-y-0">
          <div className="place-self-start">
            <span className="text-sm font-thin ">You receive</span> 
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-xl font-medium text-blue-800">11.44</span>
            <div className="flex items-center mr-2">
              <img src={iconOut} alt={assetIconOut} className="w-6 h-6" />
              <span className="ml-1 text-blue-800">{assetOutTicker}</span>
            </div>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-10 gap-4">
        <div className="col-span-3 p-1 h-auto flex flex-col justify-between space-y-0 rounded bg-blue-100 bg-opacity-50">
          <div className="place-self-start">
            <span className="text-sm font-thin">Your quote</span>
          </div>
          <div className="flex items-center w-full">
            <span className="text-sm md:text-lg mr-1">11.58</span>
            <div className="flex items-center">
              <img src={iconOut} alt={assetIconOut} className="w-4 md:w-5 h-4 md:h-5" />
              <span className="ml-1">{assetOutTicker}</span>
            </div>
          </div>
        </div>
        
        <div className="col-span-4 p-1 h-auto flex flex-col justify-between space-y-0">
          <div className="place-self-start">
            <span className="text-sm font-thin">Exchange rate</span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-sm md:text-lg">1 {assetTicker} ≈ 0.89 {assetOutTicker}</span>
          </div>
        </div>

        <div className="col-span-3 p-1 h-auto flex flex-col justify-between space-y-0">
          <div className="place-self-start">
            <span className="text-sm font-thin">Offramp fees</span>
          </div>
          <div className="flex items-center w-full">
            <span className="text-sm md:text-lg mr-1">0.14</span>
            <img src={iconOut} alt={assetIconOut} className="w-4 md:w-5 h-4 md:h-5" />
            <span className="ml-1">{assetOutTicker}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
