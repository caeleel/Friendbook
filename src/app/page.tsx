'use client'

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  content: string;
  role: 'user' | 'assistant';
  time: number;
}

let uuid = ''
let threadId: string | null = null

if (typeof window !== 'undefined') {
  uuid = localStorage.getItem('uuid') || uuidv4();
  localStorage.setItem('uuid', uuid);
  threadId = localStorage.getItem('threadId') || null;
}

async function fetchMessages(): Promise<Message[]> {
  const response = await fetch(`/api/chat/${uuid}`);
  const data = await response.json();
  const messages = data.messages.map((msg: string) => JSON.parse(msg));
  console.log(messages);
  return messages;
}

async function sendMessage(message: string): Promise<string> {
  const response = await fetch(`/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, threadId, uuid }),
  });
  const data = await response.json();
  return data.message;
}

function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const fetchedMessages = await fetchMessages();
        setMessages(fetchedMessages);
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    loadMessages();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (input.trim()) {
      const userMessage = { content: input, role: 'user' as const, time: Date.now() };
      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInput('');
      setIsTyping(true);

      try {
        const response = await sendMessage(input);
        setIsTyping(false);
        setMessages(prevMessages => [...prevMessages, { content: response, role: 'assistant' as const, time: Date.now() }]);
      } catch (error) {
        console.error('Error sending message:', error);
        setIsTyping(false);
      }
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setInput(e.target.value);
  };

  return (
    <div className="flex flex-col bg-gray-100 h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span className={`inline-block p-2 rounded-lg ${message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-300'}`}>
              {message.content}
            </span>
          </div>
        ))}
        {isTyping && (
          <div className="mb-4 text-left">
            <span className="inline-block p-2 rounded-lg bg-gray-300">
              <span className="flex space-x-1">
                <span className="w-2 h-2 bg-gray-600 rounded-full animate-typing"></span>
                <span className="w-2 h-2 bg-gray-600 rounded-full animate-typing" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-2 h-2 bg-gray-600 rounded-full animate-typing" style={{ animationDelay: '0.4s' }}></span>
              </span>
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-4 bg-white">
        <div className="flex">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            className="flex-1 border rounded-l-lg p-2"
            placeholder="Talk to Friend Bee here..."
          />
          <button type="submit" className="bg-blue-500 text-white rounded-r-lg px-4 py-2">Send</button>
        </div>
      </form>
    </div>
  );
}

interface Friend {
  name: string;
  avatar: string;
  id: string;
  color: string;
}

function stringToColor(str: string): string {
  const tailwindColors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500',
    'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
    'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
    'bg-pink-500', 'bg-rose-500'
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % tailwindColors.length;
  return tailwindColors[index];
}

