import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VideoCallRoom from '@/components/calls/VideoCallRoom';
import { useWebRTC } from '@/hooks/useWebRTC';

const fakeStream = (kinds: Array<'audio' | 'video'>) =>
  ({
    getTracks: () => kinds.map((kind) => ({ kind, enabled: true })),
    getAudioTracks: () => kinds.filter((k) => k === 'audio').map((kind) => ({ kind, enabled: true })),
    getVideoTracks: () => kinds.filter((k) => k === 'video').map((kind) => ({ kind, enabled: true })),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaStream;

const webrtcState = {
  localStream: null as MediaStream | null,
  remoteStream: null as MediaStream | null,
  peerConnection: null,
  connectionState: 'new',
  isConnected: false,
  error: null as string | null,
  session: null,
  callEndedBy: null as null | { userId: string; userType: string },
  isReconnecting: false,
  reconnectAttempt: 0,
  isNetworkOffline: false,
  notConnectedSince: null as number | null,
  networkQuality: 'good',
  forceReconnect: vi.fn(),
  toggleAudio: vi.fn(() => true),
  toggleVideo: vi.fn(() => true),
  remoteMediaState: null as null | { muted: boolean; cameraOff: boolean; displayName?: string | null },
  sendMediaState: vi.fn(),
  sendCallEndedSignal: vi.fn(),
  cleanup: vi.fn(),
  updateDeviceStream: vi.fn(),
};

// Microfone/câmera ficam no hook (com a escolha guardada); aqui, estado simples.
vi.mock('@/hooks/useWebRTC', async () => {
  const React = await import('react');
  return {
    useWebRTC: vi.fn(() => {
      const [isMuted, setIsMuted] = React.useState(false);
      const [isCameraOff, setIsCameraOff] = React.useState(false);
      return {
        ...webrtcState,
        isMuted,
        isCameraOff,
        mediaChoiceReady: true,
        toggleAudio: () => {
          webrtcState.toggleAudio();
          setIsMuted((v) => !v);
        },
        toggleVideo: async () => {
          webrtcState.toggleVideo();
          setIsCameraOff((v) => !v);
        },
      };
    }),
  };
});
const transcription = vi.hoisted(() => ({ enabled: false, calls: [] as Array<{ sessionId: string; active: boolean; localStream: unknown }> }));
vi.mock('@/hooks/useCallTranscription', () => ({
  useCallTranscription: (opts: { sessionId: string; active: boolean; localStream: unknown }) => {
    transcription.calls.push(opts);
    return { transcriptionEnabled: transcription.enabled };
  },
}));
vi.mock('@/hooks/useAudioLevel', () => ({ useAudioLevel: () => ({ level: 0, speaking: false }) }));

const presence = { remotePresent: false, remoteLeftAt: null as number | null };
vi.mock('@/hooks/useCallPresence', () => ({ useCallPresence: () => presence }));
vi.mock('@/hooks/useParticipantHeartbeat', () => ({ useParticipantHeartbeat: () => ({}) }));
vi.mock('@/hooks/useRemoteAbsence', () => ({ useRemoteAbsence: () => 0 }));
vi.mock('@/hooks/useSharedCallTimer', () => ({
  useSharedCallTimer: (p: { timeLimit: number }) => ({ timeLeft: p.timeLimit, isPaused: true, started: false, loaded: true }),
}));
vi.mock('@/utils/session-validation', () => ({
  validateWebRTCSession: vi.fn().mockResolvedValue({}),
  SessionValidationError: class extends Error {},
}));
vi.mock('@/components/sos/VideoCallSettingsModal', () => ({ VideoCallSettingsModal: () => null }));
vi.mock('@/components/sos/PatientContextPanel', () => ({ default: () => <div data-testid="sos-context" /> }));
vi.mock('@/components/psychologist/PatientSessionHistory', () => ({
  PatientSessionHistory: () => <div data-testid="consultation-context" />,
}));
vi.mock('@/components/sos/FeedbackModal', () => ({
  FeedbackModal: (props: { userType: string }) => <div data-testid="feedback-modal" data-usertype={props.userType} />,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    update: chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
  });
  return {
    supabase: {
      from: vi.fn(() => builder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } }) },
    },
  };
});

const renderRoom = (props: Partial<Parameters<typeof VideoCallRoom>[0]> = {}) =>
  render(
    <MemoryRouter>
      <VideoCallRoom
        kind="consultation"
        sessionId="11111111-1111-4111-8111-111111111111"
        userType="psychologist"
        timeLimitSeconds={50 * 60}
        appointment={{ id: 'appt-1', scheduledAt: '2026-08-31T10:00:00Z', patientId: 'pat-1' }}
        onLeave={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );

// jsdom não toca vídeo.
Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() });

beforeEach(() => {
  webrtcState.callEndedBy = null;
  webrtcState.isConnected = false;
  webrtcState.remoteMediaState = null;
  webrtcState.localStream = fakeStream(['audio', 'video']);
  webrtcState.remoteStream = null;
  presence.remotePresent = false;
  presence.remoteLeftAt = null;
});

