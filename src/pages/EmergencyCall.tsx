import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import VideoCallRoom from "@/components/calls/VideoCallRoom";
import SosTextChatRoom from "@/components/calls/SosTextChatRoom";
import { getSessionUser } from "@/lib/currentUser";
import { useEmergencySession } from "@/hooks/useEmergencySession";
import RouteSkeleton from "@/components/skeletons/RouteSkeleton";

/**
 * Emergency (SOS) call route.
 *
 * This page is a thin UI shell: the whole request/session lifecycle lives in
 * `useEmergencySession` and the call itself is the shared room used by the
 * scheduled consultation too (`VideoCallRoom` + `useWebRTC`).
 */
/** Fallback when the request's own limit can't be read (SOS: 25 min). */
const DEFAULT_SOS_TIME_LIMIT = 1500;

const EmergencyCall = () => {
  const { requestId: requestIdParam, sessionId: sessionIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const urlUserType =
    (searchParams.get("userType") as "psychologist" | "patient") || "patient";
  // Quem é quem vem da própria sala (o endereço pode estar errado ou faltando).
  const [roomUserType, setRoomUserType] = useState<"psychologist" | "patient" | null>(null);
  const userType = roomUserType ?? urlUserType;
  const requestIdFromUrl = requestIdParam || searchParams.get("requestId") || null;

  useEffect(() => {
    document.title = "Chamada de Emergência | Soliv";
  }, []);

  // The session id is the official room identifier — never trust the URL alone.
  useEffect(() => {
    const fromUrl = sessionIdParam || searchParams.get("sessionId") || searchParams.get("session_id");
    if (fromUrl) {
      setSessionId(fromUrl);
      setLoading(false);
      return;
    }

    if (!requestIdFromUrl) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("webrtc_sessions")
        .select("id")
        .eq("emergency_request_id", requestIdFromUrl)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        setSessionId(data?.id ?? null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionIdParam, searchParams, requestIdFromUrl]);

  // Session length comes from the request itself (filled server-side from
  // the SOS: 25 min in every plan). Resolved before the
  // room mounts: the shared timer persists its first value right away, so
  // starting on a placeholder limit would stick for the whole call.
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  // "video" ou "text" (SOS por mensagem): decide qual sala abre.
  const [channel, setChannel] = useState<"video" | "text" | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      let requestId = requestIdFromUrl;
      if (!requestId) {
        const { data } = await supabase
          .from("webrtc_sessions")
          .select("emergency_request_id")
          .eq("id", sessionId)
          .maybeSingle();
        requestId = data?.emergency_request_id ?? null;
      }
      let limit: number | null = null;
      let requestChannel: "video" | "text" = "video";
      if (requestId) {
        const { data } = await supabase
          .from("emergency_requests")
          .select("time_limit_seconds, channel")
          .eq("id", requestId)
          .maybeSingle();
        limit = data?.time_limit_seconds ?? null;
        if (data?.channel === "text") requestChannel = "text";
      }
      if (!cancelled) {
        setTimeLimit(limit ?? DEFAULT_SOS_TIME_LIMIT);
        setChannel(requestChannel);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, requestIdFromUrl]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const [{ data: auth }, { data: room }] = await Promise.all([
        getSessionUser(),
        supabase.from("webrtc_sessions").select("patient_id, psychologist_id").eq("id", sessionId).maybeSingle(),
      ]);
      if (cancelled) return;
      const uid = auth.user?.id;
      setRoomUserType(
        uid && room?.psychologist_id === uid ? "psychologist" : uid && room?.patient_id === uid ? "patient" : urlUserType
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, urlUserType]);

  const { requestId, endSession } = useEmergencySession({
    sessionId,
    requestIdFromUrl,
    userType,
    // Por mensagem, o atendimento começa na 1ª resposta do psicólogo (banco).
    startOnJoin: channel === "video",
  });

  if (loading || (sessionId && (timeLimit === null || roomUserType === null || channel === null))) {
    return <RouteSkeleton />;
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <p className="text-lg font-medium">Não foi possível abrir a sala de atendimento</p>
          <p className="text-sm text-muted-foreground">
            A sessão desta emergência não está mais disponível.
          </p>
          <Button onClick={() => navigate(userType === "psychologist" ? "/psychologist-dashboard" : "/home")}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const resolvedRequestId = requestId ?? requestIdFromUrl;
  if (channel === "text" && resolvedRequestId) {
    return (
      <SosTextChatRoom
        requestId={resolvedRequestId}
        sessionId={sessionId}
        userType={userType}
        onLeave={({ endInfo }) => endSession(endInfo)}
      />
    );
  }

  return (
    <VideoCallRoom
      kind="sos"
      sessionId={sessionId}
      userType={userType}
      timeLimitSeconds={timeLimit ?? DEFAULT_SOS_TIME_LIMIT}
      requestId={requestId ?? requestIdFromUrl}
      onLeave={({ endInfo }) => endSession(endInfo)}
    />
  );
};

export default EmergencyCall;
