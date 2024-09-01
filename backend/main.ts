import * as http from 'http';
import OpenAI from 'openai';
import { RunSubmitToolOutputsParams } from 'openai/resources/beta/threads/runs/runs';
import * as redis from 'redis';
import { v4 as uuidv4 } from 'uuid';

interface ChatMessage {
  threadId?: string;
  message: string;
  uuid: string;
}

const openai = new OpenAI();
const assistantId = 'asst_2r7D9q1zgOEckGcUdI5p4ia9'
const redisClient = redis.createClient();

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});
redisClient.connect();

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  // Add CORS header to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS' && req.url === '/chat') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400' // 24 hours
    });
    res.end();
  } else if (req.url === '/chat' && req.method === 'POST') {
    handleChatPost(req, res);
  } else if (req.url?.startsWith('/chat/') && req.method === 'GET') {
    handleChatGet(req, res);
  } else if (req.url?.startsWith('/friends/') && req.method === 'GET') {
    handleFriendsGet(req, res);
  } else if (req.url?.startsWith('/friend/') && req.method === 'GET') {
    handleFriendGet(req, res);
  } else {
    handleNotFound(res);
  }
});

async function handleChatGet(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' });

  const uuid = req.url!.split('/')[2];
  const messages = await redisClient.lRange(`chat:${uuid}`, 0, -1);

  res.end(JSON.stringify({ messages }));
};

async function handleFriendsGet(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' });

  const uuid = req.url!.split('/')[2];
  const friends = await redisClient.sMembers(`${uuid}:friends`);
  const friendMap = await redisClient.hGetAll(`${uuid}:friendMap`);

  res.end(JSON.stringify({ friends, friendMap }));
}

async function handleFriendGet(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' });

  const uuid = req.url!.split('/')[2];
  const name = req.url!.split('/')[3];
  const friendId = req.url!.split('/')[4];
  const friend = await getPerson(uuid, name, friendId);

  res.end(JSON.stringify({ friend }));
}

async function findPersonFromPrefix(uuid: string, prefix: string) {
  const friends = await redisClient.sMembers(`${uuid}:friends`);

  const matching = friends.filter(friend => friend.startsWith(prefix));

  if (matching.length === 0) {
    return [];
  }

  const friendIds = await redisClient.hGetAll(`${uuid}:friendMap`);

  const result: { name: string, id: string }[] = [];
  for (const friend of matching) {
    result.push({ name: friend, id: friendIds[friend] });
  }

  return result;
}

async function setFact(uuid: string, personId: string, key: string, value: string, confidence: 'high' | 'low' | 'medium', importance: number) {
  await redisClient.hSet(`${uuid}:${personId}`, key, JSON.stringify({ value, confidence, importance }));
}

