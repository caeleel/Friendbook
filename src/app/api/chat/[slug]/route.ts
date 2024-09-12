import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;

  const messages = await kv.lrange(`chat:${slug}`, 0, -1);

  return NextResponse.json({ messages });
}