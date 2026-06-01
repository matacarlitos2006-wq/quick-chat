import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, deleteDoc } from 'firebase/firestore';

const DEVELOPER_EMAIL = "matacarlitos2006@gmail.com";
const SOUND_SEND = "https://assets.mixkit.co/active_storage/sfx/2357/2357-84.wav"; 
const SOUND_RECEIVE = "https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav"; 

const TikTokBadge = () => (
  <svg viewBox="0 0 24 24" style={{ width: '15px', height: '15px', verticalAlign: 'middle', marginLeft: '2px' }}>
    <path fill="#25f4ee" d="M12,2C6.5,2,2,6.5,2,12s4.5,10,10,10s10-4.5,10-10S17.5,2,12,2z M10.1,16.4l-4-4l1.4-1.4l2.6,2.6l6.6-6.6l1.4,1.4L10.1,16.4z"/>
  </svg>
);

function App() {
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageLimit, setMessageLimit] = useState(30); 
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(localStorage.getItem('chat_theme') === 'dark');
  
  // Necessary states for UI components
  const [recentChats, setRecentChats] = useState([]);
  const [channels, setChannels] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return unsubscribe;
  }, []);

  // Message Stream with Pagination logic
  useEffect(() => {
    if (!user || !activeChat) return;
    const roomId = activeChat.isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');
    const q = query(collection(db, 'messages'), where('chatRoomId', '==', roomId), orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      if (document.hidden && Notification.permission === 'granted' && msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        if (last.senderId !== user.uid) new Notification("New Message", { body: last.text });
      }
    });
    return () => unsubscribe();
  }, [activeChat, user]);

  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, messageLimit]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;
    const roomId = activeChat.isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');
    await addDoc(collection(db, 'messages'), {
      chatRoomId: roomId,
      text: newMessage,
      createdAt: new Date(),
      senderId: user.uid,
      senderName: user.displayName || 'User',
      photoURL: user.photoURL || ''
    });
    setNewMessage('');
  };

  if (!user) return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
      <button onClick={() => signInWithPopup(auth, googleProvider)}>Sign in with Google</button>
    </div>
  );

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', backgroundColor: darkMode ? '#18191a' : '#f0f2f5' }}>
      {/* Sidebar - Condensed version */}
      <div style={{ width: '300px', borderRight: '1px solid #ccc', backgroundColor: darkMode ? '#242526' : '#fff' }}>
        <h3 style={{ padding: '20px' }}>Chats</h3>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeChat ? (
          <>
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
              {messages.length >= messageLimit && (
                <button onClick={() => setMessageLimit(prev => prev + 30)} style={{ display: 'block', margin: '0 auto 10px' }}>
                  Load Previous
                </button>
              )}
              {messages.slice(-messageLimit).map((msg) => (
                <div key={msg.id} style={{ marginBottom: '10px', textAlign: msg.senderId === user.uid ? 'right' : 'left' }}>
                  <span style={{ backgroundColor: msg.senderId === user.uid ? '#0084ff' : '#e4e6eb', padding: '8px 12px', borderRadius: '18px', display: 'inline-block' }}>
                    {msg.text}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} style={{ padding: '20px' }}>
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} style={{ width: '80%' }} />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Select a chat</div>
        )}
      </div>
    </div>
  );
}

export default App;