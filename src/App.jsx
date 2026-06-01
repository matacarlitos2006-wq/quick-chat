import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, deleteDoc } from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  // Active Chat State (User Profile or Group Channel)
  const [activeChat, setActiveChat] = useState(null); 
  
  const [recentChats, setRecentChats] = useState([]);
  const [channels, setChannels] = useState([]); 
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Status & Bio States
  const [myBio, setMyBio] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);

  // Message Actions
  const [hoveredMessageId, setHoveredMessageId] = useState(null);

  // NEW: Inside-Chat Message Stream Filtering Search State
  const [messageSearchQuery, setMessageSearchQuery] = useState('');

  // Settings Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [savedLocalName, setSavedLocalName] = useState('');

  // Group Channel Creation Modal State
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

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
          email: currentUser.email,
          photoURL: currentUser.photoURL,
        }, { merge: true });

        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.bio) setMyBio(data.bio);
            
            const activeName = data.customName || currentUser.displayName;
            setSavedLocalName(activeName);
            setCustomDisplayName(activeName);

            updateDoc(userDocRef, {
              displayName: activeName,
              searchName: activeName.toLowerCase()
            }).catch(err => console.error(err));
          }
        });
        return () => unsubDoc();
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Stream Global Public Channels from Firestore
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'channels'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const channelsList = [];
      snapshot.forEach((doc) => {
        channelsList.push({ id: doc.id, ...doc.data() });
      });
      setChannels(channelsList);
    });
    return () => unsubscribe();
  }, [user]);

  // 3. Load Recent Private DMs
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
  }, [user, activeChat]);

  // 4. Live Search Users
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

  // 5. Live Message Stream Channel (Clear header search when changing chat rooms)
  useEffect(() => {
    if (!user || !activeChat) {
      setMessages([]);
      return;
    }

    setMessageSearchQuery(''); // Reset search input value automatically on room change

    const isChannel = activeChat.isChannel;
    const roomId = isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');

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

    if (!isChannel) {
      setRecentChats((prev) => {
        const filtered = prev.filter((u) => u.uid !== activeChat.uid);
        const updated = [activeChat, ...filtered];
        localStorage.setItem(`recents_${user.uid}`, JSON.stringify(updated));
        return updated;
      });
    }

    return () => unsubscribe();
  }, [activeChat, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = () => signInWithPopup(auth, googleProvider).catch(err => console.error(err));
  const handleLogout = () => { signOut(auth); setActiveChat(null); setIsSettingsOpen(false); };

  const handleSaveBio = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { bio: myBio });
      setIsEditingBio(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!customDisplayName.trim() || !user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        customName: customDisplayName.trim(),
        displayName: customDisplayName.trim(),
        searchName: customDisplayName.trim().toLowerCase()
      });
      setIsSettingsOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    const formattedName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    try {
      await addDoc(collection(db, 'channels'), {
        name: formattedName,
        createdAt: new Date(),
        createdBy: user.uid
      });
      setNewChannelName('');
      setIsCreateChannelOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !activeChat) return;
    
    const isChannel = activeChat.isChannel;
    const roomId = isChannel ? activeChat.id : [user.uid, activeChat.uid].sort().join('_');

    await addDoc(collection(db, 'messages'), {
      chatRoomId: roomId,
      text: newMessage,
      createdAt: new Date(),
      senderId: user.uid,
      senderName: savedLocalName,
      photoURL: user.photoURL
    });
    setNewMessage('');
  };

  const handleUnsendMessage = async (messageId) => {
    const confirmUnsend = window.confirm("Are you sure you want to unsend this message?");
    if (!confirmUnsend) return;
    try {
      await deleteDoc(doc(db, 'messages', messageId));
    } catch (err) {
      console.error(err);
    }
  };

  // NEW: Filter local messages list array dynamically based on header query value
  const filteredMessages = messages.filter((msg) => 
    msg.text.toLowerCase().includes(messageSearchQuery.toLowerCase())
  );

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
    unsendBtnColor: darkMode ? '#ff4d4d' : '#e74c3c',
    modalOverlay: darkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)'
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
        
        {/* SIDEBAR PANEL */}
        <div style={{ ...styles.sidebar, backgroundColor: theme.bgSidebar, borderRight: `1px solid ${theme.border}` }}>
          <div style={{ ...styles.myProfileHeaderContainer, backgroundColor: theme.bgContainer, borderBottom: `1px solid ${theme.border}` }}>
            <div style={styles.myProfileHeader}>
              <img src={user.photoURL} alt="" style={styles.avatar} />
              <div style={styles.profileText}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: theme.textMain }}>{savedLocalName}</div>
                <div style={{ fontSize: '11px', color: '#2ecc71', fontWeight: 'bold' }}>Online 🟢</div>
              </div>
              <button onClick={toggleDarkMode} style={styles.themeToggleBtn}>{darkMode ? '☀️' : '🌙'}</button>
              <button onClick={() => setIsSettingsOpen(true)} style={styles.settingsGearBtn} title="Account Settings">⚙️</button>
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
                  <div key={u.uid} onClick={() => { setActiveChat(u); setSearchQuery(''); }} style={styles.userRow}>
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
                {/* GROUP CHANNELS SUBSECTION */}
                <div style={styles.sectionHeaderRow}>
                  <div style={{ ...styles.sectionLabel, color: theme.textSub, padding: 0 }}>Group Channels</div>
                  <button onClick={() => setIsCreateChannelOpen(true)} style={styles.createChannelBtn}>Create Room ➕</button>
                </div>
                
                {channels.map((chan) => (
                  <div
                    key={chan.id}
                    onClick={() => setActiveChat({ ...chan, isChannel: true })}
                    style={{
                      ...styles.userRow,
                      backgroundColor: (activeChat?.isChannel && activeChat?.id === chan.id) ? theme.rowHoverActive : 'transparent'
                    }}
                  >
                    <div style={{ ...styles.hashtagAvatar, backgroundColor: theme.bgInput, color: theme.textMain }}>#</div>
                    <div style={styles.userRowTextGroup}>
                      <span style={{ ...styles.userRowName, color: theme.textMain, fontWeight: '600' }}>{chan.name}</span>
                    </div>
                  </div>
                ))}

                {/* PRIVATE DIRECT MESSAGES */}
                <div style={{ ...styles.sectionLabel, color: theme.textSub, marginTop: '15px' }}>Direct Messages</div>
                {recentChats.map((u) => (
                  <div
                    key={u.uid}
                    onClick={() => setActiveChat(u)}
                    style={{
                      ...styles.userRow,
                      backgroundColor: (!activeChat?.isChannel && activeChat?.uid === u.uid) ? theme.rowHoverActive : 'transparent'
                    }}
                  >
                    <img src={user.photoURL} alt="" style={styles.avatar} />
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
          {activeChat ? (
            <>
              {/* HEADER CONTAINER WITH NEW INTERACTION INPUT SEARCH ALIGNMENT */}
              <div style={{ ...styles.chatWindowHeader, backgroundColor: theme.bgHeader, borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  {activeChat.isChannel ? (
                    <div style={{ ...styles.hashtagAvatar, backgroundColor: theme.bgInput, color: theme.textMain, width: '40px', height: '40px', fontSize: '18px' }}>#</div>
                  ) : (
                    <img src={activeChat.photoURL} alt="" style={styles.avatar} />
                  )}
                  <div style={{ marginLeft: '12px' }}>
                    <div style={{ fontWeight: 'bold', color: theme.textMain }}>
                      {activeChat.isChannel ? activeChat.name : activeChat.displayName}
                    </div>
                    {!activeChat.isChannel && activeChat.bio && (
                      <div style={{ fontSize: '12px', color: theme.textSub, fontStyle: 'italic', marginTop: '2px' }}>"{activeChat.bio}"</div>
                    )}
                    {activeChat.isChannel && (
                      <div style={{ fontSize: '11px', color: theme.textSub, marginTop: '2px' }}>Public Room</div>
                    )}
                  </div>
                </div>

                {/* NEW: Text Message Stream Sub-Search Input Form Field */}
                <div style={styles.msgSearchContainer}>
                  <input 
                    type="text"
                    placeholder="🔍 Search messages..."
                    value={messageSearchQuery}
                    onChange={(e) => setMessageSearchQuery(e.target.value)}
                    style={{ ...styles.msgHeaderSearchField, backgroundColor: theme.bgInput, color: theme.textMain, border: `1px solid ${theme.border}` }}
                  />
                  {messageSearchQuery && (
                    <button onClick={() => setMessageSearchQuery('')} style={styles.clearSearchXBtn}>✕</button>
                  )}
                </div>
              </div>

              {/* STREAM RENDER CONTAINER (Swapped from standard messages list array to our new filtered messages array map) */}
              <div style={{ ...styles.messageStream, backgroundColor: theme.bgOuter }}>
                {filteredMessages.length > 0 ? (
                  filteredMessages.map((msg) => {
                    const isMe = msg.senderId === user.uid;
                    return (
                      <div 
                        key={msg.id} 
                        style={{ ...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}
                        onMouseEnter={() => setHoveredMessageId(msg.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        {isMe && hoveredMessageId === msg.id && (
                          <button 
                            onClick={() => handleUnsendMessage(msg.id)}
                            style={{ ...styles.unsendActionBtn, color: theme.unsendBtnColor }}
                          >
                            Unsend 🗑️
                          </button>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '60%' }}>
                          {activeChat.isChannel && !isMe && (
                            <span style={{ fontSize: '11px', color: theme.textSub, marginBottom: '2px', marginLeft: '4px' }}>
                              {msg.senderName}
                            </span>
                          )}
                          <div style={{
                            ...styles.msgBubble,
                            backgroundColor: isMe ? theme.bgBubbleMe : theme.bgBubbleThem,
                            color: isMe ? '#ffffff' : theme.textMain,
                            maxWidth: '100%'
                          }}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.textSub, fontSize: '14px', fontStyle: 'italic' }}>
                    {messageSearchQuery ? "No matching messages found." : "No messages here yet. Start the conversation!"}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} style={{ ...styles.messageInputForm, backgroundColor: theme.bgHeader, borderTop: `1px solid ${theme.border}` }}>
                <input
                  type="text"
                  placeholder={activeChat.isChannel ? `Message ${activeChat.name}...` : `Message ${activeChat.displayName}...`}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ ...styles.desktopInputField, backgroundColor: theme.bgInput, color: theme.textMain, border: `1px solid ${theme.border}` }}
                />
                <button type="submit" style={styles.desktopSendBtn}>Send</button>
              </form>
            </>
          ) : (
            <div style={{ ...styles.emptyStateContainer, backgroundColor: theme.bgOuter }}>
              <h3 style={{ color: theme.textMain }}>No Chat Selected</h3>
              <p style={{ color: theme.textSub }}>Search for a user or select a profile from your recent conversations to start messaging.</p>
            </div>
          )}
        </div>

      </div>

      {/* ACCOUNT PREFERENCES SETTINGS MODAL */}
      {isSettingsOpen && (
        <div style={{ ...styles.modalOverlayFrame, backgroundColor: theme.modalOverlay }}>
          <div style={{ ...styles.modalCard, backgroundColor: theme.bgContainer, border: `1px solid ${theme.border}` }}>
            <h3 style={{ color: theme.textMain, marginTop: 0, marginBottom: '15px' }}>⚙️ App Preferences</h3>
            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                <label style={{ ...styles.modalLabel, color: theme.textSub }}>Custom Display Name</label>
                <input 
                  type="text" 
                  value={customDisplayName}
                  onChange={(e) => setCustomDisplayName(e.target.value)}
                  maxLength={25}
                  style={{ ...styles.modalInputField, backgroundColor: theme.bgInput, color: theme.textMain, border: `1px solid ${theme.border}` }}
                />
              </div>
              <div style={styles.modalActionsRow}>
                <button type="button" onClick={() => setIsSettingsOpen(false)} style={styles.modalCancelBtn}>Cancel</button>
                <button type="submit" style={styles.modalSaveBtn}>Save Profiles</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE CHANNEL POPUP MODAL */}
      {isCreateChannelOpen && (
        <div style={{ ...styles.modalOverlayFrame, backgroundColor: theme.modalOverlay }}>
          <div style={{ ...styles.modalCard, backgroundColor: theme.bgContainer, border: `1px solid ${theme.border}` }}>
            <h3 style={{ color: theme.textMain, marginTop: 0, marginBottom: '15px' }}>➕ Create Public Channel</h3>
            <form onSubmit={handleCreateChannel}>
              <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                <label style={{ ...styles.modalLabel, color: theme.textSub }}>Channel Name</label>
                <input 
                  type="text" 
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="e.g. general-chat, plans, gaming"
                  maxLength={20}
                  style={{ ...styles.modalInputField, backgroundColor: theme.bgInput, color: theme.textMain, border: `1px solid ${theme.border}` }}
                />
              </div>
              <div style={styles.modalActionsRow}>
                <button type="button" onClick={() => setIsCreateChannelOpen(false)} style={styles.modalCancelBtn}>Cancel</button>
                <button type="submit" style={styles.modalSaveBtn}>Create Room</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  loginContainer: { display: 'flex', height: '100vh', width: '100vw', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' },
  loginCard: { padding: '50px', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '400px' },
  loginButton: { padding: '14px 28px', backgroundColor: '#4285F4', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', marginTop: '20px' },
  desktopWrapper: { display: 'flex', width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  desktopAppContainer: { display: 'flex', width: '100%', maxWidth: '1200px', height: '100%', overflow: 'hidden', position: 'relative' },
  sidebar: { width: '350px', minWidth: '320px', display: 'flex', flexDirection: 'column' },
  myProfileHeaderContainer: { display: 'flex', flexDirection: 'column' },
  myProfileHeader: { display: 'flex', alignItems: 'center', padding: '15px 15px 5px 15px' },
  profileText: { marginLeft: '10px', flex: 1 },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' },
  themeToggleBtn: { border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', marginRight: '5px', padding: '4px', userSelect: 'none' },
  settingsGearBtn: { border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', marginRight: '12px', padding: '4px', userSelect: 'none' },
  smallLogoutBtn: { padding: '6px 12px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' },
  bioWidgetWrapper: { padding: '0px 15px 12px 15px' },
  bioStatusTextDisplay: { fontSize: '13px', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' },
  bioInputField: { flex: 1, padding: '6px 10px', borderRadius: '6px', outline: 'none', fontSize: '13px' },
  bioSaveBtn: { padding: '6px 12px', backgroundColor: '#2ecc71', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  searchBoxWrapper: { padding: '12px' },
  searchInput: { width: '100%', padding: '12px', borderRadius: '8px', boxSizing: 'border-box', outline: 'none', fontSize: '14px' },
  userListContainer: { flex: 1, overflowY: 'auto' },
  sectionHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px' },
  createChannelBtn: { border: 'none', background: 'none', color: '#0084ff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  hashtagAvatar: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '14px' },
  sectionLabel: { padding: '10px 15px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' },
  userRow: { display: 'flex', alignItems: 'center', padding: '12px 15px', cursor: 'pointer', transition: 'background 0.2s' },
  userRowTextGroup: { display: 'flex', flexDirection: 'column', marginLeft: '12px', flex: 1, overflow: 'hidden' },
  userRowName: { fontWeight: '500' },
  userRowBioPreview: { fontSize: '12px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' },
  chatWindow: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
  chatWindowHeader: { display: 'flex', alignItems: 'center', padding: '15px 20px', position: 'relative' },
  
  // NEW: Chat Message Action Header Alignment Configurations
  msgSearchContainer: { position: 'relative', display: 'flex', alignItems: 'center' },
  msgHeaderSearchField: { padding: '8px 30px 8px 12px', borderRadius: '18px', width: '200px', outline: 'none', fontSize: '13px', transition: 'width 0.3s' },
  clearSearchXBtn: { position: 'absolute', right: '10px', border: 'none', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '11px' },

  messageStream: { flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  messageRow: { display: 'flex', width: '100%', alignItems: 'center', position: 'relative', gap: '10px' },
  unsendActionBtn: { border: 'none', background: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: '600', padding: '4px 8px', borderRadius: '4px' },
  msgBubble: { padding: '12px 16px', borderRadius: '18px', maxWidth: '60%', fontSize: '15px', lineHeight: '1.4', boxSizing: 'border-box' },
  messageInputForm: { display: 'flex', padding: '15px 20px', alignItems: 'center' },
  desktopInputField: { flex: 1, padding: '14px 18px', borderRadius: '24px', outline: 'none', fontSize: '15px' },
  desktopSendBtn: { marginLeft: '12px', padding: '12px 24px', backgroundColor: '#0084ff', color: '#fff', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold' },
  emptyStateContainer: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '20px' },
  modalOverlayFrame: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  modalCard: { padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '450px', boxShadow: '0 12px 36px rgba(0,0,0,0.15)', textAlign: 'center' },
  modalLabel: { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' },
  modalInputField: { width: '100%', padding: '12px', borderRadius: '8px', boxSizing: 'border-box', outline: 'none', fontSize: '14px' },
  modalActionsRow: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' },
  modalCancelBtn: { padding: '10px 20px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#aaa', fontWeight: '500' },
  modalSaveBtn: { padding: '10px 22px', backgroundColor: '#0084ff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }
};

export default App;