function FriendsView() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const response = await fetch(`/api/friends/${uuid}`);
        if (!response.ok) {
          throw new Error('Failed to fetch friends');
        }
        const data = await response.json();

        const friendNames: string[] = data.friends;
        const friendMap: { [key: string]: string } = data.friendMap;

        const fetchedFriends: Friend[] = friendNames.map((friend: string) => ({
          name: friend,
          avatar: friend[0].toUpperCase(),
          id: friendMap[friend],
          color: stringToColor(friend),
        }));

        setFriends(fetchedFriends);
      } catch (error) {
        console.error('Error fetching friends:', error);
      }
    };

    fetchFriends();

    // Check URL parameters for initial selected friend
    const params = new URLSearchParams(window.location.search);
    const friendName = params.get('name');
    const friendId = params.get('id');
    if (friendName && friendId) {
      setSelectedFriend({
        name: friendName,
        avatar: friendName[0].toUpperCase(),
        id: friendId,
        color: stringToColor(friendName),
      });
    }
  }, []);

  const filteredFriends = friends.filter(friend =>
    friend.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFriendClick = (friend: Friend) => {
    setSelectedFriend(friend);
    const params = new URLSearchParams(window.location.search);
    params.set('name', friend.name);
    params.set('id', friend.id);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  };

  const handleBackClick = () => {
    setSelectedFriend(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('name');
    params.delete('id');
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  };

  if (selectedFriend) {
    return <FriendProfileView friend={selectedFriend} onBack={handleBackClick} />;
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="bg-red-500 bg-orange-500 bg-amber-500 bg-yellow-500 bg-lime-500 bg-green-500 bg-emerald-500 bg-teal-500 bg-cyan-500 bg-sky-500 bg-blue-500 bg-indigo-500 bg-violet-500 bg-purple-500 bg-fuchsia-500 bg-pink-500 bg-rose-500" />
      <div className="p-4">
        <input
          type="text"
          placeholder="Search friends..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded-lg"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {filteredFriends.map((friend) => (
          <div
            key={friend.id}
            onClick={() => handleFriendClick(friend)}
            className="flex items-center mb-4 bg-white p-3 rounded-lg cursor-pointer hover:bg-gray-200"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mr-3 ${friend.color}`}
            >
              {friend.avatar}
            </div>
            <span>{friend.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FriendProfileViewProps {
  friend: Friend;
  onBack: () => void;
}

interface FriendInfo {
  name: string;
  facts: {
    [key: string]: { value: string, confidence: 'high' | 'medium' | 'low', importance: number }
  }
  lists: {
    [key: string]: { value: string, timestamp?: string | null }[]
  }
}

function FriendProfileView({ friend, onBack }: FriendProfileViewProps) {
  const [friendInfo, setFriendInfo] = useState<FriendInfo | null>(null);

  useEffect(() => {
    const fetchFriendInfo = async () => {
      try {
        const response = await fetch(`/api/friend/${uuid}/${friend.name}/${friend.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch friend info');
        }
        const data = await response.json();
        const friendResp = data.friend;

        const friendInfo: FriendInfo = { name: friendResp.name, facts: {}, lists: {} };
        for (const key in friendResp) {
          if (key === 'lists') {
            friendInfo.lists = friendResp[key];
          } else if (key === 'relationship' || key === 'name' || key === 'id') {
            continue;
          } else {
            friendInfo.facts[key] = friendResp[key];
          }
        }

        setFriendInfo(friendInfo);
      } catch (error) {
        console.error('Error fetching friend info:', error);
      }
    };

    fetchFriendInfo();
  }, [friend]);

  if (!friendInfo) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center mb-4">
        <button onClick={onBack} className="mr-4 bg-blue-500 text-white p-2 rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold">{friendInfo.name}</h2>
      </div>
      <div className="bg-white p-4 rounded-lg flex flex-col">
        {Object.entries(friendInfo.facts)
          .sort((a, b) => (a[1].importance || 0) - (b[1].importance || 0))
          .map(([key, fact]: [string, any]) => (
            <div key={key}>
              <div className="m-2 p-2 bg-gray-100 rounded inline-block">
                {key}: {fact.value}
                {fact.confidence === 'medium' && ' (probably)'}
                {fact.confidence === 'low' && ' (not sure)'}
              </div>
            </div>
          ))}
        {Object.entries(friendInfo.lists).map(([key, list]: [string, any]) => (
          <div key={key}>
            <div className="m-2 p-2 bg-gray-100 rounded inline-block">
              {key}: {list.map((item: any) =>
                item.timestamp
                  ? `[${item.timestamp}] ${item.value}`
                  : item.value
              ).join(', ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TabWrapper() {
  const [activeTab, setActiveTab] = useState('Home');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['home', 'friends', 'settings'].includes(tabParam.toLowerCase())) {
      setActiveTab(tabParam.charAt(0).toUpperCase() + tabParam.slice(1).toLowerCase());
    }
    // Clear the name and id params when changing tabs
    if (tabParam !== 'friends') {
      params.delete('name');
      params.delete('id');
      window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    }
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Home':
        return <ChatApp />;
      case 'Friends':
        return <FriendsView />;
      case 'Settings':
        return <div>Settings view (to be implemented)</div>;
      default:
        return null;
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab.toLowerCase());
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1">
        {renderTabContent()}
      </div>
      <div className="flex bg-gray-200">
        {['Home', 'Friends', 'Settings'].map((tab) => (
          <button
            key={tab}
            className={`flex-1 px-4 py-2 ${activeTab === tab ? 'bg-white' : ''}`}
            onClick={() => handleTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
