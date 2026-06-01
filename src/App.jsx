import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where } from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef(null);

  // 1. Handle user login state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL,
          searchName: currentUser.displayName.toLowerCase()
        }, { merge: true });
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Load permanent chat log history from LocalStorage
  useEffect(() => {
    if (user) {
      const savedChats = localStorage.getItem(`recents_${user.uid}`);
      if (savedChats) {
        setRecentChats(JSON.parse(savedChats));
      } else {
        setRecentChats([]);
      }
    }
  }, [user]);

  // 3. Look up other users in real-time
  useEffect(() => {
    if (!searchQuery.trim() || !user) {
      setSearchResults([]);
      return;
    }

    const q = query(
      collection(db, 'users'),
      where('searchName', '>=', searchQuery.toLowerCase()),
      where('searchName', '<=', searchQuery.toLowerCase() + '\uf8ff')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = [];
      snapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.uid !== user.uid) {
          usersList.push(userData);
        }
      });
      setSearchResults(usersList);
    });

    return () => unsubscribe();
  }, [searchQuery, user]);

  // 4. Live message stream + automatically save user to history log
  useEffect(() => {
    if (!user || !activeChatUser) {
      setMessages([]);
      return;
    }

    const roomId = [user.uid, activeChatUser.uid].sort().join('_');

    const q = query(
      collection(db, 'messages'),
      where('chatRoomId', '==', roomId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);
    });

    // Append to history list so you never have to search their name again
    setRecentChats((prev) => {
      const filtered = prev.filter((u) => u.uid !== activeChatUser.uid);
      const updated = [activeChatUser, ...filtered];
      localStorage.setItem(`recents_${user.uid}`, JSON.stringify(updated));
      return updated;
    });

    return () => unsubscribe();
  }, [activeChatUser, user]);

  // Auto-scroll screen to latest text
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = () => signInWithPopup(auth, googleProvider).catch(err => console.error(err));
  const handleLogout = () => { signOut(auth); setActiveChatUser(null); };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !activeChatUser) return;

    const roomId = [user.uid, activeChatUser.uid].sort().join('_');

    try {
      await addDoc(collection(db, 'messages'), {
        chatRoomId: roomId,
        text: newMessage,
        createdAt: new Date(),
        senderId: user.uid,
        senderName: user.displayName,
        photoURL: user.photoURL
      });
      setNewMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <h2>QuickChat Desktop</h2>
          <p>Sign in with Google to start messaging.</p>
          <button onClick={handleLogin} style={styles.loginButton}>Sign in with Google</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.desktopWrapper}>
      <div style={styles.desktopAppContainer}>
        
        {/* SIDEBAR */}
        <div style={styles.sidebar}>
          <div style={styles.myProfileHeader}>
            <img src={user.photoURL} alt="" style={styles.avatar} />
            <div style={styles.profileText}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#333' }}>{user.displayName}</div>
              <div style={{ fontSize: '11px', color: '#2ecc71', fontWeight: 'bold' }}>Online</div>
            </div>
            <button onClick={handleLogout} style={styles.smallLogoutBtn}>Exit</button>
          </div>

          <div style={styles.searchBoxWrapper}>
            <input
              type="text"
              placeholder="🔍 Search users to chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.userListContainer}>
            {searchQuery ? (
              <>
                <div style={styles.sectionLabel}>Search Results</div>
                {searchResults.map((u) => (
                  <div
                    key={u.uid}
                    onClick={() => { setActiveChatUser(u); setSearchQuery(''); }}
                    style={styles.userRow}
                  >
                    <img src={u.photoURL} alt="" style={styles.avatar} />
                    <span style={styles.userRowName}>{u.displayName}</span>
                  </div>
                ))}
                {searchResults.length === 0 && (
                  <div style={styles.noUserHint}>No users found.</div>
                )}
              </>
            ) : (
              <>
                <div style={styles.sectionLabel}>Recent Conversations</div>
                {recentChats.map((u) => (
                  <div
                    key={u.uid}
                    onClick={() => setActiveChatUser(u)}
                    style={{
                      ...styles.userRow,
                      backgroundColor: activeChatUser?.uid === u.uid ? '#e3f2fd' : 'transparent'
                    }}
                  >
                    <img src={u.photoURL} alt="" style={styles.avatar} />
                    <span style={styles.userRowName}>{u.displayName}</span>
                  </div>
                ))}
                {recentChats.length === 0 && (
                  <div style={styles.noUserHint}>Your history is empty. Search a user above to lock them in!</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* CHAT WINDOW */}
        <div style={styles.chatWindow}>
          {activeChatUser ? (
            <>
              <div style={styles.chatWindowHeader}>
                <img src={activeChatUser.photoURL} alt="" style={styles.avatar} />
                <div style={{ marginLeft: '12px', fontWeight: 'bold', color: '#333' }}>{activeChatUser.displayName}</div>
              </div>

              <div style={styles.messageStream}>
                {messages.map((msg) => {
                  const isMe = msg.senderId === user.uid;
                  return (
                    <div key={msg.id} style={{ ...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        ...styles.msgBubble,
                        backgroundColor: isMe ? '#0084ff' : '#e4e6eb',
                        color: isMe ? '#ffffff' : '#333333',
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} style={styles.messageInputForm}>
                <input
                  type="text"
                  placeholder={`Message ${activeChatUser.displayName}...`}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={styles.desktopInputField}
                />
                <button type="submit" style={styles.desktopSendBtn}>Send</button>
              </form>
            </>
          ) : (
            <div style={styles.emptyStateContainer}>
              <h3 style={{ color: '#555' }}>No Chat Selected</h3>
              <p style={{ color: '#888' }}>Find a user with the search bar or select a profile from your Recent Conversations log.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const styles = {
  loginContainer: { display: 'flex', height: '100vh', width: '100vw', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', fontFamily: 'sans-serif' },
  loginCard: { padding: '50px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '400px' },
  loginButton: { padding: '14px 28px', backgroundColor: '#4285F4', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', marginTop: '20px' },
  
  // NEW: Centers the layout completely on the screen and stops all horizontal scrolling layout leaks
  desktopWrapper: { display: 'flex', width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', overflow: 'hidden' },
  desktopAppContainer: { display: 'flex', width: '100%', maxWidth: '1200px', height: '100%', backgroundColor: '#fff', boxShadow: '0 0 20px rgba(0,0,0,0.05)', overflow: 'hidden' },
  
  sidebar: { width: '350px', minWidth: '320px', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', backgroundColor: '#f7f8fa' },
  myProfileHeader: { display: 'flex', alignItems: 'center', padding: '15px', backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0' },
  profileText: { marginLeft: '10px', flex: 1 },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' },
  smallLogoutBtn: { padding: '6px 12px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' },
  searchBoxWrapper: { padding: '12px' },
  searchInput: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box', outline: 'none', fontSize: '14px', color: '#333', backgroundColor: '#fff' },
  userListContainer: { flex: 1, overflowY: 'auto' },
  sectionLabel: { padding: '10px 15px', fontSize: '12px', color: '#65676b', fontWeight: 'bold', textTransform: 'uppercase' },
  userRow: { display: 'flex', alignItems: 'center', padding: '12px 15px', cursor: 'pointer', transition: 'background 0.2s' },
  userRowName: { marginLeft: '12px', fontWeight: '500', color: '#333' },
  noUserHint: { padding: '15px', fontSize: '13px', color: '#888', textAlign: 'center' },
  chatWindow: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', height: '100%' },
  chatWindowHeader: { display: 'flex', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #e0e0e0', backgroundColor: '#fff' },
  messageStream: { flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#f0f2f5', display: 'flex', flexDirection: 'column', gap: '8px' },
  messageRow: { display: 'flex', width: '100%' },
  msgBubble: { padding: '12px 16px', borderRadius: '18px', maxWidth: '60%', fontSize: '15px', lineHeight: '1.4', boxSizing: 'border-box' },
  messageInputForm: { display: 'flex', padding: '15px 20px', backgroundColor: '#fff', borderTop: '1px solid #e0e0e0', alignItems: 'center' },
  desktopInputField: { flex: 1, padding: '14px 18px', borderRadius: '24px', border: '1px solid #ccd0d5', outline: 'none', fontSize: '15px', backgroundColor: '#f0f2f5', color: '#333' },
  desktopSendBtn: { marginLeft: '12px', padding: '12px 24px', backgroundColor: '#0084ff', color: '#fff', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold' },
  emptyStateContainer: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', textAlign: 'center', padding: '20px' }
};

export default App;