describe('VideoCallRoom — uma sala para o SOS e a consulta', () => {
  it('usa a mesma sala para os dois e muda só a duração', () => {
    const { unmount } = renderRoom();
    expect(screen.getByTestId('video-call-room')).toHaveAttribute('data-kind', 'consultation');
    expect(screen.getByTestId('call-timer')).toHaveTextContent('50:00');
    unmount();
    renderRoom({ kind: 'sos', timeLimitSeconds: 25 * 60, appointment: undefined, requestId: 'req-1' });
    expect(screen.getByTestId('video-call-room')).toHaveAttribute('data-kind', 'sos');
    expect(screen.getByTestId('call-timer')).toHaveTextContent('25:00');
  });

  it('passa o papel real de quem entrou para a conexão', () => {
    renderRoom({ userType: 'patient' });
    expect(vi.mocked(useWebRTC)).toHaveBeenCalledWith(expect.objectContaining({ userType: 'patient' }));
  });

  it('mostra o microfone desligado do outro lado ao lado do nome', () => {
    webrtcState.isConnected = true;
    webrtcState.remoteStream = fakeStream(['audio', 'video']);
    webrtcState.remoteMediaState = { muted: true, cameraOff: false, displayName: 'Ana Souza' };
    renderRoom();
    const remote = screen.getByTestId('remote-tile');
    expect(within(remote).getByText('Ana Souza')).toBeInTheDocument();
    expect(within(remote).getByLabelText('Microfone desligado')).toBeInTheDocument();
  });

  it('a miniatura mantém o vídeo montado ao desligar e religar a câmera', () => {
    renderRoom();
    const before = screen.getByTestId('self-tile-video');
    fireEvent.click(screen.getByRole('button', { name: 'Desativar câmera' }));
    const hidden = screen.getByTestId('self-tile-video');
    expect(hidden).toBe(before);
    expect(hidden.className).toContain('opacity-0');
    fireEvent.click(screen.getByRole('button', { name: 'Ativar câmera' }));
    expect(screen.getByTestId('self-tile-video')).toBe(before);
    expect(screen.getByTestId('self-tile-video').className).toContain('opacity-100');
  });

  it('psicólogo abre o contexto do paciente em tela dividida e fecha pelo X', () => {
    renderRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Contexto do paciente' }));
    expect(screen.getByRole('complementary', { name: 'Contexto do paciente' })).toBeInTheDocument();
    expect(screen.getByTestId('consultation-context')).toBeInTheDocument();
    expect(screen.getByTestId('remote-tile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar contexto do paciente' }));
    expect(screen.queryByRole('complementary', { name: 'Contexto do paciente' })).not.toBeInTheDocument();
  });

  it('no SOS o contexto mostra a triagem do pedido; o paciente não tem esse botão', () => {
    const { unmount } = renderRoom({ kind: 'sos', appointment: undefined, requestId: 'req-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Contexto do paciente' }));
    expect(screen.getByTestId('sos-context')).toBeInTheDocument();
    unmount();
    renderRoom({ kind: 'sos', appointment: undefined, requestId: 'req-1', userType: 'patient' });
    expect(screen.queryByRole('button', { name: 'Contexto do paciente' })).not.toBeInTheDocument();
  });

  it('não tem mais o diagnóstico da chamada', () => {
    renderRoom();
    expect(screen.queryByRole('button', { name: /diagn/i })).not.toBeInTheDocument();
  });

  it('avisa quem encerrou quando o outro lado sai', async () => {
    webrtcState.callEndedBy = { userId: 'x', userType: 'patient' };
    renderRoom();
    expect(await screen.findByTestId('call-ended')).toHaveTextContent('O paciente encerrou a consulta.');
    expect(screen.getByTestId('feedback-modal')).toHaveAttribute('data-usertype', 'psychologist');
  });

  it('mostra a queda do outro lado em vez de parecer travado', () => {
    presence.remoteLeftAt = Date.now() - 5000;
    renderRoom();
    expect(screen.getByTestId('connection-banner')).toHaveTextContent('O paciente perdeu a conexão');
  });

  it('atalhos do Meet: Ctrl+D microfone e Ctrl+E câmera', () => {
    renderRoom();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true }));
    });
    expect(webrtcState.toggleAudio).toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true }));
    });
    expect(webrtcState.toggleVideo).toHaveBeenCalled();
  });
});

describe('VideoCallRoom: transcrição', () => {
  beforeEach(() => {
    transcription.enabled = false;
    transcription.calls = [];
  });

  it('com o consentimento do paciente, os dois lados veem "Chamada sendo transcrita"', () => {
    transcription.enabled = true;
    webrtcState.isConnected = true;
    renderRoom();
    expect(screen.getByTestId('transcription-indicator')).toHaveTextContent('Chamada sendo transcrita');
    renderRoom({ userType: 'patient' });
    expect(screen.getAllByTestId('transcription-indicator')).toHaveLength(2);
  });

  it('sem consentimento, não há aviso', () => {
    renderRoom();
    expect(screen.queryByTestId('transcription-indicator')).not.toBeInTheDocument();
  });

  it('a captura só fica ativa com a chamada conectada, com o microfone desta pessoa', () => {
    renderRoom();
    expect(transcription.calls.at(-1)).toMatchObject({ sessionId: '11111111-1111-4111-8111-111111111111', active: false });
    webrtcState.isConnected = true;
    renderRoom();
    expect(transcription.calls.at(-1)).toMatchObject({ active: true, localStream: webrtcState.localStream });
  });
});