async function addPerson(uuid: string, person: string, relationship: string) {
  const existing = await redisClient.sIsMember(`${uuid}:friends`, person);

  if (existing) {
    return null;
  }

  const personId = uuidv4();
  await redisClient.sAdd(`${uuid}:friends`, person);
  await redisClient.hSet(`${uuid}:friendMap`, person, personId);
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

async function updateName(uuid: string, person: string, name: string) {
  const personId = await redisClient.hGet(`${uuid}:friendMap`, person);

  if (!personId) {
    return false;
  }

  await redisClient.sRem(`${uuid}:friends`, person);
  await redisClient.sAdd(`${uuid}:friends`, name);
  await redisClient.hDel(`${uuid}:friendMap`, person);
  await redisClient.hSet(`${uuid}:friendMap`, name, personId);

  return true;
}

async function getPerson(uuid: string, name: string, personId: string) {
  const personFacts: { [key: string]: any } = await redisClient.hGetAll(`${uuid}:${personId}`);
  for (const key in personFacts) {
    personFacts[key] = JSON.parse(personFacts[key]);
  }
  personFacts.lists = {};
  const lists = await redisClient.sMembers(`${uuid}:${personId}:lists`);
  for (const list of lists) {
    const listData = await redisClient.sMembers(`${uuid}:${personId}:${list}`);
    const listTimestamps = await redisClient.hGetAll(`${uuid}:${personId}:${list}:timestamps`);
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

async function addListData(uuid: string, personId: string, key: string, value: string, timestamp: string | null) {
  await redisClient.sAdd(`${uuid}:${personId}:${key}`, value);
  await redisClient.sAdd(`${uuid}:${personId}:lists`, key)
  if (timestamp) {
    await redisClient.hSet(`${uuid}:${personId}:${key}:timestamps`, value, timestamp);
  }
}

async function removeListData(uuid: string, personId: string, key: string, value: string) {
  await redisClient.sRem(`${uuid}:${personId}:${key}`, value);
  const nRemaining = await redisClient.sCard(`${uuid}:${personId}:${key}`);
  if (nRemaining === 0) {
    await redisClient.sRem(`${uuid}:${personId}:lists`, key);
  }
  await redisClient.hDel(`${uuid}:${personId}:${key}:timestamps`, value);
}

function handleChatPost(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';

  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const message: ChatMessage = JSON.parse(body);
      const uuid = message.uuid;
      console.log('Received message:', message);

      let threadId = message.threadId;
      if (!threadId) {
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
      }

      const userMessage = {
        role: 'user',
        content: message.message,
      } as const;
      await openai.beta.threads.messages.create(threadId, userMessage);
      await redisClient.rPush(`chat:${uuid}`, JSON.stringify({ ...userMessage, time: Number(new Date()) }));

      let run = await openai.beta.threads.runs.createAndPoll(threadId, {
        assistant_id: assistantId,
        additional_instructions: `The current time is ${new Date().toString()}.`,
      });

      while (run.status === 'requires_action') {
        const requiredAction = run.required_action!;

        const toolOutputs = requiredAction.submit_tool_outputs;
        const outputs: RunSubmitToolOutputsParams.ToolOutput[] = [];

        if (toolOutputs.tool_calls) {
          for (const toolCall of toolOutputs.tool_calls) {
            const toolCallId = toolCall.id;

            const args = JSON.parse(toolCall.function.arguments);

            const toolCallName = toolCall.function.name;
            let person: any = null;

            if (toolCallName === 'add_list_data' || toolCallName === 'remove_list_data' || toolCallName === 'set_fact' || toolCallName === 'get_person') {
              const matching = await findPersonFromPrefix(message.uuid, args.name);
              if (matching.length === 0) {
                person = await addPerson(uuid, args.name, args.relationship);
              } else if (matching.length === 1) {
                person = await getPerson(uuid, matching[0].name, matching[0].id);
              } else {
                outputs.push({
                  tool_call_id: toolCallId,
                  output: '{ success: false, reason: "Ambiguous person, multiple people match name" }',
                })
                continue;
              }
            }

            switch (toolCallName) {
              case 'add_person':
                console.log('Adding person', args.name, args.relationship);
                const added = await addPerson(uuid, args.name, args.relationship);
                if (!added) {
                  outputs.push({
                    tool_call_id: toolCallId,
                    output: '{ success: false, reason: "Person already exists" }',
                  })
                } else {
                  outputs.push({
                    tool_call_id: toolCallId,
                    output: '{ success: true }',
                  })
                }
                break;
              case 'update_name':
                console.log('Updating name', args.person, args.name);
                const updated = await updateName(uuid, args.person, args.name);
                if (!updated) {
                  outputs.push({
                    tool_call_id: toolCallId,
                    output: '{ success: false, reason: "Person not found" }',
                  })
                } else {
                  outputs.push({
                    tool_call_id: toolCallId,
                    output: '{ success: true }',
                  })
                }
                break;
              case 'add_list_data':
                console.log('Adding list data', args.key, args.value, args.timestamp);
                await addListData(message.uuid, person.id, args.key, args.value, args.timestamp);
                outputs.push({
                  tool_call_id: toolCallId,
                  output: '{ success: true }',
                })
                break;
              case 'remove_list_data':
                console.log('Removing list data', args.key, args.value);
                await removeListData(message.uuid, person.id, args.key, args.value);
                outputs.push({
                  tool_call_id: toolCallId,
                  output: '{ success: true }',
                })
                break;
              case 'set_fact':
                console.log('Setting fact', args.key, args.value, args.confidence, args.importance);
                await setFact(message.uuid, person.id, args.key, args.value, args.confidence, args.importance);
                outputs.push({
                  tool_call_id: toolCallId,
                  output: '{ success: true }',
                })
                break;
              case 'get_person':
                console.log('Getting person', person.name, args.attribute);
                if (args.attribute) {
                  outputs.push({
                    tool_call_id: toolCallId,
                    output: `{ success: true, person: { name: ${person.name}, id: ${person.id}, ${args.attribute}: ${JSON.stringify(person[args.attribute])} } }`,
                  })
                } else {
                  outputs.push({
                    tool_call_id: toolCallId,
                    output: `{ success: true, person: ${JSON.stringify(person)} }`,
                  })
                }
                break;
            }
          }
        }

        await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
          tool_outputs: outputs,
        });
        run = await openai.beta.threads.runs.poll(threadId, run.id);
      }

      if (run.status === 'completed') {
        const messages = await openai.beta.threads.messages.list(threadId);
        //console.log('Messages:', messages);
        const message = messages.data[0];

        if (message.content[0].type === 'text') {
          const content = message.content[0].text.value;
          await redisClient.rPush(`chat:${uuid}`, JSON.stringify({ content, role: 'assistant', time: Number(new Date()) }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', threadId, message: content }));
        } else if (message.content[0].type === 'image_url') {
          const imageUrl = message.content[0].image_url.url;
          await redisClient.rPush(`chat:${uuid}`, JSON.stringify({ content: imageUrl, role: 'assistant', time: Number(new Date()) }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', threadId, imageUrl }));
        }
      } else {
        console.log(run.status);
        console.log(run.last_error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', reason: run.last_error }));
      }
    } catch (error) {
      console.error('Error:', error);
      handleInvalidJSON(res);
    }
  });
}

function handleInvalidJSON(res: http.ServerResponse) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Invalid JSON' }));
}

function handleNotFound(res: http.ServerResponse) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
