"""Offline only: model download is a separate explicit setup command."""
import os, sys, json, re, wave
import numpy as np
from pathlib import Path
from faster_whisper import WhisperModel

root = Path(__file__).resolve().parents[1]
request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
cfg = json.loads((root / 'config/studio.json').read_text(encoding='utf-8'))
model_dir = root / 'models' / cfg['model']
if not (model_dir / 'model.bin').exists():
    raise RuntimeError('Modelo local ausente. Ejecuta npm run model:tiny. No se descarga durante el análisis.')
model = WhisperModel(str(model_dir), device=cfg['transcriptionDevice'], compute_type=cfg['computeType'], cpu_threads=min(12, os.cpu_count() or 4), local_files_only=True)
with wave.open(request['audio'], 'rb') as wav:
    if wav.getnchannels()!=1 or wav.getframerate()!=16000 or wav.getsampwidth()!=2:
        raise RuntimeError('Se requiere PCM16 mono de 16 kHz del preprocesador FFmpeg')
    audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32)/32768
segments, info = model.transcribe(audio, language=None if request['language']=='auto' else request['language'], word_timestamps=True, vad_filter=True, condition_on_previous_text=False, beam_size=5, hotwords=', '.join(cfg['dictionary']))
result=[]
for segment in segments:
    # Never add prompted vocabulary to the output. Corrections are explicit whole-word substitutions.
    words=[]
    for word in segment.words or []:
        text=word.word
        for old,new in cfg.get('corrections', {}).items():
            text=re.sub(r'(?<!\w)'+re.escape(old)+r'(?!\w)',new,text,flags=re.I)
        words.append({'start':word.start,'end':word.end,'word':text,'probability':word.probability})
    result.append({'start':segment.start,'end':segment.end,'text':''.join(w['word'] for w in words).strip() if words else segment.text.strip(),'words':words})
    print(f'Transcrito {segment.end:.1f}s', file=sys.stderr, flush=True)
Path(request['output']).write_text(json.dumps({'language':info.language,'segments':result},ensure_ascii=False),encoding='utf-8')
