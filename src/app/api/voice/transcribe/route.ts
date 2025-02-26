import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SUPPORTED_FORMATS = ['audio/mp3', 'audio/wav', 'audio/mpeg', 'audio/webm', 'audio/mp4'];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | Blob;
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Log the incoming audio format for debugging
    console.log('Incoming audio format:', audioFile.type);

    // Convert audio/webm;codecs=opus to audio/webm
    let fileToTranscribe: File | Blob = audioFile;
    if (audioFile.type === 'audio/webm;codecs=opus') {
      fileToTranscribe = new File([audioFile], 'audio.webm', { type: 'audio/webm' });
    }
    
    // Ensure fileToTranscribe is a File with required properties
    if (!(fileToTranscribe instanceof File)) {
      fileToTranscribe = new File([fileToTranscribe], 'audio.webm', { type: fileToTranscribe.type });
    }

    try {
      const transcription = await openai.audio.transcriptions.create({
        file: fileToTranscribe as File,
        model: 'whisper-1',
        language: 'en',
        response_format: 'json'
      });

      return NextResponse.json({ text: transcription.text });
    } catch (error: any) {
      console.error('OpenAI transcription error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to transcribe audio' },
        { status: error.status || 500 }
      );
    }
  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process audio' },
      { status: 500 }
    );
  }
}

// Function to convert AudioBuffer to WAV format
function audioBufferToWav(buffer: AudioBuffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2;
  const sampleRate = buffer.sampleRate;
  const wavDataView = new DataView(new ArrayBuffer(44 + length));

  // Write WAV header
  writeString(wavDataView, 0, 'RIFF');
  wavDataView.setUint32(4, 36 + length, true);
  writeString(wavDataView, 8, 'WAVE');
  writeString(wavDataView, 12, 'fmt ');
  wavDataView.setUint32(16, 16, true);
  wavDataView.setUint16(20, 1, true);
  wavDataView.setUint16(22, numOfChan, true);
  wavDataView.setUint32(24, sampleRate, true);
  wavDataView.setUint32(28, sampleRate * numOfChan * 2, true);
  wavDataView.setUint16(32, numOfChan * 2, true);
  wavDataView.setUint16(34, 16, true);
  writeString(wavDataView, 36, 'data');
  wavDataView.setUint32(40, length, true);

  // Write audio data
  const channels = [];
  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      wavDataView.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return wavDataView.buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
} 