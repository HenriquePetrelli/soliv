import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmationModal from '@/components/sos/ConfirmationModal';
import { takeSosChannel } from '@/lib/sosChannel';
import {
  bytesToBase64,
  downsample,
  encodeWav,
  groupTranscript,
  rms,
  saveSosTranscriptionConsent,
  takeSosTranscriptionConsent,
} from '@/lib/callTranscription';

beforeEach(() => sessionStorage.clear());

describe('transcrição: consentimento na confirmação do SOS', () => {
  const renderModal = () => {
    const onConfirm = vi.fn();
    render(<ConfirmationModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    return onConfirm;
  };
  const callButton = () => screen.getByRole('button', { name: 'Sim, chamar um psicólogo' });

  it('por vídeo, não chama sem o consentimento', () => {
    const onConfirm = renderModal();
    expect(screen.getByTestId('transcription-consent')).toBeInTheDocument();
    expect(callButton()).toBeDisabled();
    fireEvent.click(callButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('com o consentimento marcado, chama e leva o consentimento para o pedido', () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('checkbox', { name: /transcrito/ }));
    expect(callButton()).toBeEnabled();
    fireEvent.click(callButton());
    expect(onConfirm).toHaveBeenCalled();
    expect(takeSosTranscriptionConsent()).toBe(true);
    expect(takeSosTranscriptionConsent()).toBe(false);
  });

  it('por mensagem não pede consentimento (a conversa já é escrita)', () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('radio', { name: 'Por mensagem' }));
    expect(screen.queryByTestId('transcription-consent')).not.toBeInTheDocument();
    fireEvent.click(callButton());
    expect(onConfirm).toHaveBeenCalled();
    expect(takeSosChannel()).toBe('text');
    expect(takeSosTranscriptionConsent()).toBe(false);
  });

  it('marcar no vídeo e trocar para mensagem não leva consentimento', () => {
    renderModal();
    fireEvent.click(screen.getByRole('checkbox', { name: /transcrito/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Por mensagem' }));
    fireEvent.click(callButton());
    expect(takeSosTranscriptionConsent()).toBe(false);
  });

  it('sem nada guardado, não há consentimento', () => {
    expect(takeSosTranscriptionConsent()).toBe(false);
    saveSosTranscriptionConsent(false);
    expect(takeSosTranscriptionConsent()).toBe(false);
  });
});

describe('transcrição: áudio', () => {
  it('gera WAV PCM 16 bits mono com cabeçalho correto', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
    const view = new DataView(wav.buffer);
    const text = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(wav.length).toBe(52);
  });

  it('reduz 48 kHz para 16 kHz (1/3 das amostras)', () => {
    const out = downsample(new Float32Array(48000).fill(0.25), 48000, 16000);
    expect(out.length).toBe(16000);
    expect(out[100]).toBeCloseTo(0.25);
  });

  it('silêncio tem RMS zero; voz não', () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5);
  });

  it('base64 de blocos grandes bate com o original', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    const decoded = Uint8Array.from(atob(bytesToBase64(bytes)), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });

  it('falas seguidas da mesma pessoa viram um bloco', () => {
    const grouped = groupTranscript([
      { speaker_role: 'patient', started_at: '2026-11-20T10:00:00Z', content: 'Oi.' },
      { speaker_role: 'patient', started_at: '2026-11-20T10:00:30Z', content: 'Estou ansioso.' },
      { speaker_role: 'psychologist', started_at: '2026-11-20T10:01:00Z', content: 'Entendo.' },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].content).toBe('Oi. Estou ansioso.');
  });
});
