import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, query, orderBy, onSnapshot } from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef(null);

  // 1. Listen for Auth State changes (Login / Logout)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Automatically add/update the user in the Cloud Firestore database
        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL,
        }, { merge: true }); // merge: true prevents overwriting their data if they login again
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Listen for real-time cloud messages
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [user]);

  // Auto-scroll to the bottom of the chat when a new message arrives
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Handle Google Login
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed: ", error);
    }
  };

  // 4. Handle Logout
  const handleLogout = () => {
    signOut(auth);
  };

  // 5. Send Message to the Cloud
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '') return;

    await addDoc(collection(db, 'messages'), {
      text: newMessage,
      createdAt: new Date(),
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL
    });

    setNewMessage('');
  };

  // --- RENDERING VIEWS ---

  // LOGIN SCREEN
  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <h2>Welcome to QuickChat</h2>
          <p>Sign up or sign in below to start chatting.</p>
          <button onClick={handleLogin} style={styles.loginButton}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // CHAT SCREEN
  return (
    <div style={styles.appContainer}>
      {/* Header bar */}
      <header style={styles.header}>
        <div style={styles.userInfo}>
          <img src={user.photoURL} alt="Avatar" style={styles.avatar} />
          <span>Logged in as <strong>{user.displayName}</strong></span>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>Sign Out</button>
      </header>

      {/* Message Area */}
      <div style={styles.chatBox}>
        {messages.map((msg) => {
          const isMe = msg.uid === user.uid;
          return (
            <div 
              key={msg.id} 
              style={{
                ...styles.messageRow, 
                justifyContent: isMe ? 'flex-end' : 'flex-start'
              }}
            >
              {!isMe && <img src={msg.photoURL} alt="" style={styles.chatAvatar} />}
              <div style={{
                ...styles.messageBubble,
                backgroundColor: isMe ? '#007fff' : '#f0f0f0',
                color: isMe ? '#fff' : '#000',
              }}>
                {!isMe && <div style={styles.senderName}>{msg.displayName}</div>}
                <div>{msg.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSendMessage} style={styles.inputForm}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          style={styles.inputField}
        />
        <button type="submit" style={styles.sendButton}>Send</button>
      </form>
    </div>
  );
}

// Basic, clean inline styles to avoid messing with CSS files for now
const styles = {
  loginContainer: { display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafafa', fontFamily: 'sans-serif' },
  loginCard: { padding: '40px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'center' },
  loginButton: { padding: '12px 24px', backgroundColor: '#4285F4', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' },
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', border: '1px solid #ddd' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', backgroundColor: '#fff', borderBottom: '1px solid #ddd' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%' },
  chatAvatar: { width: '28px', height: '28px', borderRadius: '50%', marginRight: '8px', alignSelf: 'flex-end' },
  logoutButton: { padding: '6px 12px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  chatBox: { flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#f9f9f9', display: 'flex', flexDirection: 'column', gap: '12px' },
  messageRow: { display: 'flex', alignItems: 'flex-end' },
  messageBubble: { padding: '10px 14px', borderRadius: '16px', maxWidth: '70%', fontSize: '15px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  senderName: { fontSize: '11px', color: '#666', marginBottom: '3px', fontWeight: 'bold' },
  inputForm: { display: 'flex', padding: '10px', backgroundColor: '#fff', borderTop: '1px solid #ddd' },
  inputField: { flex: 1, padding: '12px', borderRadius: '20px', border: '1px solid #ccc', outline: 'none', fontSize: '15px', paddingLeft: '16px' },
  sendButton: { marginLeft: '10px', padding: '0 20px', backgroundColor: '#007fff', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }
};

export default App;