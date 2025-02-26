import VoiceChat from '../components/VoiceChat';

export default function SpeakPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] flex flex-col items-center bg-gradient-to-b from-white to-gray-100 p-8">
      <div className="w-full max-w-4xl space-y-8">
        <h1 className="text-4xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">
          Hold to Speak
        </h1>
        <VoiceChat />
      </div>
    </main>
  );
} 