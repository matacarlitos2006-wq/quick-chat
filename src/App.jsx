import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, deleteDoc } from 'firebase/firestore';

// DEVELOPER DEFINITION
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeChat, setActiveChat] = useState(null); 
  const [recentChats, setRecentChats] = useState([]);
  const [channels, setChannels] = useState([]); 
  const [messages, setMessages] = useState([]);
  const [messageLimit, setMessageLimit] = useState(30); // NEW: Pagination limit
  const [newMessage, setNewMessage] = useState('');
  const [myBio, setMyBio] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [activeReactionMenuId, setActiveReactionMenuId] = useState(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [savedLocalName, setSavedLocalName] = useState('');
  const [customAvatarURL, setCustomAvatarURL] = useState('');
  const [savedAvatarURL, setSavedAvatarURL] = useState('');
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('chat_theme') === 'dark');

  const chatEndRef = useRef(null);
  const prevMessagesCountRef = useRef(0);

  // --- LOGIC FUNCTIONS ---
  const isImageURL = (url) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.webp');
  };

  useEffect(() => { if (user && Notification.permission === 'default') Notification.requestPermission(); }, [user]);

  // Live Message Stream with Pagination
  useEffect(() => {
    if (!user || !activeChat) {
      setMessages([]);
      return;
    }
    const isChannel = activeChat.isChannel;
    const roomId = isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');
    const q = query(collection(db, 'messages'), where('chatRoomId', '==', roomId), orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      
      // Notify on new message
      if (prevMessagesCountRef.current > 0 && msgs.length > prevMessagesCountRef.current) {
        const last = msgs[msgs.length - 1];
        if (last.senderId !== user.uid) {
            new Audio(SOUND_RECEIVE).play().catch(() => {});
            if (document.hidden && Notification.permission === 'granted') {
                new Notification(`Message from ${last.senderName}`, { body: last.text, tag: roomId });
            }
        }
      }
      prevMessagesCountRef.current = msgs.length;
    });
    return () => unsubscribe();
  }, [activeChat?.uid, user]);

  // Auth, Presence, and other effect hooks remain here...
  // (Full context omitted for brevity, ensure your existing logic is intact)

  const theme = {
    bgOuter: darkMode ? '#18191a' : '#f0f2f5',
    bgContainer: darkMode ? '#242526' : '#ffffff',
    bgSidebar: darkMode ? '#1c1d1e' : '#f7f8fa',
    bgHeader: darkMode ? '#242526' : '#ffffff',
    bgBubbleMe: '#0084ff',
    bgBubbleThem: darkMode ? '#3a3b3c' : '#e4e6eb',
    bgInput: darkMode ? '#3a3b3c' : '#f0f2f5',
    textMain: darkMode ? '#e4e6eb' : '#333333',
    textSub: darkMode ? '#b0b3b8' : '#666666',
    border: darkMode ? '#3a3b3c' : '#e0e0e0',
  };

  return (
    <div style={{ ...styles.desktopWrapper, backgroundColor: theme.bgOuter }}>
      <div style={{ ...styles.desktopAppContainer, backgroundColor: theme.bgContainer }}>
        {/* ... Sidebar remains the same ... */}
        
        <div style={{ ...styles.chatWindow, backgroundColor: theme.bgContainer }}>
          {activeChat ? (
            <>
              <div style={{ ...styles.messageStream, backgroundColor: theme.bgOuter }}>
                {/* Pagination Trigger */}
                {messages.length > messageLimit && (
                  <button onClick={() => setMessageLimit(prev => prev + 30)} style={styles.loadMoreBtn}>
                    Load Previous Messages
                  </button>
                )}
                
                {/* Sliced Messages based on limit */}
                {messages.slice(-messageLimit).map((msg) => (
                    // ... your message rendering logic ...
                    <div key={msg.id}> {msg.text} </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              {/* ... Input field remains the same ... */}
            </>
          ) : (
            <div style={styles.emptyStateContainer}>Select a chat to start</div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  // Existing styles...
  loadMoreBtn: { 
    margin: '10px auto', 
    padding: '8px 16px', 
    backgroundColor: '#0084ff', 
    color: '#fff', 
    border: 'none', 
    borderRadius: '20px', 
    cursor: 'pointer', 
    fontSize: '12px' 
  },
  // ... rest of styles
};

export default App;