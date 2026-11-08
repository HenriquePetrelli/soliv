import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Settings, Mic, Camera, Volume2, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useMediaDeviceManager } from '@/hooks/useMediaDeviceManager';

interface VideoCallSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  localStream: MediaStream | null;
  peerConnection?: RTCPeerConnection | null;
  localVideoRef?: React.RefObject<HTMLVideoElement>;
  onStreamUpdate?: (stream: MediaStream) => void;
  onDeviceStreamUpdate?: (stream: MediaStream) => void;
}

export const VideoCallSettingsModal = ({ 
  isOpen, 
  onClose, 
  localStream, 
  peerConnection = null,
  localVideoRef,
  onStreamUpdate,
  onDeviceStreamUpdate 
}: VideoCallSettingsModalProps) => {
  const { toast } = useToast();
  const { preferences, savePreferences, isLoading: preferencesLoading } = useUserPreferences();
  const mediaManager = useMediaDeviceManager();
  
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [selectedAudioOutputDevice, setSelectedAudioOutputDevice] = useState('');
  const [tempAudioDevice, setTempAudioDevice] = useState('');
  const [tempVideoDevice, setTempVideoDevice] = useState('');
  const [tempAudioOutputDevice, setTempAudioOutputDevice] = useState('');
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingDevices, setIsTestingDevices] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDevices();
      setCurrentStream(localStream);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [isOpen, localStream]);

  // Load saved preferences when modal opens or set current devices
  useEffect(() => {
    if (isOpen && !preferencesLoading) {
      if (preferences) {
        // Use saved preferences if available
        const micId = preferences.mic_device_id || '';
        const cameraId = preferences.camera_device_id || '';
        const speakerId = preferences.speaker_device_id || '';
        
        setSelectedAudioDevice(micId);
        setSelectedVideoDevice(cameraId);
        setSelectedAudioOutputDevice(speakerId);
        setTempAudioDevice(micId);
        setTempVideoDevice(cameraId);
        setTempAudioOutputDevice(speakerId);
      } else {
        // Detect current devices from the stream
        if (localStream) {
          const audioTrack = localStream.getAudioTracks()[0];
          const videoTrack = localStream.getVideoTracks()[0];
          
          let micId = '';
          let cameraId = '';
          
          if (audioTrack) {
            const audioSettings = audioTrack.getSettings();
            if (audioSettings.deviceId) {
              micId = audioSettings.deviceId;
            }
          }
          
          if (videoTrack) {
            const videoSettings = videoTrack.getSettings();
            if (videoSettings.deviceId) {
              cameraId = videoSettings.deviceId;
            }
          }
          
          setSelectedAudioDevice(micId);
          setSelectedVideoDevice(cameraId);
          setTempAudioDevice(micId);
          setTempVideoDevice(cameraId);
        }
      }
    }
  }, [isOpen, preferencesLoading, preferences, localStream]);

  const loadDevices = async () => {
    try {
      await mediaManager.loadDevices();
      const devices = mediaManager.devices;
      
      // Radix Select rejects empty string values; devices without an id
      // (permissions not granted yet) must be filtered out.
      const audioInputs = devices.filter(device => device.kind === 'audioinput' && !!device.deviceId);
      const videoInputs = devices.filter(device => device.kind === 'videoinput' && !!device.deviceId);
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput' && !!device.deviceId);
      
      setAudioDevices(audioInputs as MediaDeviceInfo[]);
      setVideoDevices(videoInputs as MediaDeviceInfo[]);
      setAudioOutputDevices(audioOutputs as MediaDeviceInfo[]);
      
      // Set first available devices as fallback if no current device detected
      if (!selectedAudioDevice && audioInputs.length > 0) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
        setTempAudioDevice(audioInputs[0].deviceId);
      }
      if (!selectedVideoDevice && videoInputs.length > 0) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
        setTempVideoDevice(videoInputs[0].deviceId);
      }
      if (!selectedAudioOutputDevice && audioOutputs.length > 0) {
        setSelectedAudioOutputDevice(audioOutputs[0].deviceId);
        setTempAudioOutputDevice(audioOutputs[0].deviceId);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      toast({
        title: 'Erro ao carregar dispositivos',
        description: 'Não foi possível listar os dispositivos de mídia disponíveis.',
        variant: 'destructive',
      });
    }
  };

  const handleAudioDeviceChange = (deviceId: string) => {
    setTempAudioDevice(deviceId);
  };

  const handleVideoDeviceChange = (deviceId: string) => {
    setTempVideoDevice(deviceId);
  };

  const handleAudioOutputDeviceChange = (deviceId: string) => {
    setTempAudioOutputDevice(deviceId);
  };

  const handleCancel = () => {
    // Reset temp values to original values
    setTempAudioDevice(selectedAudioDevice);
    setTempVideoDevice(selectedVideoDevice);
    setTempAudioOutputDevice(selectedAudioOutputDevice);
    onClose();
  };

  const testDevicesAndSave = async () => {
    setIsTestingDevices(true);
    setIsSaving(true);
    
    try {
      // Test the selected devices before saving
      console.log('🧪 Testing selected devices...');
      
      const testResult = await mediaManager.getMediaStream(
        tempAudioDevice || undefined,
        tempVideoDevice || undefined
      );

      if (testResult.error && testResult.error.type === 'permission') {
        toast({
          title: 'Erro de Permissão',
          description: testResult.error.message,
          variant: 'destructive',
        });
        return false;
      }

      if (testResult.error && testResult.error.type !== 'device') {
        toast({
          title: 'Erro nos Dispositivos',
          description: testResult.error.message,
          variant: 'destructive', 
        });
        return false;
      }

      // If we got here, the devices work (even if with warnings)
      if (testResult.error && testResult.error.type === 'device') {
        toast({
          title: 'Aviso',
          description: testResult.error.message,
          variant: 'default',
        });
      }

      console.log('✅ Device test successful, proceeding to save and apply...');

      // Apply changes in real time to current call
      const updatedStream = testResult.stream;
      
      if (tempAudioOutputDevice) {
        try {
          await mediaManager.setAudioOutputDevice(tempAudioOutputDevice);
        } catch (error) {
          console.warn('⚠️ Failed to set audio output:', error);
        }
      }
      
      // Update stream and notify parent
      if (updatedStream && onStreamUpdate) {
        onStreamUpdate(updatedStream);
        setCurrentStream(updatedStream);
      }

      // Notify for device stream update (for WebRTC peer connection)
      if (updatedStream && onDeviceStreamUpdate) {
        onDeviceStreamUpdate(updatedStream);
      }

      // Update the actual selected values
      setSelectedAudioDevice(tempAudioDevice);
      setSelectedVideoDevice(tempVideoDevice);
      setSelectedAudioOutputDevice(tempAudioOutputDevice);

      // Persist to Supabase
      const success = await savePreferences({
        mic_device_id: tempAudioDevice || null,
        camera_device_id: tempVideoDevice || null,
        speaker_device_id: tempAudioOutputDevice || null,
      });

      if (success) {
        toast({ title: 'Configurações aplicadas' });
        onClose();
        return true;
      } else {
        throw new Error('Falha ao salvar preferências');
      }
    } catch (error) {
      console.error('Error testing/saving settings:', error);
      toast({
        title: 'Erro ao aplicar configurações',
        description: 'Não foi possível testar ou aplicar as configurações selecionadas.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsTestingDevices(false);
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-background text-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings className="w-5 h-5" />
            Configurações da chamada
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Device Status Indicator */}
          {isTestingDevices && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-foreground">Testando dispositivos selecionados...</span>
            </div>
          )}

          {/* Device Error Warnings */}
          {(!audioDevices.length || !videoDevices.length) && (
            <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm text-warning-foreground">
                {!audioDevices.length && 'Nenhum microfone detectado. '}
                {!videoDevices.length && 'Nenhuma câmera detectada. '}
                Verifique se os dispositivos estão conectados.
              </span>
            </div>
          )}
          {/* Audio Device Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Mic className="w-4 h-4" />
              Microfone
            </Label>
            <Select value={tempAudioDevice} onValueChange={handleAudioDeviceChange}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecionar microfone" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground border-border z-50">
                {audioDevices.map((device) => (
                  <SelectItem 
                    key={device.deviceId} 
                    value={device.deviceId}
                  >
                    {device.label || `Microfone ${device.deviceId.slice(0, 8)}...`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Video Device Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Camera className="w-4 h-4" />
              Câmera
            </Label>
            <Select value={tempVideoDevice} onValueChange={handleVideoDeviceChange}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecionar câmera" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground border-border z-50">
                {videoDevices.map((device) => (
                  <SelectItem 
                    key={device.deviceId} 
                    value={device.deviceId}
                  >
                    {device.label || `Câmera ${device.deviceId.slice(0, 8)}...`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Audio Output Device Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Volume2 className="w-4 h-4" />
              Alto-falante
            </Label>
            <Select value={tempAudioOutputDevice} onValueChange={handleAudioOutputDeviceChange}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecionar alto-falante" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground border-border z-50">
                {audioOutputDevices.map((device) => (
                  <SelectItem 
                    key={device.deviceId} 
                    value={device.deviceId}
                  >
                    {device.label || `Alto-falante ${device.deviceId.slice(0, 8)}...`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button 
            variant="outline" 
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button 
            onClick={testDevicesAndSave}
            disabled={isSaving || preferencesLoading || isTestingDevices}
          >
            {isSaving || isTestingDevices ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isTestingDevices ? 'Testando...' : 'Salvando...'}
              </>
            ) : (
              'Testar e Salvar'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};