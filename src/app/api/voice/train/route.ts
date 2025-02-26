import { NextResponse } from 'next/server';

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY || 'YOUR_API_KEY';

// Default voice until we have a cloned one (Rachel - friendly female voice)
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice ID

// Keep track of training sessions and voice IDs
const trainingSessions: { [key: string]: any } = {};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFiles = formData.getAll('audioFiles');
    const name = formData.get('name') || 'My Voice';
    const isBackground = formData.get('isBackground') === 'true';
    const sessionNumber = parseInt(formData.get('sessionNumber')?.toString() || '1');

    // If no audio files are provided, return the default voice
    if (audioFiles.length === 0) {
      // Try to get existing voice ID from storage first
      const lastTrainedVoiceId = formData.get('lastTrainedVoiceId');
      
      if (lastTrainedVoiceId) {
        try {
          // Verify the voice still exists
          const response = await fetch(`https://api.elevenlabs.io/v1/voices/${lastTrainedVoiceId}`, {
            headers: {
              'Accept': 'application/json',
              'xi-api-key': ELEVEN_LABS_API_KEY,
            },
          });
          
          if (response.ok) {
            const voice = await response.json();
            return NextResponse.json({
              voices: [{
                voice_id: voice.voice_id,
                name: voice.name
              }],
              selected_voice: {
                voice_id: voice.voice_id,
                name: voice.name
              }
            });
          }
        } catch (error) {
          console.error('Error verifying existing voice:', error);
        }
      }
      
      // If no existing voice or verification failed, return default voice
      return NextResponse.json({
        voices: [{
          voice_id: DEFAULT_VOICE,
          name: "Rachel (Default Voice)"
        }],
        selected_voice: {
          voice_id: DEFAULT_VOICE,
          name: "Rachel (Default Voice)"
        }
      });
    }

    // Create a voice clone with ElevenLabs
    const apiFormData = new FormData();
    apiFormData.append('name', `${name} (Session ${sessionNumber})`);
    apiFormData.append('description', `Progressive voice training - Session ${sessionNumber}`);
    
    // Add all audio files
    audioFiles.forEach((file: any) => {
      apiFormData.append('files', file);
    });

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': ELEVEN_LABS_API_KEY,
      },
      body: apiFormData as unknown as BodyInit
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail?.message || 'Failed to clone voice');
    }

    // Store this session's data
    trainingSessions[sessionNumber] = {
      voice_id: data.voice_id,
      name: `${name} (Session ${sessionNumber})`,
      created_at: new Date().toISOString()
    };

    return NextResponse.json({
      voice_id: data.voice_id,
      name: `${name} (Session ${sessionNumber})`,
      message: isBackground 
        ? `Voice training session ${sessionNumber} completed`
        : "Voice training completed! Your voice clone is ready to use.",
      session: sessionNumber
    });

  } catch (error) {
    console.error('Voice cloning error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clone voice' },
      { status: 500 }
    );
  }
} 