"use client";

import { useState } from "react";
import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from "livekit-client";

import { API_BASE_URL } from "@/lib/api";

export function LiveRoom() {
  const [roomName, setRoomName] = useState("test-room");
  const [participantName, setParticipantName] = useState("artem");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("idle");

  const [roomInstance, setRoomInstance] = useState<Room | null>(null);

  async function handleConnect() {
    try {
      setIsConnecting(true);
      setStatus("requesting token");

      const response = await fetch(`${API_BASE_URL}/api/v1/livekit/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomName,
          participantName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch LiveKit token");
      }

      const data: { token: string; wsUrl: string } = await response.json();

      setStatus("connecting to room");

      const room = new Room();

      room.on(RoomEvent.Connected, () => {
        console.log("room connected");
        setStatus("connected");
        setIsConnected(true);
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log("room disconnected", reason);
        setStatus("disconnected");
        setIsConnected(false);
      });

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log("connection state changed:", state);
      });

      room.on(RoomEvent.MediaDevicesError, (error) => {
        console.error("media devices error:", error);
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === "video" || track.kind === "audio") {
          const element = track.attach();
          element.setAttribute("data-remote-track", "true");
          document.getElementById("remote-media")?.appendChild(element);
        }
      });

      await room.connect(data.wsUrl, data.token);

      const audioTrack = await createLocalAudioTrack();
      const videoTrack = await createLocalVideoTrack();

      await room.localParticipant.publishTrack(audioTrack);
      await room.localParticipant.publishTrack(videoTrack);

      const localVideoEl = videoTrack.attach();
      if (localVideoEl instanceof HTMLVideoElement) {
        localVideoEl.muted = true;
        localVideoEl.playsInline = true;
        localVideoEl.autoplay = true;
      }

      const localContainer = document.getElementById("local-media");
      if (localContainer) {
        localContainer.innerHTML = "";
        localContainer.appendChild(localVideoEl);
      }

      setRoomInstance(room);
      setStatus("local tracks published");
    } catch (error) {
      console.error(error);
      setStatus("error");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!roomInstance) return;

    roomInstance.disconnect();
    setRoomInstance(null);
    setIsConnected(false);
    setStatus("disconnected");

    const localContainer = document.getElementById("local-media");
    const remoteContainer = document.getElementById("remote-media");

    if (localContainer) localContainer.innerHTML = "";
    if (remoteContainer) remoteContainer.innerHTML = "";
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Live Shopping MVP</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm">Room name</span>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm">Participant name</span>
          <input
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            className="rounded-md border px-3 py-2"
          />
        </label>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleConnect}
          disabled={isConnecting || isConnected}
          className="rounded-md border px-4 py-2 disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect"}
        </button>

        <button
          onClick={handleDisconnect}
          disabled={!isConnected}
          className="rounded-md border px-4 py-2 disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>

      <div className="text-sm">
        <span className="font-medium">Status:</span> {status}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-medium">Local media</h2>
          <div
            id="local-media"
            className="flex min-h-[240px] items-center justify-center rounded-lg border"
          />
        </div>

        <div>
          <h2 className="mb-2 text-lg font-medium">Remote media</h2>
          <div
            id="remote-media"
            className="flex min-h-[240px] items-center justify-center rounded-lg border"
          />
        </div>
      </div>
    </div>
  );
}
