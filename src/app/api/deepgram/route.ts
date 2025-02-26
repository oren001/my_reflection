import { NextResponse } from "next/server";

// For static export, we'll return a mock response
export async function GET() {
  return NextResponse.json({
    apiKey: "DEEPGRAM_API_KEY_PLACEHOLDER",
    message: "For production, replace this with your actual API key handling"
  });
}

// For static export, we'll return a mock response
export async function POST() {
  return NextResponse.json({
    success: true,
    message: "For production, implement actual transcription handling"
  });
}
