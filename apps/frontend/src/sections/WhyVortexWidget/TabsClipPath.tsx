// @biome-ignore lint/complexity/noStaticOnlyExports
// @biome-ignore lint/correctness/useExhaustiveDependencies
// @biome-ignore lint/*

import { useEffect, useRef, useState } from "react";

export default function TabsClipPath({
  tabs,
  onChange,
  activeTab
}: {
  tabs: string[];
  onChange: (tab: string) => void;
  activeTab: string;
}) {
  const containerRef = useRef(null);
  const activeTabElementRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;

    if (activeTab && container) {
      const activeTabElement = activeTabElementRef.current;

      if (activeTabElement) {
        const { offsetLeft, offsetWidth } = activeTabElement;

        const clipLeft = offsetLeft;
        const clipRight = offsetLeft + offsetWidth;
        container.style.clipPath = `inset(0 ${Number(100 - (clipRight / container.offsetWidth) * 100).toFixed()}% 0 ${Number((clipLeft / container.offsetWidth) * 100).toFixed()}% round 17px)`;
      }
    }
  }, [activeTab, activeTabElementRef, containerRef]);

  return (
    <div className="relative mx-auto flex w-fit rounded-xl bg-gray-50 shadow-xs">
      <ul className="relative flex items-center justify-center gap-2 ">
        {tabs.map(tab => (
          <li key={tab}>
            <button
              className="flex h-[34px] cursor-pointer items-center gap-2 rounded-xl p-4 font-semibold text-black text-sm hover:bg-gray-100"
              data-tab={tab}
              onClick={() => {
                onChange(tab);
              }}
              ref={activeTab === tab ? activeTabElementRef : null}
            >
              {tab}
            </button>
          </li>
        ))}
      </ul>

      <div aria-hidden className="ease absolute z-10 overflow-hidden transition-clip-path duration-250" ref={containerRef}>
        <ul className="relative flex w-full items-center justify-center gap-2 bg-primary">
          {tabs.map(tab => (
            <li key={tab}>
              <button
                className="flex h-[34px] items-center gap-2 rounded-xl p-4 font-semibold text-sm text-white"
                data-tab={tab}
                onClick={() => {
                  onChange(tab);
                }}
                tabIndex={-1}
              >
                {tab}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
