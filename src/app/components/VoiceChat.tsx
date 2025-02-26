'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';

// Add type declaration at the top of the file after imports
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const TRAINING_PROMPTS = [
  "The quick brown fox jumps over the lazy dog. I believe in taking my time to articulate clearly and speak with proper emphasis on each word.",
  "In a world of rushing through conversations, I prefer to speak deliberately and thoughtfully. Each word carries meaning, and clarity is essential for effective communication.",
  "Voice technology fascinates me because it bridges the gap between human expression and digital interaction. The nuances of speech, from pitch to pace, create a unique signature.",
  "When I record my voice, I make sure to speak naturally, as if having a conversation with a friend. This helps capture the authentic qualities of my speech patterns.",
  "Professional voice artists know the importance of proper breathing and pacing. Taking pauses between phrases helps maintain clarity and allows for better voice recognition.",
  "The rain in Spain stays mainly in the plain. This classic phrase helps capture both the melodic and rhythmic aspects of speech, while exercising different sound combinations.",
  "Expressing emotions through voice requires varying both tone and tempo. Sometimes I speak softly and slowly, other times with more energy and enthusiasm.",
  "Good morning! How are you today? Simple greetings can reveal a lot about voice personality when spoken with genuine warmth and natural inflection."
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
}

interface TrainingLog {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}

// Add training session counter constant
const MAX_TRAINING_SESSIONS = 5;
const SAMPLES_PER_SESSION = 5;

