import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipBack, SkipForward, Clock, Loader2, Maximize2, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { soundsData } from "@/data/soundsData";
import AnimationSelector from "@/components/sounds/AnimationSelector";
import SoundAnimation, { type AnimationType } from "@/components/sounds/SoundAnimation";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { prefetchSounds } from "@/lib/soundPrefetch";

const SoundPlayer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { soundId, playlistId } = useParams<{ soundId: string; playlistId?: string }>();
  const startIndex = (location.state as { startIndex?: number } | null)?.startIndex ?? 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(600);
  const [selectedDuration, setSelectedDuration] = useState("10");
  const [selectedAnimation, setSelectedAnimation] = useState<AnimationType>("waves");
  const [currentSoundIndex, setCurrentSoundIndex] = useState(startIndex);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsControlsVisible, setFsControlsVisible] = useState(true);
  const fsInactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const { levelsRef, resume } = useAudioAnalyser(audioRef.current, {
    enabled: isPlaying,
  });


  const isPlaylist = playlistId !== undefined;
  let currentSound, playlist;

  if (isPlaylist) {
    playlist =
      soundsData.categories[playlistId as keyof typeof soundsData.categories]?.sounds ||
      soundsData.subcategories[playlistId as keyof typeof soundsData.subcategories]?.sounds ||
      [];
    currentSound = playlist[currentSoundIndex];
  } else {
    for (const category of Object.values(soundsData.categories)) {
      const found = category.sounds.find((s) => s.id === soundId);
      if (found) {
        currentSound = found;
        break;
      }
    }
    if (!currentSound) {
      for (const subcategory of Object.values(soundsData.subcategories)) {
        const found = subcategory.sounds.find((s) => s.id === soundId);
        if (found) {
          currentSound = found;
          break;
        }
      }
    }
  }

  const seekAudioToSessionTime = (sessionSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const audioDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!audioDuration) {
      pendingSeekRef.current = sessionSeconds;
      return;
    }

    const targetTime = sessionSeconds % audioDuration;
    audio.currentTime = Math.min(Math.max(targetTime, 0), Math.max(audioDuration - 0.05, 0));
    pendingSeekRef.current = null;
  };

  useEffect(() => {
    if (currentSound && audioRef.current) {
      const audio = audioRef.current;
      const targetSrc = new URL(currentSound.file, window.location.href).href;
      if (audio.src !== targetSrc) {
        setIsBuffering(true);
        setLoadProgress(0);
        setHasStarted(false);
        audio.src = currentSound.file;
      }
      audio.loop = true;
      audio.volume = 0.7;
      audio.onended = null;
      audio.onloadedmetadata = () => {
        seekAudioToSessionTime(pendingSeekRef.current ?? currentTime);
      };
      if (isPlayingRef.current) {
        void resume();
        audio.play().catch(() => {
          /* ignora AbortError e falhas de autoplay */
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSound?.id]);

  // Rastreia estado de carregamento do áudio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      try {
        if (audio.buffered.length && audio.duration) {
          const end = audio.buffered.end(audio.buffered.length - 1);
          setLoadProgress(Math.min(100, Math.round((end / audio.duration) * 100)));
        }
      } catch {
        /* noop */
      }
    };

    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => {
      setIsBuffering(false);
      updateProgress();
    };
    const onPlaying = () => {
      setIsBuffering(false);
      setHasStarted(true);
      // Prefetch apenas o próximo track da playlist (baixa prioridade),
      // depois que o atual já começou — evita competir por banda.
      if (isPlaylist && playlist && currentSoundIndex < playlist.length - 1) {
        const next = playlist[currentSoundIndex + 1];
        if (next?.file) prefetchSounds([next.file]);
      }
    };
    const onProgress = () => updateProgress();

    const onPause = () => {
      // Espelha pausas do elemento (ex.: browser interrompeu) para a UI.
      if (isPlayingRef.current) setIsPlaying(false);
    };
    const onPlayEvent = () => {
      // Se o usuário está com o player pausado mas algo (context resume,
      // rebuffer, race do play() promise) tentou retomar sozinho, cancela.
      if (!isPlayingRef.current) {
        try {
          audio.pause();
        } catch {
          /* noop */
        }
      }
    };

    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onWaiting);
    audio.addEventListener("loadstart", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("canplaythrough", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("loadeddata", onProgress);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlayEvent);

    return () => {
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onWaiting);
      audio.removeEventListener("loadstart", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("canplaythrough", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("loadeddata", onProgress);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlayEvent);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [currentSound?.id]);



  useEffect(() => {
    setDuration(parseInt(selectedDuration) * 60);
  }, [selectedDuration]);

  // Avanço da sessão via requestAnimationFrame (suave e preciso), com
  // sincronização em 'timeupdate' / 'loadedmetadata' do <audio> para
  // manter o ponteiro alinhado com a reprodução real.
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const shouldRun = isPlaying && !isScrubbing && currentTime < duration;
    if (!shouldRun) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = null;
      return;
    }

    const step = (now: number) => {
      const last = lastTickRef.current ?? now;
      const deltaSec = (now - last) / 1000;
      lastTickRef.current = now;
      setCurrentTime((prev) => Math.min(prev + deltaSec, duration));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [isPlaying, isScrubbing, duration, currentTime < duration]);

  // Tela bloqueada ou app em segundo plano: o requestAnimationFrame para,
  // mas o som continua. Antes o tempo da sessão congelava e o som de "Dormir"
  // tocava a noite inteira; agora o tempo corre pelo relógio de verdade e a
  // sessão termina na hora escolhida.
  useEffect(() => {
    if (!isPlaying || isScrubbing) return;
    let lastWall = Date.now();
    const onVisibility = () => {
      lastWall = Date.now();
      // Volta para a tela: o requestAnimationFrame recomeça do zero (sem contar o tempo de fundo duas vezes).
      if (document.visibilityState === "visible") lastTickRef.current = null;
    };
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastWall) / 1000;
      lastWall = now;
      if (document.visibilityState === "hidden") setCurrentTime((prev) => Math.min(prev + delta, duration));
    }, 1000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isPlaying, isScrubbing, duration]);

  // Faixas já ouvidas inteiras na playlist (para contar o tempo certo).
  const finishedTracksRef = useRef(0);
  const sessionIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  /** Sair antes: com 1 minuto ou mais ouvido, vai para "Como você se sente?" e conta o tempo. */
  const leave = () => {
    if (audioRef.current) audioRef.current.pause();
    const listened = finishedTracksRef.current * duration + currentTime;
    if (listened >= 60 && currentSound) {
      navigate("/sounds/feedback", {
        replace: true,
        state: {
          sound: currentSound,
          duration: String(Math.floor(listened / 60)),
          isPlaylist,
          totalSounds: finishedTracksRef.current + 1,
          sessionId: sessionIdRef.current,
        },
      });
      return;
    }
    navigate("/sounds");
  };

  // Fim de sessão / auto-advance de playlist.
  useEffect(() => {
    if (currentTime < duration) return;
    if (isPlaylist && playlist && currentSoundIndex < playlist.length - 1) {
      finishedTracksRef.current += 1;
      setCurrentSoundIndex((prev) => prev + 1);
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const totalPlayed = finishedTracksRef.current + 1;
    navigate("/sounds/feedback", {
      replace: true,
      state: {
        sound: currentSound,
        // Playlist: o tempo de todas as faixas ouvidas (antes contava só uma).
        duration: String(parseInt(selectedDuration) * totalPlayed),
        isPlaylist,
        totalSounds: totalPlayed,
        sessionId: sessionIdRef.current,
      },
    });
  }, [currentTime, duration, navigate, currentSound, selectedDuration, isPlaylist, playlist, currentSoundIndex]);

  // Sincroniza com eventos do <audio> para precisão fina do ponteiro.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const resyncFromAudio = () => {
      // Realinha o "drift" acumulado do rAF ao tick do áudio, sem forçar
      // grandes saltos — mantém o slider preciso durante a reprodução.
      lastTickRef.current = null;
    };
    audio.addEventListener("timeupdate", resyncFromAudio);
    audio.addEventListener("loadedmetadata", resyncFromAudio);
    return () => {
      audio.removeEventListener("timeupdate", resyncFromAudio);
      audio.removeEventListener("loadedmetadata", resyncFromAudio);
    };
  }, [currentSound?.id]);


  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        isPlayingRef.current = false;
        audioRef.current.pause();
      } else {
        isPlayingRef.current = true;
        void resume();
        audioRef.current.play().catch(console.error);
      }
    }
    setIsPlaying(!isPlaying);
  };

  const resetTimer = (autoPlay = false) => {
    setCurrentTime(0);
    isPlayingRef.current = autoPlay;
    setIsPlaying(autoPlay);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const nextTrack = () => {
    if (isPlaylist && playlist && currentSoundIndex < playlist.length - 1) {
      setCurrentSoundIndex((prev) => prev + 1);
      resetTimer(true);
    }
  };

  const prevTrack = () => {
    if (isPlaylist && currentSoundIndex > 0) {
      setCurrentSoundIndex((prev) => prev - 1);
      resetTimer(true);
    }
  };

  const formatTime = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };


  const commitSeek = (nextValue: number) => {
    const audio = audioRef.current;
    const wasPlaying = isPlaying;
    setCurrentTime(nextValue);
    setScrubValue(nextValue);
    setIsScrubbing(false);
    if (!audio) return;
    const applySeek = () => {
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (!d) {
        pendingSeekRef.current = nextValue;
        return;
      }
      const target = nextValue % d;
      try {
        audio.currentTime = Math.min(Math.max(target, 0), Math.max(d - 0.05, 0));
      } catch {
        pendingSeekRef.current = nextValue;
        return;
      }
      pendingSeekRef.current = null;
      if (wasPlaying && isPlayingRef.current) {
        void resume();
        audio.play().catch(() => {
          /* noop */
        });
      }
    };
    if (audio.readyState < 1) {
      pendingSeekRef.current = nextValue;
      const once = () => {
        audio.removeEventListener("loadedmetadata", once);
        applySeek();
      };
      audio.addEventListener("loadedmetadata", once);
    } else {
      applySeek();
    }
  };

  // Auto-hide dos controles em fullscreen (2.5s de inatividade)
  const bumpFsControls = () => {
    setFsControlsVisible(true);
    if (fsInactivityRef.current) clearTimeout(fsInactivityRef.current);
    fsInactivityRef.current = setTimeout(() => setFsControlsVisible(false), 2500);
  };

  useEffect(() => {
    if (!isFullscreen) {
      if (fsInactivityRef.current) clearTimeout(fsInactivityRef.current);
      setFsControlsVisible(true);
      return;
    }
    bumpFsControls();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (fsInactivityRef.current) clearTimeout(fsInactivityRef.current);
    };
  }, [isFullscreen]);


  if (!currentSound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">Som não encontrado</h2>
          <Button onClick={() => navigate("/sounds")}>Voltar à biblioteca</Button>
        </div>
      </div>
    );
  }

  const progressPct = (currentTime / duration) * 100;
  const isLoading = isBuffering && !hasStarted;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <PageHeader title={currentSound.name} onBack={leave} />


      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-between px-4 py-4 max-w-2xl w-full mx-auto">
        {/* Animation circle */}
        <div className="flex-1 min-h-0 flex items-center justify-center w-full py-2">
          <div className="relative aspect-square h-full max-h-[42vh] max-w-[42vh]">
            <SoundAnimation
              type={selectedAnimation}
              isPlaying={isPlaying}
              levelsRef={levelsRef}
              audioRef={audioRef}
              circular
            />
            {/* Overlay de carregamento antes do primeiro play — bloqueia interação */}
            {isLoading && (
              <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm text-white animate-fade-in z-20">
                <Loader2 className="w-9 h-9 animate-spin mb-3" />
                <p className="text-sm font-medium !text-white">Carregando som...</p>
                {loadProgress > 0 && (
                  <div className="mt-3 w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-200"
                      style={{ width: `${loadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {/* Indicador sutil de rebuffer durante a reprodução — apenas spinner */}
            {isBuffering && hasStarted && (
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none animate-fade-in z-10"
                aria-label="Carregando"
              >
                <div className="h-11 w-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/15">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                </div>
              </div>
            )}



          </div>
        </div>


        {/* Title */}
        <div className="text-center shrink-0">
          <h2 className="text-xl font-semibold text-foreground leading-tight">{currentSound.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{currentSound.category}</p>
        </div>

        {/* Progress + controls */}
        <div
          className={`w-full shrink-0 mt-3 space-y-2 transition-opacity ${
            isLoading ? "opacity-50 pointer-events-none" : ""
          }`}
          aria-disabled={isLoading}
        >
          <Slider
            value={[isScrubbing ? scrubValue : Math.min(currentTime, duration)]}
            max={duration}
            step={1}
            disabled={isLoading}
            onValueChange={(v) => {
              // Durante o arraste, apenas atualiza a UI — não busca no áudio
              // (evita rebuffer contínuo e drift do ponteiro).
              setIsScrubbing(true);
              setScrubValue(v[0]);
            }}
            onValueCommit={(v) => commitSeek(v[0])}
          />
          <div className="flex justify-between text-xs text-muted-foreground font-mono">
            <span>{formatTime(isScrubbing ? scrubValue : currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="relative flex items-center justify-center gap-3 pt-1">
            {isPlaylist && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={prevTrack}
                disabled={isLoading || currentSoundIndex === 0}
                className="rounded-full bg-muted/60 hover:bg-muted"
              >
                <SkipBack className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="icon-lg"
              disabled={isLoading}
              className="w-14 h-14 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground shadow-lg disabled:opacity-70 disabled:cursor-wait"
              onClick={togglePlay}
              aria-label={
                isLoading ? "Carregando som" : isPlaying ? "Pausar" : "Reproduzir"
              }
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </Button>

            {isPlaylist && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={nextTrack}
                disabled={isLoading || !playlist || currentSoundIndex === playlist.length - 1}
                className="rounded-full bg-muted/60 hover:bg-muted"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => setIsFullscreen(true)}
              aria-label="Maximizar"
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>

          </div>
        </div>




        {/* Animation + duration options */}
        <div
          className={`w-full shrink-0 mt-3 grid gap-2 transition-opacity ${
            isLoading ? "opacity-50 pointer-events-none" : ""
          }`}
          aria-disabled={isLoading}
        >
          <AnimationSelector selected={selectedAnimation} onChange={setSelectedAnimation} />
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={selectedDuration} onValueChange={setSelectedDuration} disabled={isLoading}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutos</SelectItem>
                <SelectItem value="10">10 minutos</SelectItem>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="20">20 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="45">45 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      </div>

      <audio
        ref={audioRef}
        preload="auto"
        // @ts-expect-error fetchpriority is a valid HTML attribute
        fetchpriority="high"
      />

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black animate-fade-in"
          onMouseMove={bumpFsControls}
          onTouchStart={bumpFsControls}
          onClick={bumpFsControls}
          style={{ cursor: fsControlsVisible ? "default" : "none" }}
        >
          {/* Animação de fundo em tela cheia */}
          <div className="absolute inset-0">
            <SoundAnimation
              type={selectedAnimation}
              isPlaying={isPlaying}
              levelsRef={levelsRef}
              audioRef={audioRef}
            />
          </div>

          {/* Camada de controles com fade */}
          <div
            className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
              fsControlsVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* Gradientes para legibilidade */}
            <div className="absolute top-0 inset-x-0 h-24 bg-black/40" />
            <div className="absolute bottom-0 inset-x-0 h-40 bg-black/50" />

            {/* Botão fechar */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(false);
              }}
              aria-label="Fechar"
              className="pointer-events-auto absolute top-5 right-5 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white flex items-center justify-center ring-1 ring-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Título */}
            <div className="absolute top-5 left-6 pointer-events-none">
              <h3 className="text-lg font-semibold leading-tight text-white">{currentSound.name}</h3>
              <p className="text-xs text-white/70 mt-0.5">{currentSound.category}</p>
            </div>

            {/* Controles inferiores */}
            <div className="pointer-events-auto absolute bottom-8 inset-x-0 px-6 max-w-3xl mx-auto space-y-3">
              <Slider
                value={[isScrubbing ? scrubValue : Math.min(currentTime, duration)]}
                max={duration}
                step={1}
                onValueChange={(v) => {
                  setIsScrubbing(true);
                  setScrubValue(v[0]);
                }}
                onValueCommit={(v) => commitSeek(v[0])}
              />
              <div className="flex justify-between text-xs text-white/80 font-mono">
                <span>{formatTime(isScrubbing ? scrubValue : currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="flex items-center justify-center gap-4 pt-1">
                {isPlaylist && (
                  <button
                    type="button"
                    onClick={prevTrack}
                    disabled={currentSoundIndex === 0}
                    aria-label="Anterior"
                    className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white flex items-center justify-center ring-1 ring-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={isBuffering && !hasStarted}
                  aria-label={isPlaying ? "Pausar" : "Reproduzir"}
                  className="h-16 w-16 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-70 disabled:cursor-wait transition-colors"
                >
                  {isBuffering && !hasStarted ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6 ml-0.5" />
                  )}
                </button>
                {isPlaylist && (
                  <button
                    type="button"
                    onClick={nextTrack}
                    disabled={!playlist || currentSoundIndex === playlist.length - 1}
                    aria-label="Próximo"
                    className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white flex items-center justify-center ring-1 ring-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SoundPlayer;
