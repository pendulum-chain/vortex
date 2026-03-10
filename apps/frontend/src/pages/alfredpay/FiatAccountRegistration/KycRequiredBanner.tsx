export function KycRequiredBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg bg-yellow-50 p-4" role="alert">
      <svg
        className="h-5 w-5 shrink-0 text-yellow-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
        />
      </svg>
      <div>
        <p className="font-medium">Identity verification required</p>
        <p className="text-gray-600 text-sm">Complete identity verification before adding payment methods.</p>
      </div>
    </div>
  );
}
