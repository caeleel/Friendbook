import { OpenAI } from "openai";
import { kv } from "@vercel/kv";
import { NextResponse } from 'next/server';
import { RunSubmitToolOutputsParams } from "openai/resources/beta/threads/runs/runs";
import { findPersonFromPrefix, addPerson, getPerson, updateName, addListData, setFact, removeListData, ChatMessage } from "../lib";

const openai = new OpenAI();
const assistantId = 'asst_2dDPaflBu9s3nUXBC4Du8H73'

export async function POST(request: Request) {
  try {
    const message: ChatMessage = await request.json();
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
    await kv.rpush(`chat:${uuid}`, JSON.stringify({ ...userMessage, time: Number(new Date()) }));

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
      const message = messages.data[0];

      if (message.content[0].type === 'text') {
        const content = message.content[0].text.value;
        await kv.rpush(`chat:${uuid}`, JSON.stringify({ content, role: 'assistant', time: Number(new Date()) }));
        return NextResponse.json({ status: 'success', threadId, message: content });
      } else if (message.content[0].type === 'image_url') {
        const imageUrl = message.content[0].image_url.url;
        await kv.rpush(`chat:${uuid}`, JSON.stringify({ content: imageUrl, role: 'assistant', time: Number(new Date()) }));
        return NextResponse.json({ status: 'success', threadId, imageUrl });
      }
    } else {
      console.log(run.status);
      console.log(run.last_error);
      return NextResponse.json({ status: 'error', reason: run.last_error }, { status: 500 });
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ status: 'error', reason: 'Invalid JSON' }, { status: 400 });
  }
}