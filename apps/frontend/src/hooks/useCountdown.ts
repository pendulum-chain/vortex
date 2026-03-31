import { useEffect, useRef, useState } from "react";

interface CountdownTime {
  minutes: number;
  seconds: number;
}

function getTimeLeft(targetTimestampMs: number): CountdownTime {
  const diff = targetTimestampMs - Date.now();
  if (diff <= 0) return { minutes: 0, seconds: 0 };
  return {
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60)
  };
}

export function useCountdown(targetTimestampMs: number | null, onExpire?: () => void): CountdownTime {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const [timeLeft, setTimeLeft] = useState<CountdownTime>(() =>
    targetTimestampMs ? getTimeLeft(targetTimestampMs) : { minutes: 0, seconds: 0 }
  );

  useEffect(() => {
    if (!targetTimestampMs) return;

    setTimeLeft(getTimeLeft(targetTimestampMs));

    const intervalId = setInterval(() => {
      const diff = targetTimestampMs - Date.now();
      if (diff <= 0) {
        setTimeLeft({ minutes: 0, seconds: 0 });
        clearInterval(intervalId);
        onExpireRef.current?.();
        return;
      }
      setTimeLeft(getTimeLeft(targetTimestampMs));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [targetTimestampMs]);

  return timeLeft;
}
