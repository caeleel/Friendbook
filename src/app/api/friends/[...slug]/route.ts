import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';
import { getPerson } from '../../lib';

export async function GET(request: Request, { params }: { params: { slug: string[] } }) {
  const slug = params.slug;

  if (slug.length === 1) {
    const friends = await kv.smembers(`${slug[0]}:friends`);
    const friendMap = await kv.hgetall(`${slug[0]}:friendMap`);

    return NextResponse.json({ friends, friendMap });
  }

  if (slug.length === 3) {
    const friend = await getPerson(slug[0], slug[1], slug[2]);

    return NextResponse.json({ friend });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}