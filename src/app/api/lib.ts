import { kv } from '@vercel/kv'
import { v4 as uuidv4 } from 'uuid'

export async function findPersonFromPrefix(uuid: string, prefix: string) {
  const friends = await kv.smembers(`${uuid}:friends`);

  const matching = friends.filter(friend => friend.startsWith(prefix));

  if (matching.length === 0) {
    return [];
  }

  const friendIds = await kv.hgetall(`${uuid}:friendMap`);

  if (!friendIds) return []

  const result: { name: string, id: string }[] = [];
  for (const friend of matching) {
    result.push({ name: friend, id: friendIds[friend] as string });
  }

  return result;
}

export async function setFact(uuid: string, personId: string, key: string, value: string, confidence: 'high' | 'low' | 'medium', importance: number) {
  await kv.hset(`${uuid}:${personId}`, { [key]: JSON.stringify({ value, confidence, importance }) });
}

export async function addPerson(uuid: string, person: string, relationship: string) {
  const existing = await kv.sismember(`${uuid}:friends`, person);

  if (existing) {
    return null;
  }

  const personId = uuidv4();
  await kv.sadd(`${uuid}:friends`, person);
  await kv.hset(`${uuid}:friendMap`, { [person]: personId });
  await setFact(uuid, personId, 'relationship', relationship, 'high', 0);

  return {
    id: personId,
    name: person,
    relationship: {
      value: relationship,
      confidence: 'high',
      importance: 0,
    }
  };
}

export async function updateName(uuid: string, person: string, name: string) {
  const personId = await kv.hget(`${uuid}:friendMap`, person);

  if (!personId) {
    return false;
  }

  await kv.srem(`${uuid}:friends`, person);
  await kv.sadd(`${uuid}:friends`, name);
  await kv.hdel(`${uuid}:friendMap`, person);
  await kv.hset(`${uuid}:friendMap`, { [name]: personId });

  return true;
}

export async function getPerson(uuid: string, name: string, personId: string) {
  const personFacts = await kv.hgetall(`${uuid}:${personId}`) as { [key: string]: any };
  if (!personFacts) {
    return { name, id: personId };
  }

  for (const key in personFacts) {
    personFacts[key] = JSON.parse(personFacts[key]);
  }
  personFacts.lists = {};
  const lists = await kv.smembers(`${uuid}:${personId}:lists`);
  for (const list of lists) {
    const listData = await kv.smembers(`${uuid}:${personId}:${list}`);
    const listTimestamps = await kv.hgetall(`${uuid}:${personId}:${list}:timestamps`);
    if (!listTimestamps) continue;
    personFacts.lists[list] = listData.map((d) => ({
      value: d,
      timestamp: listTimestamps[d],
    }));
  }
  return {
    name,
    id: personId,
    ...personFacts,
  }
}

export async function addListData(uuid: string, personId: string, key: string, value: string, timestamp: string | null) {
  await kv.sadd(`${uuid}:${personId}:${key}`, value);
  await kv.sadd(`${uuid}:${personId}:lists`, key)
  if (timestamp) {
    await kv.hset(`${uuid}:${personId}:${key}:timestamps`, { [value]: timestamp });
  }
}

export async function removeListData(uuid: string, personId: string, key: string, value: string) {
  await kv.srem(`${uuid}:${personId}:${key}`, value);
  const nRemaining = await kv.scard(`${uuid}:${personId}:${key}`);
  if (nRemaining === 0) {
    await kv.srem(`${uuid}:${personId}:lists`, key);
  }
  await kv.hdel(`${uuid}:${personId}:${key}:timestamps`, value);
}

export interface ChatMessage {
  threadId?: string;
  message: string;
  uuid: string;
}