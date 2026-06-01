import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot, where, updateDoc } from 'firebase/firestore';

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

  const chatEndRef = useRef(null);

  // 1. Auth Listener + Sync Profile Info
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Set default profile info if it doesn't exist, don't overwrite existing bio
        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL,
          searchName: currentUser.displayName.toLowerCase()
        }, { merge: true });

        // Fetch our saved bio from Firestore
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

  // 2. Load Recent Chats from Local Caching
  useEffect(() => {
    if (user) {
      const savedChats = localStorage.getItem(`recents_${user.uid}`);
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats);
        
        // Listen to live bio updates for everyone in your history sidebar log
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

  // 3. Live Search Users (Includes showing their custom bios)
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

    // Save profile baseline data to Recent History log
    setRecentChats((prev) => {
      const filtered = prev.filter((u) => u.uid !== activeChatUser.uid);
      const updated = [activeChatUser, ...filtered];
      localStorage.setItem(`recents_${user.uid}`, JSON.stringify(updated));
      return updated;
    });

    return () => unsubscribe();
  }, [activeChatUser, user]);

  // Auto Scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = () => signInWithPopup(auth, googleProvider).catch(err => console.error(err));
  const handleLogout = () => { signOut(auth); setActiveChatUser(null); };

  // 5. Save Custom Bio Status to Cloud
  const handleSaveBio = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        bio: myBio
      });
      setIsEditingBio(false);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // 6. Submit Send Message Text
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

  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <h2>QuickChat Desktop</h2>
          <p>Sign in with Google to talk to your person.</p>
          <button onClick={handleLogin} style={styles.loginButton}>Sign in with Google</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.desktopWrapper}>
      <div style={styles.desktopAppContainer}>
        
        {/* SIDEBAR PANEL */}
        <div style={styles.sidebar}>
          
          {/* USER PROFILE HEADER SECTION WITH BIO BUILDER */}
          <div style={styles.myProfileHeaderContainer}>
            <div style={styles.myProfileHeader}>
              <img src={user.photoURL} alt="" style={styles.avatar} />
              <div style={styles.profileText}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#333' }}>{user.displayName}</div>
                <div style={{ fontSize: '11px', color: '#2ecc71', fontWeight: 'bold' }}>Online 🟢</div>
              </div>
              <button onClick={handleLogout} style={styles.smallLogoutBtn}>Exit</button>
            </div>
            
            {/* Custom Bio Status Widget Block */}
            <div style={styles.bioWidgetWrapper}>
              {isEditingBio ? (
                <div style={{ display: 'flex', gap: '5px', width: '100%' }}>
                  <input 
                    type="text" 
                    value={myBio} 
                    onChange={(e) => setMyBio(e.target.value)} 
                    placeholder="Set a status update..." 
                    maxLength={60}
                    style={styles.bioInputField}
                  />
                  <button onClick={handleSaveBio} style={styles.bioSaveBtn}>Save</button>
                </div>
              ) : (
                <div onClick={() => setIsEditingBio(true)} style={styles.bioStatusTextDisplay}>
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
              style={styles.searchInput}
            />
          </div>

          <div style={styles.userListContainer}>
            {searchQuery ? (
              <>
                <div style={styles.sectionLabel}>Search Results</div>
                {searchResults.map((u) => (
                  <div key={u.uid} onClick={() => { setActiveChatUser(u); setSearchQuery(''); }} style={styles.userRow}>
                    <img src={u.photoURL} alt="" style={styles.avatar} />
                    <div style={styles.userRowTextGroup}>
                      <span style={styles.userRowName}>{u.displayName}</span>
                      {u.bio && <span style={styles.userRowBioPreview}>"{u.bio}"</span>}
                    </div>
                  </div>
                ))}
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
                    <div style={styles.userRowTextGroup}>
                      <span style={styles.userRowName}>{u.displayName}</span>
                      {u.bio && <span style={styles.userRowBioPreview}>"{u.bio}"</span>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* MESSAGING GRAPHIC DISPLAY STREAM PANEL */}
        <div style={styles.chatWindow}>
          {activeChatUser ? (
            <>
              <div style={styles.chatWindowHeader}>
                <img src={activeChatUser.photoURL} alt="" style={styles.avatar} />
                <div style={{ marginLeft: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{activeChatUser.displayName}</div>
                  {activeChatUser.bio && <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginTop: '2px' }}>"{activeChatUser.bio}"</div>}
                </div>
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
              <h3 style={{ color: '#555' }}>Your Private Chat</h3>
              <p style={{ color: '#888' }}>Select your girlfriend's contact from history log or use search bar to start messaging.</p>
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
  desktopWrapper: { display: 'flex', width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', overflow: 'hidden' },
  desktopAppContainer: { display: 'flex', width: '100%', maxWidth: '1200px', height: '100%', backgroundColor: '#fff', boxShadow: '0 0 20px rgba(0,0,0,0.05)', overflow: 'hidden' },
  sidebar: { width: '350px', minWidth: '320px', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', backgroundColor: '#f7f8fa' },
  myProfileHeaderContainer: { display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0' },
  myProfileHeader: { display: 'flex', alignItems: 'center', padding: '15px 15px 5px 15px' },
  profileText: { marginLeft: '10px', flex: 1 },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' },
  smallLogoutBtn: { padding: '6px 12px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' },
  
  // Custom status components layout elements
  bioWidgetWrapper: { padding: '0px 15px 12px 15px' },
  bioStatusTextDisplay: { fontSize: '13px', color: '#555', backgroundColor: '#f0f2f5', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' },
  bioInputField: { flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontSize: '13px' },
  bioSaveBtn: { padding: '6px 12px', backgroundColor: '#2ecc71', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  
  searchBoxWrapper: { padding: '12px' },
  searchInput: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box', outline: 'none', fontSize: '14px', color: '#333', backgroundColor: '#fff' },
  userListContainer: { flex: 1, overflowY: 'auto' },
  sectionLabel: { padding: '10px 15px', fontSize: '12px', color: '#65676b', fontWeight: 'bold', textTransform: 'uppercase' },
  userRow: { display: 'flex', alignItems: 'center', padding: '12px 15px', cursor: 'pointer', transition: 'background 0.2s' },
  userRowTextGroup: { display: 'flex', flexDirection: 'column', marginLeft: '12px', flex: 1, overflow: 'hidden' },
  userRowName: { fontWeight: '500', color: '#333' },
  userRowBioPreview: { fontSize: '12px', color: '#777', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' },
  
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