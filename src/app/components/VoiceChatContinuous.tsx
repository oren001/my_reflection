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

interface Message {
  role: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
}

export default function VoiceChatContinuous() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const debugInfoRef = useRef<{
    audioContext: string;
    analyser: string;
    stream: string;
    lastLevel: number;
    timestamp: string;
  }>({
    audioContext: 'Not initialized',
    analyser: 'Not initialized',
    stream: 'Not initialized',
    lastLevel: 0,
    timestamp: ''
  });
  const [debugInfoKey, setDebugInfoKey] = useState(0);

  const updateDebugInfo = useCallback((updater: (prev: typeof debugInfoRef.current) => typeof debugInfoRef.current) => {
    debugInfoRef.current = updater(debugInfoRef.current);
    setDebugInfoKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    initializeVoice();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start listening automatically after initialization
  useEffect(() => {
    if (!isInitializing && !isListening && voiceId) {
      startListening();
    }
  }, [isInitializing, voiceId]);

  const initializeVoice = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permissionStatus.state === 'denied') {
        throw new Error('Microphone permission denied');
      }

      await getAvailableDevices();

      const response = await fetch('/api/voice/train', {
        method: 'POST',
        body: new FormData(),
      });

      if (!response.ok) {
        throw new Error('Failed to initialize voice service');
      }

      const data = await response.json();
      setVoiceId(data.selected_voice.voice_id);
      setVoiceName(data.selected_voice.name);
      
      // Start listening automatically
      startListening();
    } catch (error) {
      console.error('Voice initialization error:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize');
    } finally {
      setIsInitializing(false);
    }
  };

  const getAvailableDevices = async () => {
    try {
      const initialStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      initialStream.getTracks().forEach(track => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter(device => device.kind === 'audioinput');
      const speakers = devices.filter(device => device.kind === 'audiooutput');
      
      if (microphones.length === 0) {
        throw new Error('No microphone found');
      }

      const jabraMic = microphones.find(mic => mic.label.toLowerCase().includes('jabra'));
      const jabraSpeaker = speakers.find(speaker => speaker.label.toLowerCase().includes('jabra'));
      
      setSelectedMicrophoneId(jabraMic?.deviceId || microphones[0].deviceId);
      if (jabraSpeaker || speakers.length > 0) {
        setSelectedSpeakerId(jabraSpeaker?.deviceId || speakers[0].deviceId);
      }
    } catch (error) {
      throw new Error('Failed to initialize audio devices');
    }
  };

  const startListening = async () => {
    try {
      updateDebugInfo(prev => ({
        ...prev,
        audioContext: 'Requesting microphone access...',
        stream: 'Initializing...',
        analyser: 'Not started'
      }));

      // First check if we already have an active stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Clean up existing audio context if it exists
      if (audioContextRef.current?.state !== 'closed') {
        try {
          await audioContextRef.current?.close();
        } catch (e) {
          console.warn('Error closing audio context:', e);
        }
      }

      // Create new audio context with explicit settings
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });

      if (!audioContextRef.current) {
        throw new Error('Failed to create AudioContext');
      }

      updateDebugInfo(prev => ({
        ...prev,
        audioContext: `Context created, state: ${audioContextRef.current?.state || 'unknown'}, sampleRate: ${audioContextRef.current?.sampleRate || 'unknown'}`
      }));

      // Get media stream with explicit constraints
      const constraints = {
        audio: {
          deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: 44100,
          channelCount: 1,
          latency: 0,
          volume: 1.0
        }
      };

      console.log('Requesting media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify stream is active and has audio tracks
      const audioTracks = stream.getAudioTracks();
      console.log('Audio tracks:', audioTracks.map(track => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      })));

      if (audioTracks.length === 0) {
        throw new Error('No audio tracks found in media stream');
      }

      streamRef.current = stream;
      updateDebugInfo(prev => ({
        ...prev,
        stream: `Stream active: ${stream.active}, tracks: ${audioTracks.length}, track label: ${audioTracks[0].label}`
      }));

      // Resume audio context if it's not running
      if (audioContextRef.current.state !== 'running') {
        await audioContextRef.current.resume();
        console.log('AudioContext resumed:', audioContextRef.current.state);
      }

      // Create and configure analyzer with explicit settings
      if (!audioContextRef.current) {
        throw new Error('AudioContext is null');
      }
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      if (!analyserRef.current) {
        throw new Error('Failed to create AnalyserNode');
      }

      analyserRef.current.fftSize = 1024;
      analyserRef.current.smoothingTimeConstant = 0.2;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;

      updateDebugInfo(prev => ({
        ...prev,
        analyser: `Analyser configured: fftSize=${analyserRef.current?.fftSize || 'unknown'}, smoothing=${analyserRef.current?.smoothingTimeConstant || 'unknown'}`
      }));

      // Create source and connect to analyzer
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      console.log('Source connected to analyser');

      // Create media recorder with explicit mime type
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let silenceStart = Date.now();
      const SILENCE_THRESHOLD = 10;
      const SILENCE_DURATION = 1500;
      const MIN_RECORDING_TIME = 500;

      let recordingStartTime = 0;

      const checkAudioLevel = () => {
        if (!isListening || !analyserRef.current) return;
        
        try {
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // Calculate average frequency value with more detailed analysis
          let sum = 0;
          let nonZeroCount = 0;
          let maxValue = 0;
          
          for (let i = 0; i < bufferLength; i++) {
            const value = dataArray[i];
            if (value > 0) {
              sum += value;
              nonZeroCount++;
              maxValue = Math.max(maxValue, value);
            }
          }
          
          // Calculate level with more nuanced approach
          const average = nonZeroCount > 0 ? sum / nonZeroCount : 0;
          const normalizedLevel = Math.min(100, (average / 128) * 200);
          const instantLevel = Math.min(100, (maxValue / 255) * 100);
          
          // Use the higher of the two values for better responsiveness
          const finalLevel = Math.max(normalizedLevel, instantLevel);
          
          setAudioLevel(finalLevel);
          updateDebugInfo(prev => ({
            ...prev,
            lastLevel: finalLevel,
            analyser: `Level: ${finalLevel.toFixed(2)}, Avg: ${average.toFixed(2)}, Max: ${maxValue}, NonZero: ${nonZeroCount}`
          }));

          if (finalLevel > SILENCE_THRESHOLD) {
            silenceStart = Date.now();
            if (!isSpeechDetected) {
              setIsSpeechDetected(true);
              if (mediaRecorder.state === 'inactive') {
                mediaRecorder.start(100);
                recordingStartTime = Date.now();
                console.log('Started recording due to audio level:', finalLevel);
              }
            }
          } else if (isSpeechDetected) {
            const silenceDuration = Date.now() - silenceStart;
            const recordingDuration = Date.now() - recordingStartTime;
            
            if (silenceDuration > SILENCE_DURATION && recordingDuration > MIN_RECORDING_TIME) {
              setIsSpeechDetected(false);
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                console.log('Stopped recording due to silence');
              }
            }
          }

          animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        } catch (e) {
          console.error('Error in checkAudioLevel:', e);
          updateDebugInfo(prev => ({
            ...prev,
            analyser: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
          }));
        }
      };

      // Start the audio level monitoring
      requestAnimationFrame(checkAudioLevel);
      setIsListening(true);
      setError(null);
      
      console.log('Audio initialization complete');

    } catch (error) {
      console.error('Error starting listener:', error);
      setError(`Failed to start listening: ${error instanceof Error ? error.message : 'Unknown error'}`);
      updateDebugInfo(prev => ({
        ...prev,
        audioContext: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stream: 'Failed',
        analyser: 'Failed'
      }));

      // Cleanup on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current?.state !== 'closed') {
        try {
          await audioContextRef.current?.close();
        } catch (e) {
          console.warn('Error closing audio context on cleanup:', e);
        }
      }
    }
  };

  const stopListening = async () => {
    try {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      if (audioContextRef.current?.state !== 'closed') {
        try {
          await audioContextRef.current?.close();
        } catch (e) {
          console.warn('Error closing audio context:', e);
        }
      }
      audioContextRef.current = null;
      analyserRef.current = null;

      setIsListening(false);
      setIsSpeechDetected(false);
      setAudioLevel(0);
      updateDebugInfo(prev => ({
        ...prev,
        audioContext: 'Closed',
        stream: 'Stopped',
        analyser: 'Cleaned up',
        lastLevel: 0
      }));
    } catch (error) {
      console.error('Error stopping listener:', error);
      setError(`Failed to stop listening: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const processAudioInput = async (formData: FormData) => {
    if (!voiceId) {
      console.log('processAudioInput: no voiceId set, skipping processing');
      return;
    }
    console.log('Processing audio input with voiceId:', voiceId);
    setProcessing(true);
    
    try {
      console.log('Sending audio for transcription...');
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Transcription error:', errorData);
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }

      const { text } = await response.json();
      console.log('Transcription received:', text);
      
      if (!text || text.trim().length === 0) {
        console.log('Empty transcription, skipping');
        setProcessing(false);
        return;
      }

      const userMessage: Message = { role: 'user', content: text };
      // Compute updated messages including this new user message
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      
      console.log('Getting AI response with conversation history:', updatedMessages);
      const aiResponse = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: updatedMessages
        }),
      });

      if (!aiResponse.ok) {
        throw new Error('Failed to get AI response');
      }

      const { reply } = await aiResponse.json();
      console.log('AI response received:', reply);
      
      const assistantMessage: Message = { role: 'assistant', content: reply };
      setMessages(prev => [...prev, assistantMessage]);

      console.log('Getting speech response...');
      const speechResponse = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply, voiceId }),
      });

      if (speechResponse.ok) {
        const audioBlob = await speechResponse.blob();
        await playResponse(audioBlob);
      }
      setProcessing(false);
    } catch (error) {
      console.error('Error processing audio:', error);
      setError('Failed to process audio. Please try again.');
      setProcessing(false);
    }
  };

  const playResponse = async (audioBlob: Blob) => {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      if (selectedSpeakerId && 'setSinkId' in audio) {
        await (audio as any).setSinkId(selectedSpeakerId);
      }
      
      audio.oncanplaythrough = () => {
        setIsSpeaking(true);
        audio.play();
      };
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        setCurrentAudio(null);
      };
      
      setCurrentAudio(audio);
    } catch (error) {
      console.error('Playback error:', error);
      setIsSpeaking(false);
      if (error instanceof Error) {
        setError(`Failed to play audio: ${error.message}`);
      } else {
        setError('Failed to play audio: Unknown error');
      }
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">
              Continuous Chat
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
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        <div className="mb-4">
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
            <div className={`w-3 h-3 rounded-full ${
              isSpeechDetected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
            }`} />
            <div className="text-xs text-gray-500">{Math.round(audioLevel)}%</div>
          </div>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-xs font-mono">
          <div>Audio Context: {debugInfoRef.current.audioContext}</div>
          <div>Analyser: {debugInfoRef.current.analyser}</div>
          <div>Stream: {debugInfoRef.current.stream}</div>
          <div>Last Level: {debugInfoRef.current.lastLevel.toFixed(2)}</div>
        </div>

        <div className="space-y-4">
          <div className="h-96 overflow-y-auto bg-gray-50 p-4 rounded-lg">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-4">
                Just start speaking - I&apos;m listening!
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}
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
              onClick={() => isListening ? stopListening() : startListening()}
              className={`px-6 py-3 rounded-full font-medium transition-colors ${
                isListening
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isListening ? 'Pause Listening' : 'Resume Listening'}
            </button>
          </div>
        </div>
      </div>
      {processing && (
        <div className="loading-indicator">
          Waiting for response...
        </div>
      )}
    </div>
  );
} 