export default function VoiceChat() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [trainingSamples, setTrainingSamples] = useState<Blob[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<Array<{voice_id: string, name: string}>>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');
  const [trainingSession, setTrainingSession] = useState(1);
  const [totalRecordings, setTotalRecordings] = useState(0);
  const [isTrainingInBackground, setIsTrainingInBackground] = useState(false);
  const [trainingLogs, setTrainingLogs] = useState<TrainingLog[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initRetries, setInitRetries] = useState(0);
  const MAX_RETRIES = 3;
  const [transcriptionRetries, setTranscriptionRetries] = useState(0);
  const MAX_TRANSCRIPTION_RETRIES = 5;
  const [isTranscriptionFailed, setIsTranscriptionFailed] = useState(false);
  const [readyToSwitchVoice, setReadyToSwitchVoice] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [micDebugInfo, setMicDebugInfo] = useState<string>('Initializing...');
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [baselineNoiseLevel, setBaselineNoiseLevel] = useState<number>(0);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(true);
  const calibrationSamplesRef = useRef<number[]>([]);
  const CALIBRATION_SAMPLES = 30; // Number of samples to collect for calibration
  const [persistedRecordings, setPersistedRecordings] = useState<Blob[]>([]);
  const [hasLoadedRecordings, setHasLoadedRecordings] = useState(false);
  const hasLoggedLoadingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [backgroundRecordings, setBackgroundRecordings] = useState<Blob[]>([]);
  const [hasEnoughRecordings, setHasEnoughRecordings] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    initializeVoice();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Check if we have enough recordings to start training
    if (backgroundRecordings.length >= SAMPLES_PER_SESSION && !isTrainingInBackground && !isTrainingMode) {
      setHasEnoughRecordings(true);
      // Only start training if we're past the welcome message and have recordings
      if (hasShownWelcome) {
        startBackgroundTraining();
      }
    }
  }, [backgroundRecordings, isTrainingInBackground, isTrainingMode, hasShownWelcome]);

  useEffect(() => {
    if (!hasShownWelcome && voiceId) {
      const welcomeMessage: Message = {
        role: 'assistant',
        content: "Hello! I'm Guenka. I'll start with my voice and learn to speak like you."
      };
      setMessages([welcomeMessage]);
      setHasShownWelcome(true);

      // Play welcome message with default voice
      fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: welcomeMessage.content, 
          voiceId
        }),
      })
      .then(response => response.blob())
      .then(audioBlob => playResponse(audioBlob))
      .catch(error => console.error('Error playing welcome message:', error));
    }
  }, [hasShownWelcome, voiceId]);

  useEffect(() => {
    const loadPersistedRecordings = async () => {
      if (hasLoadedRecordings) return; // Skip if already loaded
      
      try {
        const recordings = await loadRecordingsFromStorage();
        if (recordings.length > 0) {
          setPersistedRecordings(recordings);
          if (!hasLoggedLoadingRef.current) {
            addTrainingLog(`Loaded ${recordings.length} previous recordings from storage`, 'info');
            hasLoggedLoadingRef.current = true;
          }
          setHasLoadedRecordings(true);
        }
      } catch (error) {
        console.error('Error loading recordings:', error);
      }
    };

    loadPersistedRecordings();
  }, [hasLoadedRecordings]);

  const initializeVoice = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      setMicDebugInfo('Initializing voice and audio devices...');
      
      // First check if we have microphone permission
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permissionStatus.state === 'denied') {
        throw new Error('Microphone permission denied. Please allow microphone access in your browser settings.');
      }

      // Get audio devices first
      await getAvailableDevices();
      setMicDebugInfo('Audio devices initialized. Setting up voice...');

      // Initialize voice service
      const response = await fetch('/api/voice/train', {
        method: 'POST',
        body: new FormData(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initialize voice service');
      }

      const data = await response.json();
      setAvailableVoices(data.voices);
      setVoiceId(data.selected_voice.voice_id);
      setVoiceName(data.selected_voice.name);
      setInitRetries(0);
      setMicDebugInfo('Ready to record');

    } catch (error) {
      console.error('Voice initialization error:', error);
      setMicDebugInfo('Initialization failed. Retrying...');
      
      if (initRetries < MAX_RETRIES) {
        setInitRetries(prev => prev + 1);
        // Exponential backoff for retries
        const retryDelay = Math.pow(2, initRetries) * 1000;
        setError(`Initialization failed. Retrying in ${retryDelay/1000} seconds...`);
        setTimeout(() => {
          initializeVoice();
        }, retryDelay);
      } else {
        setError('Unable to initialize. Please check your microphone permissions and refresh the page.');
        setMicDebugInfo('Initialization failed. Please refresh the page.');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const selectVoice = (voice_id: string, name: string) => {
    setVoiceId(voice_id);
    setVoiceName(name);
    setIsTrainingMode(false);
  };

  // Function to detect silence
  const detectSilence = useCallback((analyser: AnalyserNode, threshold = -50, duration = 500) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceStart = Date.now();
    
    const checkSilence = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const dB = 20 * Math.log10(average / 255);
      
      if (dB < threshold) {
        if (Date.now() - silenceStart >= duration) {
          setIsListening(false);
        }
      } else {
        silenceStart = Date.now();
      }
      
      if (isListening) {
        requestAnimationFrame(checkSilence);
      }
    };
    
    checkSilence();
  }, [isListening]);

  const stopCurrentAudio = () => {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.onended = null;
        currentAudio.oncanplaythrough = null;
        currentAudio.onerror = null;
        setCurrentAudio(null);
      }
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    } catch (error) {
      console.error('Error stopping audio:', error);
    }
  };

  const startRecording = async () => {
    try {
      // Stop any playing audio first
      stopCurrentAudio();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        } 
      });

      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          if (chunks.length === 0) {
            console.log('No audio data recorded');
            return;
          }

          const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
          const formData = new FormData();
          formData.append('audio', audioBlob);

          await processAudioInput(audioBlob, formData);
        } catch (error) {
          console.error('Error processing audio:', error);
          setError('Failed to process audio. Please try again.');
        }
      };

      setMediaRecorder(mediaRecorder);
      setMediaStream(stream);
      setIsRecording(true);
      setError(null);

      // Start recording
      mediaRecorder.start(100);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to start recording. Please check your microphone permissions.');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      if (!mediaRecorder || !mediaStream) {
        console.warn('No active recording to stop');
        return;
      }

      // Stop the media recorder
      mediaRecorder.stop();
      
      // Stop all tracks in the media stream
      mediaStream.getTracks().forEach(track => {
        track.stop();
      });
      
      setMediaStream(null);
      setMediaRecorder(null);
      setIsRecording(false);
      
      // Clear any error that might have been shown
      setError(null);
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError('Failed to stop recording. Please try again.');
      setIsRecording(false);
    }
  };

  const handleHoldToSpeak = async (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    
    if (isRecording || isSpeaking) {
      console.log('Already recording or speaking, ignoring hold event');
      return;
    }

    try {
      await startRecording();
    } catch (error) {
      console.error('Error in hold to speak:', error);
      setError('Failed to start recording. Please check your microphone permissions.');
    }
  };

  const handleRelease = async (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    
    if (!isRecording) {
      console.log('Not recording, ignoring release event');
      return;
    }

    try {
      await stopRecording();
    } catch (error) {
      console.error('Error in release:', error);
      setError('Failed to process recording. Please try again.');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrentAudio();
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mediaStream]);

  const addTrainingLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setTrainingLogs(prev => [...prev, {
      timestamp: new Date(),
      message,
      type
    }]);
  };

  const playResponse = async (audioBlob: Blob) => {
    // Don't play if we're recording
    if (isRecording) {
      console.log('Skipping audio playback - recording in progress');
      return;
    }

    try {
      // Stop any existing audio first
      stopCurrentAudio();

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Set the audio output device if supported
      if (selectedSpeakerId && 'setSinkId' in audio) {
        try {
          await (audio as any).setSinkId(selectedSpeakerId);
        } catch (error) {
          console.error('Error setting audio output device:', error);
        }
      }
      
      audio.oncanplaythrough = async () => {
        // Double check we're not recording before starting playback
        if (isRecording) {
          URL.revokeObjectURL(audioUrl);
          return;
        }
        setIsSpeaking(true);
        try {
          await audio.play();
        } catch (error) {
          console.error('Playback error:', error);
          setIsSpeaking(false);
        }
      };
      
      audio.onended = () => {
        setIsSpeaking(false);
        setError(null);
        URL.revokeObjectURL(audioUrl);
        setCurrentAudio(null);
      };
      
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        setCurrentAudio(null);
      };
      
      setCurrentAudio(audio);
    } catch (error) {
      console.error('Audio setup error:', error);
      setIsSpeaking(false);
    }
  };

  const processAudioInput = async (audioBlob: Blob, formData: FormData) => {
    if (!voiceId) return;
    
    try {
      // Save the recording for future training
      await saveRecordingToStorage(audioBlob);
      setBackgroundRecordings(prev => [...prev, audioBlob]);
      setTotalRecordings(prev => prev + 1);
      
      if (backgroundRecordings.length + 1 >= SAMPLES_PER_SESSION) {
        setHasEnoughRecordings(true);
      }

      // Process as chat input
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to transcribe audio');
      }

      const { text } = await response.json();
      
      if (!text || text.trim().length === 0) {
        console.log('No speech detected in audio');
        return;
      }

      // Add user message
      const userMessage: Message = {
        role: 'user',
        content: text,
      };
      
      setMessages(prev => [...prev, userMessage]);
      
      // Get AI response
      const aiResponse = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversationHistory: messages
        }),
      });

      if (!aiResponse.ok) {
        throw new Error('Failed to get AI response');
      }

      const { reply } = await aiResponse.json();

      // Add AI message
      const assistantMessage: Message = {
        role: 'assistant',
        content: reply,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Get speech response
      const speechResponse = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: reply, 
          voiceId
        }),
      });

      if (speechResponse.ok) {
        const responseAudioBlob = await speechResponse.blob();
        await playResponse(responseAudioBlob);
      } else {
        throw new Error('Failed to generate speech');
      }
    } catch (error) {
      console.error('Error processing audio input:', error);
      setError('Failed to process audio input. Please try again.');
    }
  };

  const handleError = (error: any) => {
    setTranscriptionRetries(prev => {
      const newRetries = prev + 1;
      if (newRetries >= MAX_TRANSCRIPTION_RETRIES) {
        setIsTranscriptionFailed(true);
        setError('Transcription failed multiple times. Please refresh the page to try again.');
        return prev;
      }
      setTimeout(() => {
        setError(null);
        startRecording();
      }, Math.min(1000 * Math.pow(2, newRetries), 10000));
      return newRetries;
    });
    setError(error instanceof Error ? error.message : 'Failed to process audio');
  };

  const startTraining = async () => {
    if (trainingSamples.length < 5) {
      setError('Please record at least 5 samples of your voice for better quality training. Take your time between recordings to rest your voice.');
      return;
    }

    setIsTraining(true);
    setError(null);
    setWarning(null);

    try {
      const formData = new FormData();
      trainingSamples.forEach((sample, index) => {
        formData.append('audioFiles', sample, `sample-${index + 1}.wav`);
      });
      formData.append('name', 'My Professional Voice Clone');
      formData.append('description', 'High-quality voice clone with careful articulation and natural speech patterns');

      const response = await fetch('/api/voice/train', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to train voice model');
      }

      setVoiceId(data.voice_id);
      setVoiceName(data.name);
      if (data.warning) {
        setWarning(data.warning);
      }
      setIsTrainingMode(false);
    } catch (error) {
      console.error('Training error:', error);
      setError(error instanceof Error ? error.message : 'Failed to train voice model');
    } finally {
      setIsTraining(false);
    }
  };

  const startBackgroundTraining = async () => {
    if (backgroundRecordings.length < SAMPLES_PER_SESSION) return;
    
    setIsTrainingInBackground(true);
    const currentSession = trainingSession + 1;
    addTrainingLog(`Starting voice training session ${currentSession}/${MAX_TRAINING_SESSIONS}...`, 'info');
    
    try {
      const formData = new FormData();
      
      // Add current background recordings
      backgroundRecordings.forEach((recording, index) => {
        formData.append('audioFiles', recording, `sample-${index + 1}.mp3`);
      });
      
      // Add persisted recordings
      persistedRecordings.forEach((recording, index) => {
        formData.append('audioFiles', recording, `persisted-${index + 1}.mp3`);
      });
      
      formData.append('name', `Your Voice Clone - Session ${currentSession}`);
      formData.append('isBackground', 'true');
      formData.append('sessionNumber', currentSession.toString());

      const response = await fetch('/api/voice/train', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to train voice model');
      }

      setTrainingSession(currentSession);
      addTrainingLog(`Voice training session ${currentSession} completed successfully!`, 'success');

      // Store the new voice ID but don't switch automatically on first training
      const newVoiceId = data.voice_id;
      
      if (!readyToSwitchVoice && currentSession === 1) {
        // Ask for permission to switch
        const askMessage: Message = {
          role: 'assistant',
          content: "I've completed the first training session with your voice. Would you like me to start using your voice now? Simply say 'yes' to confirm."
        };
        setMessages(prev => [...prev, askMessage]);
        
        // Play the announcement with current voice
        const speechResponse = await fetch('/api/voice/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: askMessage.content, 
            voiceId
          }),
        });
        
        if (speechResponse.ok) {
          const responseAudioBlob = await speechResponse.blob();
          await playResponse(responseAudioBlob);
        }
      } else if (readyToSwitchVoice || currentSession > 1) {
        // Auto-switch for subsequent trainings or if user has approved
        setVoiceId(newVoiceId);
        setVoiceName(`Your Voice v${currentSession}`);
        
        // Store the voice ID in localStorage to persist across sessions
        localStorage.setItem('lastTrainedVoiceId', newVoiceId);
        localStorage.setItem('lastTrainedVoiceName', `Your Voice v${currentSession}`);
        
        if (currentSession === MAX_TRAINING_SESSIONS) {
          const message = "Perfect! Training is now complete, and I'm using your fully trained voice.";
          const assistantMessage: Message = {
            role: 'assistant',
            content: message
          };
          setMessages(prev => [...prev, assistantMessage]);
          
          // Play the announcement with the new voice
          const speechResponse = await fetch('/api/voice/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              text: message, 
              voiceId: newVoiceId
            }),
          });
          
          if (speechResponse.ok) {
            const responseAudioBlob = await speechResponse.blob();
            await playResponse(responseAudioBlob);
          }
        }
      }
      
    } catch (error) {
      console.error('Background training error:', error);
      addTrainingLog(`Training session ${currentSession} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsTrainingInBackground(false);
      setBackgroundRecordings([]); // Clear the recordings for next session
    }
  };

  // Add effect to restore voice from localStorage
  useEffect(() => {
    const savedVoiceId = localStorage.getItem('lastTrainedVoiceId');
    const savedVoiceName = localStorage.getItem('lastTrainedVoiceName');
    
    if (savedVoiceId && savedVoiceName) {
      setVoiceId(savedVoiceId);
      setVoiceName(savedVoiceName);
      setReadyToSwitchVoice(true);
    }
  }, []);

  // Add recording quality guidance component
  const RecordingGuidance = () => (
    <div className="mb-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
      <h3 className="font-semibold mb-2">Tips for High-Quality Voice Training:</h3>
      <ul className="list-disc pl-5 space-y-1">
        <li>Record in a quiet environment with minimal background noise</li>
        <li>Maintain a consistent distance from your microphone (about 6-8 inches)</li>
        <li>Speak naturally but clearly, avoiding rushing through the words</li>
        <li>Take short breaks between recordings to rest your voice</li>
        <li>Read each prompt with proper emphasis and natural pauses</li>
        <li>Try to maintain consistent volume and pace across all recordings</li>
      </ul>
    </div>
  );

  // Add TrainingLogs component
  const TrainingLogs = () => (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg max-h-40 overflow-y-auto">
      <h3 className="font-semibold mb-2">Training Progress</h3>
      <div className="space-y-2">
        {trainingLogs.map((log, index) => (
          <div 
            key={index} 
            className={`text-sm ${
              log.type === 'success' ? 'text-green-600' : 
              log.type === 'error' ? 'text-red-600' : 
              'text-gray-600'
            }`}
          >
            <span className="text-gray-400 mr-2">
              {log.timestamp.toLocaleTimeString()}
            </span>
            {log.message}
          </div>
        ))}
      </div>
    </div>
  );

  // Add effect to handle transcription failure state
  useEffect(() => {
    if (isTranscriptionFailed) {
      setIsRecording(false);
    }
  }, [isTranscriptionFailed]);

  // Add reset function
  const resetTranscription = () => {
    setTranscriptionRetries(0);
    setIsTranscriptionFailed(false);
    setError(null);
    startRecording();
  };

  // Update the cleanup effect
  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.warn('Error stopping audio track:', error);
          }
        });
      }
    };
  }, [mediaStream]);

  // Function to get available microphones
  const getAvailableDevices = async () => {
    try {
      // First try to get an initial audio stream to trigger permission prompt
      const initialStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      initialStream.getTracks().forEach(track => track.stop()); // Stop the initial stream

      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter(device => device.kind === 'audioinput');
      const speakers = devices.filter(device => device.kind === 'audiooutput');
      
      if (microphones.length === 0) {
        throw new Error('No microphone found. Please connect a microphone and refresh the page.');
      }

      // Find Jabra devices
      const jabraMic = microphones.find(mic => mic.label.toLowerCase().includes('jabra'));
      const jabraSpeaker = speakers.find(speaker => speaker.label.toLowerCase().includes('jabra'));
      
      // Set Jabra devices if found, otherwise use default devices
      if (jabraMic) {
        setSelectedMicrophoneId(jabraMic.deviceId);
        localStorage.setItem('selectedMicrophoneId', jabraMic.deviceId);
        setMicDebugInfo(`Using Jabra microphone: ${jabraMic.label}`);
      } else {
        setSelectedMicrophoneId(microphones[0].deviceId);
        setMicDebugInfo(`Using default microphone: ${microphones[0].label || 'Default Device'}`);
      }

      if (jabraSpeaker) {
        setSelectedSpeakerId(jabraSpeaker.deviceId);
        localStorage.setItem('selectedSpeakerId', jabraSpeaker.deviceId);
      } else if (speakers.length > 0) {
        setSelectedSpeakerId(speakers[0].deviceId);
      }

    } catch (error) {
      console.error('Error getting audio devices:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone access in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and refresh the page.');
        } else {
          throw new Error(`Failed to initialize audio devices: ${error.message}`);
        }
      }
    }
  };

  // Add effect to get available microphones on mount
  useEffect(() => {
    getAvailableDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getAvailableDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getAvailableDevices);
    };
  }, []);

  // Add effect to save selected speaker
  useEffect(() => {
    if (selectedSpeakerId) {
      localStorage.setItem('selectedSpeakerId', selectedSpeakerId);
    }
  }, [selectedSpeakerId]);

  // AudioLevelMeter component
  const AudioLevelMeter = () => (
    <div className="w-full max-w-md mx-auto mb-4">
      <div className="flex flex-col space-y-2">
        <div className="text-sm text-gray-500 text-center">{micDebugInfo}</div>
        <div className="flex items-center space-x-2">
          <div className="text-sm text-gray-500">Mic Level:</div>
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-75 rounded-full ${
                audioLevel > 70 ? 'bg-red-500' :
                audioLevel > 40 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${audioLevel}%` }}
            />
          </div>
          <div className="text-sm text-gray-500 w-8">{Math.round(audioLevel)}%</div>
        </div>
      </div>
    </div>
  );

  // Function to save recording to storage
  const saveRecordingToStorage = async (audioBlob: Blob) => {
    if (!user) return;
    
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        
        // Get existing recordings for this user
        const storageKey = `voiceRecordings_${user.uid}`;
        const existingData = localStorage.getItem(storageKey);
        let recordings = existingData ? JSON.parse(existingData) : [];
        
        recordings.push({
          data: base64data,
          timestamp: new Date().toISOString(),
          mimeType: audioBlob.type,
          userId: user.uid,
          userEmail: user.email
        });
        
        if (recordings.length > 50) {
          recordings = recordings.slice(-50);
        }
        
        localStorage.setItem(storageKey, JSON.stringify(recordings));
        addTrainingLog('Recording saved to storage', 'success');
      };
    } catch (error) {
      console.error('Error saving recording:', error);
    }
  };

  // Function to load recordings from storage
  const loadRecordingsFromStorage = async (): Promise<Blob[]> => {
    if (!user) return [];

    try {
      const storageKey = `voiceRecordings_${user.uid}`;
      const data = localStorage.getItem(storageKey);
      if (!data) return [];

      const recordings = JSON.parse(data);
      return recordings.map((recording: any) => {
        const byteString = atob(recording.data.split(',')[1]);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const bytes = new Uint8Array(arrayBuffer);
        
        for (let i = 0; i < byteString.length; i++) {
          bytes[i] = byteString.charCodeAt(i);
        }
        
        return new Blob([arrayBuffer], { type: recording.mimeType });
      });
    } catch (error) {
      console.error('Error loading recordings:', error);
      return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold">
                Chat Mode
                {voiceName && (
                  <span className="text-sm text-gray-500 ml-2">Using voice: {voiceName}</span>
                )}
              </h2>
              {user && (
                <div className="text-sm text-gray-600">
                  Logged in as: {user.email}
                </div>
              )}
            </div>
            
            <div className="mt-2 text-sm">
              <div className="flex items-center space-x-2">
                <div className="text-gray-600">Training Progress:</div>
                <div className="font-medium">
                  Session {trainingSession}/{MAX_TRAINING_SESSIONS}
                </div>
                <div className="text-gray-600">
                  ({totalRecordings}/{SAMPLES_PER_SESSION * MAX_TRAINING_SESSIONS} recordings)
                </div>
                {isTrainingInBackground && (
                  <div className="text-blue-500 animate-pulse">Training in progress...</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        <AudioLevelMeter />

        <div className="mb-4 max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-3 text-sm">
          <div className="space-y-1">
            {trainingLogs.slice(-5).map((log, index) => (
              <div 
                key={index} 
                className={`${
                  log.type === 'success' ? 'text-green-600' : 
                  log.type === 'error' ? 'text-red-600' : 
                  'text-gray-600'
                }`}
              >
                <span className="text-gray-400 mr-2">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                {log.message}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="h-96 overflow-y-auto bg-gray-50 p-4 rounded-lg">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-4">
                Press and hold to record your message
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-4 ${
                  message.role === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                <div
                  className={`inline-block max-w-[80%] p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex justify-center items-center space-x-4">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopCurrentAudio();
                // Small delay to ensure audio is fully stopped before starting recording
                requestAnimationFrame(() => {
                  startRecording();
                });
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopRecording();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopCurrentAudio();
                // Small delay to ensure audio is fully stopped before starting recording
                requestAnimationFrame(() => {
                  startRecording();
                });
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopRecording();
              }}
              disabled={isProcessing}
              className={`px-6 py-3 rounded-full font-medium transition-colors ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : isProcessing
                  ? 'bg-gray-300 text-gray-600'
                  : isSpeaking
                  ? 'bg-green-500 text-white hover:bg-red-500'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isRecording ? 'Recording...' : 
               isProcessing ? 'Processing...' :
               isSpeaking ? 'Hold to Interrupt & Speak' : 
               'Hold to Speak'}
            </button>
            {isTranscriptionFailed && (
              <button
                onClick={resetTranscription}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Reset & Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 