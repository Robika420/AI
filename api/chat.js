import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client using environment variables
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Domain security check
  const allowedOrigin = 'https://robika420.github.io';
  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { action, sessionId, provider, model, history, prompt } = req.body;

    // 1. Action to fetch existing chat history for a session
    if (action === 'load') {
      const { data, error } = await supabase
        .from('chats')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ history: data || [] });
    }

    // 2. Action to process chat and save messages
    if (!prompt || !sessionId) {
      return res.status(400).json({ error: 'Prompt and Session ID required' });
    }

    let reply = "";

    if (provider === 'google') {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents: prompt,
      });
      reply = response.text;
    } 
    else if (provider === 'openai') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: model || 'gpt-4o-mini',
        messages: history.concat({ role: 'user', content: prompt }),
      });
      reply = completion.choices[0].message.content;
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    // Save user message and AI response to Supabase database
    await supabase.from('chats').insert([
      { session_id: sessionId, role: 'user', content: prompt, provider },
      { session_id: sessionId, role: 'assistant', content: reply, provider }
    ]);

    return res.status(200).json({ text: reply });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'AI processing failed' });
  }
}