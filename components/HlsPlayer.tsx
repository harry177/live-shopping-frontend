"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
};

export function HlsPlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !src) return;

    function cleanup() {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }

    function startPlayer() {
      cleanup();

      retryCountRef.current += 1;
      setIsLoading(true);

      if (!video) return;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.play().catch(() => {});
        setIsLoading(false);
        return;
      }

      if (!Hls.isSupported()) {
        console.error("Hls.js is not supported");
        setIsLoading(false);
        return;
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDurationCount: 5,
        liveMaxLatencyDurationCount: 8,
      });

      hlsRef.current = hls;

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log("HLS media attached");
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS manifest parsed");
        setIsLoading(false);

        video.play().catch(console.error);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error("HLS error:", data);

        if (!data.fatal) {
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          scheduleRetry();
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }

        scheduleRetry();
      });

      hls.attachMedia(video);
      hls.loadSource(src);
    }

    function scheduleRetry() {
      cleanup();

      const retryDelay = Math.min(1000 * retryCountRef.current, 5000);

      retryTimeoutRef.current = setTimeout(() => {
        startPlayer();
      }, retryDelay);
    }

    retryCountRef.current = 0;
    startPlayer();

    return cleanup;
  }, [src]);

  return (
    <div className="relative w-full">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black text-sm text-white">
          Preparing stream...
        </div>
      )}

      <video
        ref={videoRef}
        controls
        muted
        autoPlay
        playsInline
        className="max-h-[240px] w-full rounded-md bg-black"
      />
    </div>
  );
}
