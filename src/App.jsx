import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
// 1. ADDED limitToLast HERE
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, deleteDoc, limitToLast } from 'firebase/firestore';

// ... (KEEP ALL YOUR EXISTING CONSTANTS LIKE DEVELOPER_EMAIL, SOUND_SEND, ETC. HERE)

function App() {
  // ... (KEEP ALL YOUR EXISTING STATES HERE)
  // 2. ADD THIS STATE:
  const [messageLimit, setMessageLimit] = useState(30);

  // ... (KEEP YOUR EXISTING FUNCTIONS LIKE updateUserPresence, isImageURL, etc.)

  // 3. REPLACE YOUR MESSAGE STREAM useEffect WITH THIS:
  useEffect(() => {
    if (!user || !activeChat) {
      setMessages([]);
      return;
    }
    setMessageSearchQuery(''); 

    const isChannel = activeChat.isChannel;
    const roomId = isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');

    const q = query(
      collection(db, 'messages'),
      where('chatRoomId', '==', roomId),
      orderBy('createdAt', 'asc'),
      limitToLast(messageLimit) // Optimization: Limits read size
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });

    // ... (KEEP YOUR PRESENCE LOGIC AND CLEANUP)
    return () => unsubscribe();
  }, [activeChat?.uid, user, messageLimit]); // Dependency included

  // ... (KEEP YOUR OTHER USEEFFECTS)

  return (
    <div style={{ ...styles.desktopWrapper, backgroundColor: theme.bgOuter }}>
      {/* ... (KEEP YOUR SIDEBAR CODE) ... */}
      
      <div style={{ ...styles.chatWindow, backgroundColor: theme.bgContainer }}>
        {activeChat ? (
          <>
            <div style={{ ...styles.messageStream, backgroundColor: theme.bgOuter }}>
              
              {/* 4. ADD THE LOAD MORE BUTTON HERE */}
              <button 
                onClick={() => setMessageLimit(prev => prev + 30)}
                style={styles.loadMoreBtn}
              >
                Load Older Messages
              </button>

              {/* ... (YOUR EXISTING filteredMessages.map(...) CODE) ... */}
              <div ref={chatEndRef} />
            </div>
            {/* ... (KEEP YOUR FORM AND FOOTER) ... */}
          </>
        ) : (
          <div style={styles.emptyStateContainer}>Select a chat to start</div>
        )}
      </div>
    </div>
  );
}

// 5. ADD THE NEW STYLE AT THE BOTTOM
const styles = {
  // ... (YOUR EXISTING STYLES)
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