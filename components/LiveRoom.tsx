"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from "livekit-client";

import { API_BASE_URL } from "@/lib/api";

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  canStream: boolean;
};

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type Stream = {
  id: string;
  streamer_user_id: string;
  streamer_display_name: string;
  room_name: string;
  status: "live" | "ended";
  started_at: string | null;
  ended_at: string | null;
  deadline_at: string;
  created_at: string;
};

type StreamAccessResponse = {
  stream: Stream;
  livekit: {
    token: string;
    wsUrl: string;
  };
};

type ActiveStreamResponse = {
  stream: Stream | null;
};

export function LiveRoom() {
  const [email, setEmail] = useState("user1@test.com");
  const [password, setPassword] = useState("");

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [activeStream, setActiveStream] = useState<Stream | null>(null);

  const [status, setStatus] = useState("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setMode] = useState<"idle" | "streamer" | "viewer">("idle");

  const roomRef = useRef<Room | null>(null);

  async function login() {
    try {
      setIsBusy(true);
      setStatus("logging in");

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to login");
      }

      const data: LoginResponse = await response.json();

      setAccessToken(data.accessToken);
      setUser(data.user);
      setStatus(`logged in as ${data.user.displayName}`);
    } catch (error) {
      console.error(error);
      setStatus("login error");
    } finally {
      setIsBusy(false);
    }
  }

  async function fetchActiveStream(): Promise<Stream | null> {
    const response = await fetch(`${API_BASE_URL}/api/v1/streams/active`);

    if (!response.ok) {
      throw new Error("Failed to fetch active stream");
    }

    const data: ActiveStreamResponse = await response.json();
    return data.stream;
  }

  async function cleanupRoom() {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    setIsConnected(false);
    setMode("idle");

    const localContainer = document.getElementById("local-media");
    const remoteContainer = document.getElementById("remote-media");

    if (localContainer) localContainer.innerHTML = "";
    if (remoteContainer) remoteContainer.innerHTML = "";
  }

  async function setupRoom(params: {
    wsUrl: string;
    token: string;
    publishLocalTracks: boolean;
    mode: "streamer" | "viewer";
  }) {
    await cleanupRoom();

    const room = new Room();

    room.on(RoomEvent.Connected, () => {
      setIsConnected(true);
      setStatus(`connected as ${params.mode}`);
      console.log("room connected");
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      console.log("room disconnected", reason);
      setIsConnected(false);
      setStatus("disconnected");
      setMode("idle");
    });

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log("connection state changed:", state);
    });

    room.on(RoomEvent.MediaDevicesError, (error) => {
      console.error("media devices error:", error);
      setStatus("media devices error");
    });

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === "video" || track.kind === "audio") {
        const element = track.attach();
        element.setAttribute("data-remote-track", "true");

        if (track.kind === "video" && element instanceof HTMLVideoElement) {
          element.autoplay = true;
          element.playsInline = true;
          element.className = "max-h-[240px] w-full rounded-md";
        }

        document.getElementById("remote-media")?.appendChild(element);
      }
    });

    await room.connect(params.wsUrl, params.token);

    if (params.publishLocalTracks) {
      const audioTrack = await createLocalAudioTrack();
      const videoTrack = await createLocalVideoTrack();

      await room.localParticipant.publishTrack(audioTrack);
      await room.localParticipant.publishTrack(videoTrack);

      const localVideoEl = videoTrack.attach();

      if (localVideoEl instanceof HTMLVideoElement) {
        localVideoEl.muted = true;
        localVideoEl.playsInline = true;
        localVideoEl.autoplay = true;
        localVideoEl.className = "max-h-[240px] w-full rounded-md";
      }

      const localContainer = document.getElementById("local-media");
      if (localContainer) {
        localContainer.innerHTML = "";
        localContainer.appendChild(localVideoEl);
      }

      setStatus("local tracks published");
    }

    roomRef.current = room;
    setMode(params.mode);
  }

  async function handleStartStream() {
    if (!accessToken) {
      setStatus("login required");
      return;
    }

    try {
      setIsBusy(true);
      setStatus("starting stream");

      const response = await fetch(`${API_BASE_URL}/api/v1/streams/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to start stream");
      }

      const result: StreamAccessResponse = data;
      setActiveStream(result.stream);

      await setupRoom({
        wsUrl: result.livekit.wsUrl,
        token: result.livekit.token,
        publishLocalTracks: true,
        mode: "streamer",
      });

      setStatus("stream started");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "start stream error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleWatchLive() {
    if (!activeStream) {
      setStatus("no active stream");
      return;
    }

    try {
      setIsBusy(true);
      setStatus("joining as viewer");

      const response = await fetch(
        `${API_BASE_URL}/api/v1/streams/${activeStream.id}/view-token`,
        {
          method: "POST",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to join stream");
      }

      const result: StreamAccessResponse = data;

      await setupRoom({
        wsUrl: result.livekit.wsUrl,
        token: result.livekit.token,
        publishLocalTracks: false,
        mode: "viewer",
      });

      setStatus("watching live stream");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "viewer join error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStopStream() {
    if (!accessToken || !activeStream) {
      return;
    }

    try {
      setIsBusy(true);
      setStatus("stopping stream");

      const response = await fetch(
        `${API_BASE_URL}/api/v1/streams/${activeStream.id}/stop`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to stop stream");
      }

      await cleanupRoom();
      setActiveStream(null);
      setStatus("stream stopped");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "stop stream error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisconnect() {
    await cleanupRoom();
    setStatus("disconnected");
  }

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const stream = await fetchActiveStream();

        if (isMounted) {
          setActiveStream(stream);
        }
      } catch (error) {
        console.error(error);
      }
    };

    void load();

    const interval = setInterval(() => {
      void load();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      void cleanupRoom();
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Live Shopping MVP</h1>

      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-medium">Login as streamer</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={login}
            disabled={isBusy}
            className="rounded-md border px-4 py-2 disabled:opacity-50"
          >
            Login
          </button>

          {user ? (
            <span className="text-sm text-green-700">
              Logged in as {user.displayName}
            </span>
          ) : (
            <span className="text-sm text-gray-500">Not logged in</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-medium">Live controls</h2>

        <div className="mb-4 text-sm">
          {activeStream ? (
            <span className="font-medium text-red-600">
              ● {activeStream.streamer_display_name} is live
            </span>
          ) : (
            <span className="text-gray-500">No active stream</span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleStartStream}
            disabled={isBusy || !accessToken || !!activeStream}
            className="rounded-md border px-4 py-2 disabled:opacity-50"
          >
            Start stream
          </button>

          <button
            onClick={handleWatchLive}
            disabled={isBusy || !activeStream}
            className="rounded-md border px-4 py-2 disabled:opacity-50"
          >
            Watch live
          </button>

          <button
            onClick={handleStopStream}
            disabled={
              isBusy ||
              !activeStream ||
              !user ||
              activeStream.streamer_user_id !== user.id
            }
            className="rounded-md border px-4 py-2 disabled:opacity-50"
          >
            Stop stream
          </button>

          <button
            onClick={handleDisconnect}
            disabled={isBusy || !isConnected}
            className="rounded-md border px-4 py-2 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
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
