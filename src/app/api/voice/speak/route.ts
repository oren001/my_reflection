import { NextResponse } from 'next/server';

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY || 'YOUR_API_KEY';

// Default voice until we have a cloned one (Rachel - friendly female voice)
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice ID

export async function POST(req: Request) {
  try {
    const { text, voiceId } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Generate speech using ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId === 'default' ? DEFAULT_VOICE : voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVEN_LABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_monolingual_v1",  // Faster model, English only
          voice_settings: {
            stability: 0.25,
            similarity_boost: 0.75,
            style: 0.35,
            use_speaker_boost: true
          },
          optimize_streaming_latency: 3  // Maximum optimization for streaming
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('ElevenLabs API error:', errorData);
      throw new Error(errorData.detail?.message || 'Failed to generate speech');
    }

    // Stream the audio back to the client
    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    return new NextResponse(response.body, { headers });
  } catch (error) {
    console.error('Speech generation error:', error);
    
    // Try fallback to Web Speech API
    return NextResponse.json({
      error: 'Failed to generate speech. Using browser\'s built-in speech synthesis as fallback.',
      useWebSpeech: true
    }, { status: 500 });
  }
} 