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
    <h3 className="mb-2 font-bold text-lg">{name}</h3>
    <p className="mb-2 text-2xl" style={{ fontFamily }}>
      ABCDEFGHIJKLM
      <br />
      nopqrstuvwxyz
      <br />
      1234567890
    </p>
    <code className="rounded bg-gray-100 p-1 font-mono text-sm">font-family: {fontFamily}</code>
  </div>
);

const SizeDisplay = ({ className, name }: { className: string; name: string }) => (
  <div className="row mb-4 flex items-baseline">
    <div className="w-32 shrink-0 font-mono text-gray-500 text-sm">{name}</div>
    <div className={className}>The quick brown fox jumps over the lazy dog</div>
  </div>
);

const WeightDisplay = ({ className, name }: { className: string; name: string }) => (
  <div className="mb-4 flex items-baseline">
    <div className="w-32 shrink-0 font-mono text-gray-500 text-sm">{name}</div>
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
  <div className="mb-4 flex items-center">
    <div
      className={`mr-4 h-16 w-16 rounded border border-gray-200 shadow-sm ${bgClass || className.replace("text-", "bg-")}`}
    ></div>
    <div>
      <div className={`font-bold ${className}`}>{name}</div>
      <div className="font-mono text-gray-500 text-sm">{className}</div>
      {hex && <div className="font-mono text-gray-400 text-xs">{hex}</div>}
    </div>
  </div>
);

export const Typography: Story = {
  render: () => (
    <div className="max-w-5xl p-8">
      <h1 className="mb-8 font-bold text-4xl">Typography & Colors</h1>

      <section className="mb-12">
        <h2 className="mb-6 border-b pb-2 font-bold text-2xl">Font Families</h2>
        <FontDisplay fontFamily='"Red Hat Display", sans-serif' name="Red Hat Display (Default)" />
        <FontDisplay fontFamily='"Outfit", sans-serif' name="Outfit" />
        <FontDisplay fontFamily='"Nunito Sans", sans-serif' name="Nunito Sans" />
      </section>

      <section className="mb-12">
        <h2 className="mb-6 border-b pb-2 font-bold text-2xl">Font Sizes</h2>
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
        <h2 className="mb-6 border-b pb-2 font-bold text-2xl">Font Weights</h2>
        <WeightDisplay className="font-light" name="Light (300)" />
        <WeightDisplay className="font-normal" name="Normal (400)" />
        <WeightDisplay className="font-medium" name="Medium (500)" />
        <WeightDisplay className="font-semibold" name="Semibold (600)" />
        <WeightDisplay className="font-bold" name="Bold (700)" />
      </section>

      <section className="mb-12">
        <h2 className="mb-6 border-b pb-2 font-bold text-2xl">Text Colors</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
          <ColorDisplay className="text-red-800" name="Red 800" />
          <ColorDisplay className="text-green-700" name="Green 700" />
          <ColorDisplay className="text-yellow-800" name="Yellow 800" />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-6 border-b pb-2 font-bold text-2xl">Theme Colors (CSS Variables)</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="mb-4 flex items-center">
            <div className="mr-4 h-16 w-16 rounded shadow-sm" style={{ backgroundColor: "var(--color-primary)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-primary)" }}>
                Primary
              </div>
              <div className="font-mono text-gray-500 text-sm">--color-primary</div>
              <div className="font-mono text-gray-400 text-xs">#0f4dc0</div>
            </div>
          </div>
          <div className="mb-4 flex items-center">
            <div className="mr-4 h-16 w-16 rounded shadow-sm" style={{ backgroundColor: "var(--color-secondary)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-secondary-content)" }}>
                Secondary
              </div>
              <div className="font-mono text-gray-500 text-sm">--color-secondary</div>
              <div className="font-mono text-gray-400 text-xs">#f4f5f6</div>
            </div>
          </div>
          <div className="mb-4 flex items-center">
            <div className="mr-4 h-16 w-16 rounded shadow-sm" style={{ backgroundColor: "var(--color-accent)" }}></div>
            <div>
              <div className="font-bold">Accent</div>
              <div className="font-mono text-gray-500 text-sm">--color-accent</div>
              <div className="font-mono text-gray-400 text-xs">#1de7df</div>
            </div>
          </div>
          <div className="mb-4 flex items-center">
            <div className="mr-4 h-16 w-16 rounded shadow-sm" style={{ backgroundColor: "var(--text)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--text)" }}>
                Text
              </div>
              <div className="font-mono text-gray-500 text-sm">--text</div>
              <div className="font-mono text-gray-400 text-xs">#111</div>
            </div>
          </div>
          <div className="mb-4 flex items-center">
            <div className="mr-4 h-16 w-16 rounded shadow-sm" style={{ backgroundColor: "var(--color-neutral)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-neutral-content)" }}>
                Neutral
              </div>
              <div className="font-mono text-gray-500 text-sm">--color-neutral</div>
              <div className="font-mono text-gray-400 text-xs">#eff2f5</div>
            </div>
          </div>
          <div className="mb-4 flex items-center">
            <div className="mr-4 h-16 w-16 rounded shadow-sm" style={{ backgroundColor: "var(--color-base-100)" }}></div>
            <div>
              <div className="font-bold" style={{ color: "var(--color-base-content)" }}>
                Base 100
              </div>
              <div className="font-mono text-gray-500 text-sm">--color-base-100</div>
              <div className="font-mono text-gray-400 text-xs">#f5f9fa</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
};
