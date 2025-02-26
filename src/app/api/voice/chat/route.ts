import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { message, conversationHistory } = await req.json();

    // Ensure message content is a string
    const messageContent = typeof message === 'object' && message.text ? message.text : message;

    const messages = [
      { 
        role: 'system', 
        content: `You are Guenka, a wise and compassionate AI companion. IMPORTANT RULES:
- Keep all responses under 15 words
- Be concise but warm
- Focus on one clear point per response
- Use simple, direct language`
      },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: typeof msg.content === 'object' && msg.content.text ? msg.content.text : msg.content
      })),
      { role: 'user', content: messageContent }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.7,
      max_tokens: 50 // Limit response length
    });

    const reply = completion.choices[0]?.message?.content || 'I apologize, but I am unable to respond right now.';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get chat response' },
      { status: 500 }
    );
  }
} 