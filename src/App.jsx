import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, deleteDoc } from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Status & Bio States
  const [myBio, setMyBio] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);

  // Track which message ID is currently being hovered over
  const [hoveredMessageId, setHoveredMessageId] = useState(null);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('chat_theme');
    return savedTheme === 'dark';
  });

  const chatEndRef = useRef(null);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const nextMode = !prev;
      localStorage.setItem('chat_theme', nextMode ? 'dark' : 'light');
      return nextMode;
    });
  };

  // 1. Auth Listener + Sync Profile Info
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

        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists() && docSnap.data().bio) {
            setMyBio(docSnap.data().bio);
          }
        });
        return () => unsubDoc();
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Load Recent Chats
  useEffect(() => {
    if (user) {
      const savedChats = localStorage.getItem(`recents_${user.uid}`);
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats);
        const uids = parsedChats.map(u => u.uid);
        if (uids.length > 0) {
          const q = query(collection(db, 'users'), where('uid', 'in', uids));
          const unsubCachedUsers = onSnapshot(q, (snapshot) => {
            const updatedUsers = [];
            snapshot.forEach(doc => updatedUsers.push(doc.data()));
            setRecentChats(updatedUsers);
          });
          return () => unsubCachedUsers();
        }
      }
    }
  }, [user, activeChatUser]);

  // 3. Live Search Users
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
        if (userData.uid !== user.uid) usersList.push(userData);
      });
      setSearchResults(usersList);
    });
    return () => unsubscribe();
  }, [searchQuery, user]);

  // 4. Live Message Stream Channel
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

    setRecentChats((prev) => {
      const filtered = prev.filter((u) => u.uid !== activeChatUser.uid);
      const updated = [activeChatUser, ...filtered];
      localStorage.setItem(`recents_${user.uid}`, JSON.stringify(updated));
      return updated;
    });

    return () => unsubscribe();
  }, [activeChatUser, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = () => signInWithPopup(auth, googleProvider).catch(err => console.error(err));
  const handleLogout = () => { signOut(auth); setActiveChatUser(null); };

  const handleSaveBio = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { bio: myBio });
      setIsEditingBio(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !activeChatUser) return;
    const roomId = [user.uid, activeChatUser.uid].sort().join('_');

    await addDoc(collection(db, 'messages'), {
      chatRoomId: roomId,
      text: newMessage,
      createdAt: new Date(),
      senderId: user.uid,
      senderName: user.displayName,
      photoURL: user.photoURL
    });
    setNewMessage('');
  };

  // NEW: Unsend / Delete Message Trigger Function
  const handleUnsendMessage = async (messageId) => {
    const confirmUnsend = window.confirm("Are you sure you want to unsend this message?");
    if (!confirmUnsend) return;

    try {
      await deleteDoc(doc(db, 'messages', messageId));
    } catch (err) {
      console.error("Error deleting document from cloud: ", err);
    }
  };

  // Theme Palette
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
    rowHoverActive: darkMode ? '#2f3031' : '#e3f2fd',
    unsendBtnColor: darkMode ? '#ff4d4d' : '#e74c3c'
  };

  if (!user) {
    return (
      <div style={{ ...styles.loginContainer, backgroundColor: theme.bgOuter }}>
        <div style={{ ...styles.loginCard, backgroundColor: theme.bgContainer }}>
          <h2 style={{ color: theme.textMain }}>QuickChat Desktop</h2>
          <p style={{ color: theme.textSub }}>Sign in with Google to talk to your person.</p>
          <button onClick={handleLogin} style={styles.loginButton}>Sign in with Google</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.desktopWrapper, backgroundColor: theme.bgOuter }}>
      <div style={{ ...styles.desktopAppContainer, backgroundColor: theme.bgContainer, boxShadow: darkMode ? '0 0 20px rgba(0,0,0,0.4)' : '0 0 20px rgba(0,0,0,0.05)' }}>
        
        {/* SIDEBAR */}
        <div style={{ ...styles.sidebar, backgroundColor: theme.bgSidebar, borderRight: `1px solid ${theme.border}` }}>
          <div style={{ ...styles.myProfileHeaderContainer, backgroundColor: theme.bgContainer, borderBottom: `1px solid ${theme.border}` }}>
            <div style={styles.myProfileHeader}>
              <img src={user.photoURL} alt="" style={styles.avatar} />
              <div style={styles.profileText}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: theme.textMain }}>{user.displayName}</div>
                <div style={{ fontSize: '11px', color: '#2ecc71', fontWeight: 'bold' }}>Online 🟢</div>
              </div>
              <button onClick={toggleDarkMode} style={styles.themeToggleBtn}>{darkMode ? '☀️' : '🌙'}</button>
              <button onClick={handleLogout} style={styles.smallLogoutBtn}>Exit</button>
            </div>
            
            <div style={styles.bioWidgetWrapper}>
              {isEditingBio ? (
                <div style={{ display: 'flex', gap: '5px', width: '100%' }}>
                  <input 
                    type="text" 
                    value={myBio} 
                    onChange={(e) => setMyBio(e.target.value)} 
                    placeholder="Set a status update..." 
                    maxLength={60}
                    style={{ ...styles.bioInputField, backgroundColor: theme.bgInput, color: theme.textMain, border: `1px solid ${theme.border}` }}
                  />
                  <button onClick={handleSaveBio} style={styles.bioSaveBtn}>Save</button>
                </div>
              ) : (
                <div onClick={() => setIsEditingBio(true)} style={{ ...styles.bioStatusTextDisplay, backgroundColor: theme.bgInput, color: theme.textSub }}>
                  {myBio ? `📝 "${myBio}"` : "✍️ Click to set a custom status bio..."}
                </div>
              )}
            </div>
          </div>

          <div style={styles.searchBoxWrapper}>
            <input
              type="text"
              placeholder="🔍 Search users to chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...styles.searchInput, backgroundColor: theme.bgContainer, color: theme.textMain, border: `1px solid ${theme.border}` }}
            />
          </div>

          <div style={styles.userListContainer}>
            {searchQuery ? (
              <>
                <div style={{ ...styles.sectionLabel, color: theme.textSub }}>Search Results</div>
                {searchResults.map((u) => (
                  <div key={u.uid} onClick={() => { setActiveChatUser(u); setSearchQuery(''); }} style={styles.userRow}>
                    <img src={u.photoURL} alt="" style={styles.avatar} />
                    <div style={styles.userRowTextGroup}>
                      <span style={{ ...styles.userRowName, color: theme.textMain }}>{u.displayName}</span>
                      {u.bio && <span style={{ ...styles.userRowBioPreview, color: theme.textSub }}>"{u.bio}"</span>}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div style={{ ...styles.sectionLabel, color: theme.textSub }}>Recent Conversations</div>
                {recentChats.map((u) => (
                  <div
                    key={u.uid}
                    onClick={() => setActiveChatUser(u)}
                    style={{
                      ...styles.userRow,
                      backgroundColor: activeChatUser?.uid === u.uid ? theme.rowHoverActive : 'transparent'
                    }}
                  >
                    <img src={u.photoURL} alt="" style={styles.avatar} />
                    <div style={styles.userRowTextGroup}>
                      <span style={{ ...styles.userRowName, color: theme.textMain }}>{u.displayName}</span>
                      {u.bio && <span style={{ ...styles.userRowBioPreview, color: theme.textSub }}>"{u.bio}"</span>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* CHAT WINDOW */}
        <div style={{ ...styles.chatWindow, backgroundColor: theme.bgContainer }}>
          {activeChatUser ? (
            <>
              <div style={{ ...styles.chatWindowHeader, backgroundColor: theme.bgHeader, borderBottom: `1px solid ${theme.border}` }}>
                <img src={activeChatUser.photoURL} alt="" style={styles.avatar} />
                <div style={{ marginLeft: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: theme.textMain }}>{activeChatUser.displayName}</div>
                  {activeChatUser.bio && <div style={{ fontSize: '12px', color: theme.textSub, fontStyle: 'italic', marginTop: '2px' }}>"{activeChatUser.bio}"</div>}
                </div>
              </div>

              <div style={{ ...styles.messageStream, backgroundColor: theme.bgOuter }}>
                {messages.map((msg) => {
                  const isMe = msg.senderId === user.uid;
                  return (
                    <div 
                      key={msg.id} 
                      style={{ ...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      {/* NEW: Display the Unsend button on the left side of your message bubble when hovered */}
                      {isMe && hoveredMessageId === msg.id && (
                        <button 
                          onClick={() => handleUnsendMessage(msg.id)}
                          style={{ ...styles.unsendActionBtn, color: theme.unsendBtnColor }}
                          title="Unsend message"
                        >
                          Unsend 🗑️
                        </button>
                      )}

                      <div style={{
                        ...styles.msgBubble,
                        backgroundColor: isMe ? theme.bgBubbleMe : theme.bgBubbleThem,
                        color: isMe ? '#ffffff' : theme.textMain,
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} style={{ ...styles.messageInputForm, backgroundColor: theme.bgHeader, borderTop: `1px solid ${theme.border}` }}>
                <input
                  type="text"
                  placeholder={`Message ${activeChatUser.displayName}...`}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ ...styles.desktopInputField, backgroundColor: theme.bgInput, color: theme.textMain, border: `1px solid ${theme.border}` }}
                />
                <button type="submit" style={styles.desktopSendBtn}>Send</button>
              </form>
            </>
          ) : (
            <div style={{ ...styles.emptyStateContainer, backgroundColor: theme.bgOuter }}>
              <h3 style={{ color: theme.textMain }}>Your Private Chat</h3>
              <p style={{ color: theme.textSub }}>Search for a user or select a profile from your recent conversations to start messaging.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const styles = {
  loginContainer: { display: 'flex', height: '100vh', width: '100vw', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' },
  loginCard: { padding: '50px', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '400px' },
  loginButton: { padding: '14px 28px', backgroundColor: '#4285F4', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', marginTop: '20px' },
  desktopWrapper: { display: 'flex', width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  desktopAppContainer: { display: 'flex', width: '100%', maxWidth: '1200px', height: '100%', overflow: 'hidden' },
  sidebar: { width: '350px', minWidth: '320px', display: 'flex', flexDirection: 'column' },
  myProfileHeaderContainer: { display: 'flex', flexDirection: 'column' },
  myProfileHeader: { display: 'flex', alignItems: 'center', padding: '15px 15px 5px 15px' },
  profileText: { marginLeft: '10px', flex: 1 },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' },
  themeToggleBtn: { border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', marginRight: '10px', padding: '4px', userSelect: 'none' },
  smallLogoutBtn: { padding: '6px 12px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' },
  bioWidgetWrapper: { padding: '0px 15px 12px 15px' },
  bioStatusTextDisplay: { fontSize: '13px', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' },
  bioInputField: { flex: 1, padding: '6px 10px', borderRadius: '6px', outline: 'none', fontSize: '13px' },
  bioSaveBtn: { padding: '6px 12px', backgroundColor: '#2ecc71', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  searchBoxWrapper: { padding: '12px' },
  searchInput: { width: '100%', padding: '12px', borderRadius: '8px', boxSizing: 'border-box', outline: 'none', fontSize: '14px' },
  userListContainer: { flex: 1, overflowY: 'auto' },
  sectionLabel: { padding: '10px 15px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' },
  userRow: { display: 'flex', alignItems: 'center', padding: '12px 15px', cursor: 'pointer', transition: 'background 0.2s' },
  userRowTextGroup: { display: 'flex', flexDirection: 'column', marginLeft: '12px', flex: 1, overflow: 'hidden' },
  userRowName: { fontWeight: '500' },
  userRowBioPreview: { fontSize: '12px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' },
  chatWindow: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
  chatWindowHeader: { display: 'flex', alignItems: 'center', padding: '15px 20px' },
  messageStream: { flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  
  // Adjusted alignment configuration to neatly float actions next to message flows
  messageRow: { display: 'flex', width: '100%', alignItems: 'center', position: 'relative', gap: '10px' },
  unsendActionBtn: { border: 'none', background: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: '600', padding: '4px 8px', borderRadius: '4px', transition: 'opacity 0.2s' },
  
  msgBubble: { padding: '12px 16px', borderRadius: '18px', maxWidth: '60%', fontSize: '15px', lineHeight: '1.4', boxSizing: 'border-box' },
  messageInputForm: { display: 'flex', padding: '15px 20px', alignItems: 'center' },
  desktopInputField: { flex: 1, padding: '14px 18px', borderRadius: '24px', outline: 'none', fontSize: '15px' },
  desktopSendBtn: { marginLeft: '12px', padding: '12px 24px', backgroundColor: '#0084ff', color: '#fff', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold' },
  emptyStateContainer: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '20px' }
};

export default App;