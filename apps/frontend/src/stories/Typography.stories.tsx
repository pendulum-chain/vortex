import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

const meta: Meta = {
  parameters: {
    layout: "centered"
  },
  title: "Design System/Typography"
};

export default meta;

type Story = StoryObj;

const FontDisplay = ({ fontFamily, name }: { fontFamily: string; name: string }) => (
  <div className="mb-8">
    <h3 className="text-lg font-bold mb-2">{name}</h3>
    <p className="text-2xl mb-2" style={{ fontFamily }}>
      ABCDEFGHIJKLM
      <br />
      nopqrstuvwxyz
      <br />
      1234567890
    </p>
    <code className="text-sm bg-gray-100 p-1 rounded font-mono">font-family: {fontFamily}</code>
  </div>
);

const SizeDisplay = ({ className, name }: { className: string; name: string }) => (
  <div className="flex items-baseline mb-4 row">
    <div className="w-32 text-sm text-gray-500 font-mono shrink-0">{name}</div>
    <div className={className}>The quick brown fox jumps over the lazy dog</div>
  </div>
);

const WeightDisplay = ({ className, name }: { className: string; name: string }) => (
  <div className="flex items-baseline mb-4">
    <div className="w-32 text-sm text-gray-500 font-mono shrink-0">{name}</div>
    <div className={`text-2xl ${className}`}>The quick brown fox jumps over the lazy dog</div>
  </div>
);

const ColorDisplay = ({
  className,
  name,
  hex,
  bgClass
}: {
  className: string;
  name: string;
  hex?: string;
  bgClass?: string;
}) => (
  <div className="flex items-center mb-4">
    <div
      className={`w-16 h-16 rounded mr-4 border border-gray-200 shadow-sm ${bgClass || className.replace("text-", "bg-")}`}
    ></div>
    <div>
      <div className={`font-bold ${className}`}>{name}</div>
      <div className="text-sm text-gray-500 font-mono">{className}</div>
      {hex && <div className="text-xs text-gray-400 font-mono">{hex}</div>}
    </div>
  </div>
);

export const Typography: Story = {
  render: () => (
    <div className="p-8 max-w-5xl">
      <h1 className="text-4xl font-bold mb-8">Typography & Colors</h1>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 border-b pb-2">Font Families</h2>
        <FontDisplay fontFamily='"Red Hat Display", sans-serif' name="Red Hat Display (Default)" />
        <FontDisplay fontFamily='"Outfit", sans-serif' name="Outfit" />
        <FontDisplay fontFamily='"Nunito Sans", sans-serif' name="Nunito Sans" />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 border-b pb-2">Font Sizes</h2>
        <SizeDisplay className="text-xs" name="text-xs" />
        <SizeDisplay className="text-sm" name="text-sm" />
        <SizeDisplay className="text-base" name="text-base" />
        <SizeDisplay className="text-lg" name="text-lg" />
        <SizeDisplay className="text-xl" name="text-xl" />
        <SizeDisplay className="text-2xl" name="text-2xl" />
        <SizeDisplay className="text-3xl" name="text-3xl" />
        <SizeDisplay className="text-4xl" name="text-4xl" />
        <SizeDisplay className="text-5xl" name="text-5xl" />
        <SizeDisplay className="text-6xl" name="text-6xl" />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 border-b pb-2">Font Weights</h2>
        <WeightDisplay className="font-light" name="Light (300)" />
        <WeightDisplay className="font-normal" name="Normal (400)" />
        <WeightDisplay className="font-medium" name="Medium (500)" />
        <WeightDisplay className="font-semibold" name="Semibold (600)" />
        <WeightDisplay className="font-bold" name="Bold (700)" />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 border-b pb-2">Text Colors</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ColorDisplay className="text-black" name="Black" />
          <ColorDisplay
            bgClass="bg-white bg-[url('https://www.transparenttextures.com/patterns/connected.png')] text-gray-400"
            className="text-white"
            name="White (on dark)"
          />
          <ColorDisplay className="text-blue-400" name="Blue 400" />
          <ColorDisplay className="text-blue-700" name="Blue 700" />
          <ColorDisplay className="text-blue-900" name="Blue 900" />
          <ColorDisplay className="text-gray-200" name="Gray 200" />
          <ColorDisplay className="text-gray-300" name="Gray 300" />
          <ColorDisplay className="text-gray-400" name="Gray 400" />
          <ColorDisplay className="text-gray-500" name="Gray 500" />
          <ColorDisplay className="text-gray-600" name="Gray 600" />
          <ColorDisplay className="text-gray-700" name="Gray 700" />
          <ColorDisplay className="text-gray-800" name="Gray 800" />
          <ColorDisplay className="text-gray-900" name="Gray 900" />
          <ColorDisplay className="text-red-500" name="Red 500" />
          <ColorDisplay className="text-red-600" name="Red 600" />
          <ColorDisplay className="text-green-700" name="Green 700" />
          <ColorDisplay className="text-yellow-800" name="Yellow 800" />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 border-b pb-2">Theme Colors (CSS Variables)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 rounded mr-4 shadow-sm" style={{ backgroundColor: "var(--color-primary)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-primary)" }}>
                Primary
              </div>
              <div className="text-sm text-gray-500 font-mono">--color-primary</div>
              <div className="text-xs text-gray-400 font-mono">#0f4dc0</div>
            </div>
          </div>
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 rounded mr-4 shadow-sm" style={{ backgroundColor: "var(--color-secondary)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-secondary-content)" }}>
                Secondary
              </div>
              <div className="text-sm text-gray-500 font-mono">--color-secondary</div>
              <div className="text-xs text-gray-400 font-mono">#f4f5f6</div>
            </div>
          </div>
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 rounded mr-4 shadow-sm" style={{ backgroundColor: "var(--color-accent)" }}></div>
            <div>
              <div className="font-bold">Accent</div>
              <div className="text-sm text-gray-500 font-mono">--color-accent</div>
              <div className="text-xs text-gray-400 font-mono">#1de7df</div>
            </div>
          </div>
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 rounded mr-4 shadow-sm" style={{ backgroundColor: "var(--text)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--text)" }}>
                Text
              </div>
              <div className="text-sm text-gray-500 font-mono">--text</div>
              <div className="text-xs text-gray-400 font-mono">#111</div>
            </div>
          </div>
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 rounded mr-4 shadow-sm" style={{ backgroundColor: "var(--color-neutral)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-neutral-content)" }}>
                Neutral
              </div>
              <div className="text-sm text-gray-500 font-mono">--color-neutral</div>
              <div className="text-xs text-gray-400 font-mono">#eff2f5</div>
            </div>
          </div>
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 rounded mr-4 shadow-sm" style={{ backgroundColor: "var(--color-base-100)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-base-content)" }}>
                Base 100
              </div>
              <div className="text-sm text-gray-500 font-mono">--color-base-100</div>
              <div className="text-xs text-gray-400 font-mono">#f5f9fa</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
};
