import { useState, useCallback, useEffect } from 'react';
import { errorName, errorText } from '@/utils/errorMessage';

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

export interface MediaError {
  type: 'permission' | 'device' | 'constraint' | 'unknown';
  message: string;
  details?: string;
}

export const useMediaDeviceManager = () => {
  const [devices, setDevices] = useState<MediaDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load and enumerate available devices
  const loadDevices = useCallback(async (): Promise<MediaDevice[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mappedDevices = devices.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `${device.kind} ${device.deviceId.slice(0, 8)}...`,
        kind: device.kind as MediaDevice['kind']
      }));
      
      setDevices(mappedDevices);
      return mappedDevices;
    } catch (error) {
      console.error('❌ Error loading devices:', error);
      return [];
    }
  }, []);

  // Validate if a specific device exists and is available
  const validateDevice = useCallback(async (deviceId: string, kind: MediaDevice['kind']): Promise<boolean> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.deviceId === deviceId && device.kind === kind);
    } catch {
      return false;
    }
  }, []);

  // Get media stream with smart fallback
  const getMediaStream = useCallback(async (
    audioDeviceId?: string,
    videoDeviceId?: string
  ): Promise<{ stream: MediaStream; error?: MediaError }> => {
    console.log('🎥 Attempting to get media stream...', { audioDeviceId, videoDeviceId });

    // Sem câmera (negada, ausente ou em uso por outro app), a pessoa entra só
    // com o microfone em vez de ficar fora da consulta/SOS.
    const audioOnlyFallback = async (): Promise<{ stream: MediaStream; error: MediaError } | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        return {
          stream,
          error: {
            type: 'device',
            message: 'Câmera indisponível: você entrou só com áudio',
            details: 'A conversa continua normalmente. Para ligar a câmera, permita o acesso nas configurações do navegador.',
          },
        };
      } catch {
        return null;
      }
    };

    // First, try to get basic permissions.
    // IMPORTANT: the probe stream must be released immediately, otherwise every
    // media init / settings save leaks a camera+microphone capture.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      probe.getTracks().forEach((track) => track.stop());
    } catch (error: unknown) {
      console.error('❌ Permission check failed:', error);

      if (['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(errorName(error))) {
        const audioOnly = await audioOnlyFallback();
        if (audioOnly) return audioOnly;
      }

      if (errorName(error) === 'NotAllowedError') {
        return {
          stream: new MediaStream(),
          error: {
            type: 'permission',
            message: 'Permissão negada para o microfone',
            details: 'Sem o microfone não dá para conversar. Toque no cadeado ao lado do endereço do site (ou nas configurações do celular) e permita o microfone.'
          }
        };
      }
    }


    // Load available devices for validation
    const availableDevices = await loadDevices();
    
    // Validate requested devices
    const hasValidAudio = !audioDeviceId || availableDevices.some(d => d.deviceId === audioDeviceId && d.kind === 'audioinput');
    const hasValidVideo = !videoDeviceId || availableDevices.some(d => d.deviceId === videoDeviceId && d.kind === 'videoinput');

    // Build constraints with fallback strategy
    const getConstraints = (useExact: boolean) => {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      };

      // Add device constraints based on strategy
      if (useExact) {
        if (audioDeviceId && hasValidAudio) {
          audioConstraints.deviceId = { exact: audioDeviceId };
        }
        if (videoDeviceId && hasValidVideo) {
          videoConstraints.deviceId = { exact: videoDeviceId };
        }
      } else {
        if (audioDeviceId && hasValidAudio) {
          audioConstraints.deviceId = { ideal: audioDeviceId };
        }
        if (videoDeviceId && hasValidVideo) {
          videoConstraints.deviceId = { ideal: videoDeviceId };
        }
      }

      return {
        video: videoConstraints,
        audio: audioConstraints
      };
    };

    // Try with exact constraints first
    if (audioDeviceId || videoDeviceId) {
      try {
        const exactConstraints = getConstraints(true);
        console.log('🎯 Trying with exact device constraints:', exactConstraints);
        const stream = await navigator.mediaDevices.getUserMedia(exactConstraints);
        console.log('✅ Media stream obtained with exact constraints');
        return { stream };
      } catch (error: unknown) {
        console.warn('⚠️ Exact constraints failed, trying with ideal constraints:', errorName(error));
        
        if (errorName(error) === 'OverconstrainedError') {
          // Try with ideal constraints instead
          try {
            const idealConstraints = getConstraints(false);
            console.log('🎯 Trying with ideal device constraints:', idealConstraints);
            const stream = await navigator.mediaDevices.getUserMedia(idealConstraints);
            console.log('✅ Media stream obtained with ideal constraints');
            return { stream };
          } catch (idealError: unknown) {
            console.warn('⚠️ Ideal constraints also failed, falling back to default:', errorName(idealError));
          }
        }
      }
    }

    // Final fallback: Use default devices
    try {
      console.log('🔄 Falling back to default devices');
      const defaultConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(defaultConstraints);
      console.log('✅ Media stream obtained with default constraints');
      
      // If we had to fallback, show warning about device issues
      if (audioDeviceId || videoDeviceId) {
        return {
          stream,
          error: {
            type: 'device',
            message: 'Dispositivos selecionados não disponíveis',
            details: 'Usando dispositivos padrão. Verifique suas configurações.'
          }
        };
      }
      
      return { stream };
    } catch (error: unknown) {
      console.error('❌ All media constraints failed:', error);
      const audioOnly = await audioOnlyFallback();
      if (audioOnly) return audioOnly;
      
      let mediaError: MediaError = {
        type: 'unknown',
        message: 'Erro desconhecido ao acessar mídia'
      };

      switch (errorName(error)) {
        case 'NotFoundError':
          mediaError = {
            type: 'device',
            message: 'Nenhuma câmera ou microfone encontrado',
            details: 'Verifique se os dispositivos estão conectados'
          };
          break;
        case 'NotAllowedError':
          mediaError = {
            type: 'permission',
            message: 'Permissão negada para câmera e/ou microfone',
            details: 'Clique no ícone de câmera na barra de endereços e permita o acesso'
          };
          break;
        case 'NotReadableError':
          mediaError = {
            type: 'device',
            message: 'Dispositivos em uso por outro aplicativo',
            details: 'Feche outros aplicativos que possam estar usando câmera/microfone'
          };
          break;
        case 'OverconstrainedError':
          mediaError = {
            type: 'constraint',
            message: 'Configurações de mídia incompatíveis',
            details: 'Tente alterar as configurações de câmera e microfone'
          };
          break;
        default:
          mediaError.details = errorText(error);
      }

      return { stream: new MediaStream(), error: mediaError };
    }
  }, [loadDevices]);

  // Apply audio output device
  const setAudioOutputDevice = useCallback(async (deviceId: string, elements?: NodeListOf<HTMLAudioElement | HTMLVideoElement>) => {
    try {
      const targetElements = elements || document.querySelectorAll('audio, video');
      const promises = Array.from(targetElements).map(async (element) => {
        const anyElement = element;
        if (typeof anyElement.setSinkId === 'function') {
          try {
            await anyElement.setSinkId(deviceId);
            console.log('✅ Audio output device set for element');
          } catch (error) {
            console.warn('⚠️ Failed to set audio output for element:', error);
          }
        }
      });
      
      await Promise.all(promises);
      console.log('✅ Audio output device applied to all elements');
    } catch (error) {
      console.error('❌ Error setting audio output device:', error);
      throw error;
    }
  }, []);

  // Initialize by loading devices on mount
  useEffect(() => {
    loadDevices();
    
    // Listen for device changes
    const handleDeviceChange = () => {
      console.log('🔄 Media devices changed, reloading...');
      loadDevices();
    };
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadDevices]);

  return {
    devices,
    isLoading,
    loadDevices,
    validateDevice,
    getMediaStream,
    setAudioOutputDevice
  };
};