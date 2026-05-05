"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

type Props = {
  src: string;
};

export function HlsPlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    console.log("HLS src:", src);

    if (!Hls.isSupported()) {
      console.error("Hls.js is not supported");
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log("HLS media attached");
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log("HLS manifest parsed");
      video.play().catch(console.error);
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      console.error("HLS error:", data);
    });

    hls.attachMedia(video);
    hls.loadSource(src);

    return () => {
      hls.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls
      muted
      autoPlay
      playsInline
      className="max-h-[240px] w-full rounded-md bg-black"
    />
  );
}