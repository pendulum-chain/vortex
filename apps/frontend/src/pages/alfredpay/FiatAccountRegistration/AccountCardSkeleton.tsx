import { CARD_HEIGHT } from "./AccountCardDeck";

export function AccountCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-gray-100" style={{ height: CARD_HEIGHT }}>
      <div className="flex h-full flex-col justify-between px-4 py-3">
        <div className="flex flex-col gap-2">
          <div className="h-3.5 w-32 rounded bg-gray-300" />
          <div className="h-3 w-48 rounded bg-gray-200" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-5 w-20 rounded-full bg-gray-300" />
          <div className="h-5 w-14 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
