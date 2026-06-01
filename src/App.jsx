import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, deleteDoc, limitToLast } from 'firebase/firestore';

// ... (KEEP YOUR CONSTANTS, SVGs, AND HELPER FUNCTIONS HERE)

function App() {
  // 1. STATE DECLARATIONS
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null); // CRITICAL: This was likely missing
  const [messages, setMessages] = useState([]);
  const [messageLimit, setMessageLimit] = useState(30);
  const [newMessage, setNewMessage] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  // ... (KEEP ALL YOUR OTHER STATES: recentChats, channels, darkMode, etc.)

  const chatEndRef = useRef(null);

  // 2. PAGINATED MESSAGE STREAM
  useEffect(() => {
    if (!user || !activeChat) {
      setMessages([]);
      return;
    }
    
    const isChannel = activeChat?.isChannel;
    const roomId = isChannel ? activeChat?.id : [user.uid, activeChat?.uid].sort().join('_');

    const q = query(
      collection(db, 'messages'),
      where('chatRoomId', '==', roomId),
      orderBy('createdAt', 'asc'),
      limitToLast(messageLimit)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [activeChat?.uid, user, messageLimit]);

  // ... (KEEP YOUR OTHER USEEFFECTS: Auth, Presence, Sound, etc.)

  // 3. RENDER
  return (
    <div style={{ ...styles.desktopWrapper }}>
      {/* ... (KEEP YOUR SIDEBAR HERE) ... */}

      <div style={{ ...styles.chatWindow }}>
        {activeChat ? (
          <>
            <div style={{ ...styles.messageStream }}>
              {/* PAGINATION TRIGGER */}
              <button 
                onClick={() => setMessageLimit(prev => prev + 30)}
                style={styles.loadMoreBtn}
              >
                Load Older Messages
              </button>

              {/* ... (KEEP YOUR EXISTING MAP LOGIC) ... */}
              <div ref={chatEndRef} />
            </div>
            {/* ... (KEEP YOUR FORM) ... */}
          </>
        ) : (
          <div>Select a chat</div>
        )}
      </div>
    </div>
  );
}

// 4. STYLE OBJECT
const styles = {
  // ... (KEEP YOUR EXISTING STYLES)
  loadMoreBtn: { 
    margin: '10px auto', 
    padding: '8px 16px', 
    backgroundColor: '#0084ff', 
    color: '#fff', 
    border: 'none', 
    borderRadius: '20px', 
    cursor: 'pointer', 
    fontSize: '12px',
    display: 'block'
  }
};

export default App;