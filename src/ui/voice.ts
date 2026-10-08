/* 音声入力(Web Speech API)。追加フォームとメモ欄で共用する */

interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string }
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function ctor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && !!ctor();
}

export const UNSUPPORTED_MSG = "このブラウザは音声入力に未対応です。キーボードのマイクをお使いください";

export function voiceErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください";
    case "no-speech": return "声が聞き取れませんでした。もう一度お試しください";
    case "audio-capture": return "マイクが見つかりませんでした";
    case "network": return "音声認識に接続できませんでした(オフラインかもしれません)";
    case "aborted": return "";
    default: return "音声入力でエラーが発生しました";
  }
}

export interface VoiceHandlers {
  /** 認識中の文字列(final=true で確定) */
  onText(text: string, final: boolean): void;
  onState(listening: boolean): void;
  onError(msg: string): void;
}

export class Voice {
  private rec: SpeechRecognitionLike | null = null;
  listening = false;
  constructor(private h: VoiceHandlers) {}

  toggle() { this.listening ? this.stop() : this.start(); }

  start() {
    const C = ctor();
    if (!C) { this.h.onError(UNSUPPORTED_MSG); return; }
    const rec = new C();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) this.h.onText(finalText + interim, false);
      else if (finalText) this.h.onText(finalText, true);
    };
    rec.onerror = (e) => { const m = voiceErrorMessage(e.error); if (m) this.h.onError(m); };
    rec.onend = () => { this.rec = null; this.set(false); };
    this.rec = rec;
    try {
      rec.start();
      this.set(true);
    } catch {
      this.rec = null;
      this.h.onError("音声入力を開始できませんでした");
    }
  }

  stop() {
    this.rec?.stop();
  }

  abort() {
    this.rec?.abort();
    this.rec = null;
    this.set(false);
  }

  private set(v: boolean) {
    if (this.listening === v) return;
    this.listening = v;
    this.h.onState(v);
  }
}
