import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, deleteDoc, limitToLast } from 'firebase/firestore';

const DEVELOPER_EMAIL = "matacarlitos2006@gmail.com";
const SOUND_SEND = "https://assets.mixkit.co/active_storage/sfx/2357/2357-84.wav"; 
const SOUND_RECEIVE = "https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav"; 

const TikTokBadge = () => (
  <svg viewBox="0 0 24 24" style={{ width: '15px', height: '15px', minWidth: '15px', display: 'inline-block', verticalAlign: 'middle', marginLeft: '2px' }}>
    <path fill="#25f4ee" d="M12,2C6.5,2,2,6.5,2,12s4.5,10,10,10s10-4.5,10-10S17.5,2,12,2z M10.1,16.4l-4-4l1.4-1.4l2.6,2.6l6.6-6.6l1.4,1.4L10.1,16.4z"/>
  </svg>
);

function App() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageLimit, setMessageLimit] = useState(30); // NEW: Pagination state
  const [activeChat, setActiveChat] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [channels, setChannels] = useState([]);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  
  const chatEndRef = useRef(null);

  // 1. Live Message Stream with Pagination
  useEffect(() => {
    if (!user || !activeChat) {
      setMessages([]);
      return;
    }
    const isChannel = activeChat.isChannel;
    const roomId = isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');

    const q = query(
      collection(db, 'messages'),
      where('chatRoomId', '==', roomId),
      orderBy('createdAt', 'asc'),
      limitToLast(messageLimit) // Optimization: Only read X amount of messages
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [activeChat?.uid, user, messageLimit]);

  // 2. Auto-scroll
  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !activeChat) return;
    const isChannel = activeChat.isChannel;
    const roomId = isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');
    await addDoc(collection(db, 'messages'), {
      chatRoomId: roomId, text: newMessage, createdAt: new Date(), senderId: user.uid, senderName: user.displayName
    });
    setNewMessage('');
  };

  if (!user) return <button onClick={() => signInWithPopup(auth, googleProvider)}>Sign in with Google</button>;

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f0f2f5' }}>
      <div style={{ width: '300px', borderRight: '1px solid #ccc', backgroundColor: '#fff' }}>
        <h3>Your Chats</h3>
        {/* Sidebar content... */}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeChat ? (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {/* NEW: Load More Button */}
              <button 
                onClick={() => setMessageLimit(prev => prev + 30)}
                style={{ display: 'block', margin: '10px auto', padding: '8px 16px', cursor: 'pointer' }}
              >
                Load Older Messages
              </button>

              {messages.map((msg) => (
                <div key={msg.id} style={{ textAlign: msg.senderId === user.uid ? 'right' : 'left', margin: '10px 0' }}>
                  <span style={{ padding: '8px', background: '#ddd', borderRadius: '10px' }}>{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} style={{ padding: '20px' }}>
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
              <button type="submit">Send</button>
            </form>
          </>
        ) : <div>Select a chat</div>}
      </div>
    </div>
  );
}

export default App;